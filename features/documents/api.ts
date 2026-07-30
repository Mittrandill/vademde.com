import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';
import { generateUuid } from '@/utils/uuid';
import { hashArrayBuffer } from '@/utils/hash';

export type FinancialDocument = Tables<'financial_documents'>;
export type DocumentField = Tables<'document_fields'>;
export type DocumentLineItem = Tables<'document_line_items'>;

const BUCKET = 'financial-documents';

export interface UploadDocumentInput {
  workspaceId: string;
  uri: string;
  fileName: string;
  mimeType: string;
  contentHash?: string;
}

// docs/12-mvp-kabul-kriterleri.md — "Aynı belge tekrar yüklendiğinde mükerrer uyarısı gösterilir."
// Discarded (kullanıcının reddettiği) belgeler mükerrer sayılmaz.
export async function findDuplicateDocument(
  workspaceId: string,
  contentHash: string
): Promise<FinancialDocument | null> {
  const { data, error } = await supabase
    .from('financial_documents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('content_hash', contentHash)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// docs/06-teknik-mimari.md §10.3 — belge güvenli storage alanına yüklenir,
// ardından Edge Function iş kaydı oluşturup Gemini analizini çalıştırır.
export async function uploadAndCreateDocument({
  workspaceId,
  uri,
  fileName,
  mimeType,
  contentHash,
}: UploadDocumentInput): Promise<FinancialDocument> {
  const documentId = generateUuid();
  const storagePath = `${workspaceId}/${documentId}/${fileName}`;

  // React Native'in Blob polyfill'i yerel file:// URI'lerinde içerik türünü yanlış
  // algılayabildiği için (ör. "text/plain"), arrayBuffer + açık contentType kullanılır.
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('financial_documents')
    .insert({
      id: documentId,
      workspace_id: workspaceId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size_bytes: arrayBuffer.byteLength,
      content_hash: contentHash ?? hashArrayBuffer(arrayBuffer),
      status: 'uploaded',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// process-document 402 + { quotaExceeded: true } döndürdüğünde ayırt edilebilir olması için
// (docs/10-abonelik-gelir-modeli.md — kota dolduğunda kullanıcıya manuel giriş/plan yükseltme sunulur).
export class QuotaExceededError extends Error {
  readonly quotaExceeded = true;
}

export async function startProcessing(documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('process-document', {
    body: { documentId },
  });
  if (!error) return;

  const context = (error as { context?: Response }).context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body?.quotaExceeded) {
        throw new QuotaExceededError(body.error ?? 'Aylık OCR kotanız doldu');
      }
    } catch (parseError) {
      if (parseError instanceof QuotaExceededError) throw parseError;
      // Gövde JSON değilse orijinal hatayı fırlat.
    }
  }
  throw error;
}

export async function getDocument(documentId: string): Promise<FinancialDocument> {
  const { data, error } = await supabase.from('financial_documents').select('*').eq('id', documentId).single();
  if (error) throw error;
  return data;
}

export async function getDocumentLineItems(documentId: string): Promise<DocumentLineItem[]> {
  const { data, error } = await supabase
    .from('document_line_items')
    .select('*')
    .eq('document_id', documentId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getDocumentFields(documentId: string): Promise<DocumentField[]> {
  const { data, error } = await supabase
    .from('document_fields')
    .select('*')
    .eq('document_id', documentId)
    .order('confidence', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function markDocumentConfirmed(
  documentId: string,
  linked: { obligationId?: string; transactionId?: string }
): Promise<void> {
  const { error } = await supabase
    .from('financial_documents')
    .update({
      status: 'confirmed',
      obligation_id: linked.obligationId ?? null,
      transaction_id: linked.transactionId ?? null,
    })
    .eq('id', documentId);
  if (error) throw error;
}

export async function discardDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('financial_documents').update({ status: 'discarded' }).eq('id', documentId);
  if (error) throw error;
}
