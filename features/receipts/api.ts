import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/services/supabase';
import { getMySubscription, getPlanLimits, type PlanCode } from '@/features/subscriptions/api';
import {
  getDocument,
  getSignedUrl,
  uploadAndCreateDocument,
  type FinancialDocument,
} from '@/features/documents/api';
import {
  ACTIVE_OBLIGATION_STATUSES,
  listObligations,
  type ObligationWithRelations,
} from '@/features/obligations/api';

// docs/04-ocr-belge-isleme.md §7.7 — dekont gelecekteki bir borç değil, gerçekleşmiş bir para
// hareketidir; bu yüzden bir ödemeye (payments) "kanıt" olarak bağlanır. Dosya mevcut
// financial_documents + 'financial-documents' bucket altyapısında durur (document_type
// 'banka_dekontu'); ödeme satırı payments.receipt_document_id ile ona tek dokunuşla ulaşır
// (bkz. supabase/migrations/20260929120000_add_payment_receipts.sql).
export const RECEIPT_DOCUMENT_TYPE = 'banka_dekontu';

export interface PendingReceipt {
  uri: string;
  fileName: string;
  mimeType: string;
}

// Dekont ekleme ve arşivleme "Belge arşivi"dir (plan_limits.document_archive: Plus, İşletme).
// Bu yalnızca arayüz yönlendirmesidir; gerçek kapı sunucudaki payments tetikleyicisidir
// (RECEIPT_ARCHIVE_PLAN_REQUIRED), bu yüzden burası yanlış "true" dönse bile veri sızmaz.
export function useDocumentArchiveAccess(): { allowed: boolean; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['document-archive-access'],
    queryFn: async () => {
      const subscription = await getMySubscription();
      const plan = (subscription?.plan ?? 'free') as PlanCode;
      const limits = await getPlanLimits(plan);
      return limits.document_archive;
    },
  });
  return { allowed: query.data === true, isLoading: query.isPending };
}

export interface AttachReceiptFileInput extends PendingReceipt {
  workspaceId: string;
  obligationId?: string | null;
  transactionId?: string | null;
  amountMinor?: number | null;
  currencyCode?: string | null;
}

// Dekont dosyasını yükler ve onaylanmış bir arşiv belgesi olarak kaydeder. retainOriginal her
// zaman true: dekontun tüm amacı sonradan açılabilmesidir, "işlem sonrası sil" tercihi burada
// uygulanmaz.
export async function attachReceiptFile({
  workspaceId,
  uri,
  fileName,
  mimeType,
  obligationId,
  transactionId,
  amountMinor,
  currencyCode,
}: AttachReceiptFileInput): Promise<FinancialDocument> {
  const document = await uploadAndCreateDocument({
    workspaceId,
    uri,
    fileName,
    mimeType,
    retainOriginal: true,
  });

  const { data, error } = await supabase
    .from('financial_documents')
    .update({
      status: 'confirmed',
      document_type: RECEIPT_DOCUMENT_TYPE,
      obligation_id: obligationId ?? null,
      transaction_id: transactionId ?? null,
      total_amount_minor: amountMinor ?? null,
      currency_code: currencyCode ?? null,
    })
    .eq('id', document.id)
    .select('*')
    .single();
  if (error) {
    await discardReceiptFile(document);
    throw error;
  }
  return data;
}

// Ödeme kaydı başarısız olursa yüklenen dekont hiçbir kayda bağlanmadan kalmasın diye en iyi
// çabayla temizlenir (dosya + belge satırı). Temizlik hatası asıl hatayı gölgelememeli.
export async function discardReceiptFile(document: Pick<FinancialDocument, 'id' | 'storage_path'>): Promise<void> {
  try {
    await supabase.storage.from('financial-documents').remove([document.storage_path]);
    await supabase.from('financial_documents').delete().eq('id', document.id);
  } catch (error) {
    console.warn('Dekont temizlenemedi', error instanceof Error ? error.message : error);
  }
}

// Ödeme kaydedildikten sonra belgenin ilişkili kayıtlarını doldurur (belge → borç/hareket
// bağlantısı; docs/00 kural 6: belge ile finans kaydı birbirine bağlı saklanır).
export async function linkReceiptDocument(
  documentId: string,
  linked: { obligationId?: string | null; transactionId?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('financial_documents')
    .update({
      obligation_id: linked.obligationId ?? null,
      transaction_id: linked.transactionId ?? null,
    })
    .eq('id', documentId);
  if (error) throw error;
}

export async function setPaymentsReceipt(paymentIds: string[], documentId: string | null): Promise<void> {
  if (paymentIds.length === 0) return;
  const { error } = await supabase
    .from('payments')
    .update({ receipt_document_id: documentId })
    .in('id', paymentIds);
  if (error) throw error;
}

// Ödemeye bağlı dekontu tek dokunuşla açar. Kısa ömürlü imzalı adres alınır ve sistem tarayıcısında
// (görsel ya da PDF) gösterilir; dosya kalıcı bir genel bağlantı olarak hiçbir yerde tutulmaz.
export async function openReceipt(documentId: string): Promise<void> {
  const document = await getDocument(documentId);
  const url = await getSignedUrl(document.storage_path);
  await WebBrowser.openBrowserAsync(url);
}

// --- Eşleştirme -------------------------------------------------------------------------------

// Türkçe ticari unvan ekleri ve noktalama farkları yok sayılır: "Migros Ticaret A.Ş." ile kayıtlı
// "Migros" aynı taraf sayılsın (bkz. app/documents/[id]/review.tsx normalizeCounterpartyName).
const LEGAL_SUFFIX_PATTERN =
  /\b(a\.?ş\.?|ltd\.?|şti\.?|limited|anonim|tic\.?|ticaret|san\.?|sanayi|paz\.?|pazarlama|co\.?|inc\.?)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,]/g, ' ')
    .replace(LEGAL_SUFFIX_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameScore(target: string, candidate: string | null | undefined): number {
  if (!target || !candidate) return 0;
  const normalizedCandidate = normalizeName(candidate);
  if (!normalizedCandidate) return 0;
  if (normalizedCandidate === target) return 3;
  if (
    (normalizedCandidate.length >= 3 && target.includes(normalizedCandidate)) ||
    (target.length >= 3 && normalizedCandidate.includes(target))
  ) {
    return 2;
  }
  const targetTokens = new Set(target.split(' ').filter((token) => token.length >= 4));
  const shared = normalizedCandidate.split(' ').some((token) => token.length >= 4 && targetTokens.has(token));
  return shared ? 1 : 0;
}

export interface ReceiptMatchInstallment {
  id: string;
  installment_number: number;
  remaining_amount_minor: number;
  due_date: string;
}

export interface ReceiptMatch {
  obligation: ObligationWithRelations;
  installment: ReceiptMatchInstallment | null;
  score: number;
  /** "Tutar eşleşti", "Karşı taraf eşleşti" gibi kullanıcıya gösterilen gerekçeler. */
  reasons: string[];
  /** Bu eşleşmeye ödeme olarak yazılacak tutar (taksit/kayıt kalanını aşmaz). */
  payMinor: number;
}

interface FindReceiptMatchesInput {
  workspaceId: string;
  /** Dekonttaki para yönü: 'expense' borç ödemesi (payable), 'income' tahsilat (receivable). */
  direction: 'expense' | 'income';
  amountMinor: number;
  counterpartyName: string | null;
}

// docs/09-kullanici-akislari.md "Dekont eşleştirme" — dekont, mevcut açık borç/alacaklardan
// hangisine ait olabilir? Öneri üretir, hiçbir şeyi kendi başına kaydetmez: kullanıcı seçer ve
// onaylar (docs/00 kural 1). Tutar (taksit ya da kalan) ve karşı taraf adı üzerinden puanlanır.
export async function findReceiptMatches({
  workspaceId,
  direction,
  amountMinor,
  counterpartyName,
}: FindReceiptMatchesInput): Promise<ReceiptMatch[]> {
  const obligations = await listObligations({
    workspaceId,
    direction: direction === 'expense' ? 'payable' : 'receivable',
    statuses: ACTIVE_OBLIGATION_STATUSES,
    pageSize: 200,
  });
  if (obligations.length === 0) return [];

  const { data: installments, error } = await supabase
    .from('installments')
    .select('id, obligation_id, installment_number, remaining_amount_minor, due_date')
    .in(
      'obligation_id',
      obligations.map((obligation) => obligation.id)
    )
    .gt('remaining_amount_minor', 0)
    .order('due_date', { ascending: true });
  if (error) throw error;

  const target = counterpartyName ? normalizeName(counterpartyName) : '';
  const matches: ReceiptMatch[] = [];

  for (const obligation of obligations) {
    const nameHit = Math.max(nameScore(target, obligation.counterparty?.name), nameScore(target, obligation.title));
    const exactInstallment = (installments ?? []).find(
      (installment) =>
        installment.obligation_id === obligation.id && installment.remaining_amount_minor === amountMinor
    );
    const amountHit = exactInstallment || obligation.remaining_amount_minor === amountMinor;

    const score = nameHit + (amountHit ? 3 : 0);
    if (score < 3) continue;

    const reasons: string[] = [];
    if (amountHit) reasons.push(exactInstallment ? 'Taksit tutarı eşleşti' : 'Kalan tutar eşleşti');
    if (nameHit >= 2) reasons.push('Karşı taraf eşleşti');
    else if (nameHit === 1) reasons.push('Karşı taraf benziyor');

    const nextInstallment = (installments ?? []).find((installment) => installment.obligation_id === obligation.id);
    const installment = exactInstallment ?? (nextInstallment && !amountHit ? nextInstallment : null);
    const payCap = installment ? installment.remaining_amount_minor : obligation.remaining_amount_minor;

    matches.push({
      obligation,
      installment: installment
        ? {
            id: installment.id,
            installment_number: installment.installment_number,
            remaining_amount_minor: installment.remaining_amount_minor,
            due_date: installment.due_date,
          }
        : null,
      score,
      reasons,
      payMinor: Math.min(amountMinor, payCap),
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || (a.obligation.due_date ?? '').localeCompare(b.obligation.due_date ?? ''))
    .slice(0, 3);
}

// --- Belge arşivi -----------------------------------------------------------------------------

export interface ReceiptArchiveItem {
  documentId: string;
  fileName: string;
  mimeType: string;
  title: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  amountMinor: number | null;
  currencyCode: string;
  /** Ödeme/hareket tarihi; yoksa belgenin yüklenme tarihi (ISO). */
  date: string;
  /** Dekontun bağlı olduğu borç/alacak; bağımsız hareket dekontlarında null. */
  obligationId: string | null;
}

interface ArchiveDocumentRow {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  total_amount_minor: number | null;
  currency_code: string | null;
  counterparty_name: string | null;
  transaction_id: string | null;
}

interface ArchivePaymentRow {
  amount_minor: number;
  paid_at: string;
  receipt_document_id: string;
  obligation: {
    id: string;
    title: string;
    currency_code: string;
    counterparty_id: string | null;
    counterparty: { name: string } | null;
  } | null;
}

interface ArchiveTransactionRow {
  id: string;
  amount_minor: number;
  currency_code: string;
  occurred_at: string;
  description: string | null;
  counterparty_id: string | null;
  counterparty: { name: string } | null;
}

// Belge arşivi (Plus): dosyası saklanan ve onaylanmış tüm dekontlar. Her dekont, bağlı olduğu
// ödemeden (borç/alacak + cari) ya da bağımsız hareketten zenginleştirilir; böylece hem genel
// arşivde hem cari sayfasında "hangi ödemenin dekontu" bilgisi gösterilir. Dosyası silinmiş
// (ücretsiz planda saklanmayan) belgeler listelenmez — açılamayacak satır göstermenin anlamı yok.
export async function listReceiptArchive({
  workspaceId,
  counterpartyId,
}: {
  workspaceId: string;
  counterpartyId?: string | null;
}): Promise<ReceiptArchiveItem[]> {
  const { data: documents, error } = await supabase
    .from('financial_documents')
    .select('id, file_name, mime_type, created_at, total_amount_minor, currency_code, counterparty_name, transaction_id')
    .eq('workspace_id', workspaceId)
    .eq('document_type', RECEIPT_DOCUMENT_TYPE)
    .eq('status', 'confirmed')
    .eq('retain_original', true)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const docs = (documents ?? []) as ArchiveDocumentRow[];
  if (docs.length === 0) return [];

  const documentIds = docs.map((d) => d.id);
  const transactionIds = docs.map((d) => d.transaction_id).filter((v): v is string => !!v);

  const [paymentsResult, transactionsResult] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'amount_minor, paid_at, receipt_document_id, obligation:obligations(id, title, currency_code, counterparty_id, counterparty:counterparties(name))'
      )
      .in('receipt_document_id', documentIds)
      .order('paid_at', { ascending: false }),
    transactionIds.length > 0
      ? supabase
          .from('transactions')
          .select('id, amount_minor, currency_code, occurred_at, description, counterparty_id, counterparty:counterparties(name)')
          .in('id', transactionIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (paymentsResult.error) throw paymentsResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  const payments = (paymentsResult.data ?? []) as unknown as ArchivePaymentRow[];
  const transactions = (transactionsResult.data ?? []) as unknown as ArchiveTransactionRow[];

  const items: ReceiptArchiveItem[] = docs.map((doc) => {
    const linkedPayments = payments.filter((p) => p.receipt_document_id === doc.id);
    const first = linkedPayments[0];
    const transaction = transactions.find((t) => t.id === doc.transaction_id);

    if (first?.obligation) {
      return {
        documentId: doc.id,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        title: first.obligation.title,
        counterpartyId: first.obligation.counterparty_id,
        counterpartyName: first.obligation.counterparty?.name ?? null,
        amountMinor: linkedPayments.reduce((sum, p) => sum + p.amount_minor, 0),
        currencyCode: first.obligation.currency_code,
        date: first.paid_at,
        obligationId: first.obligation.id,
      };
    }
    if (transaction) {
      return {
        documentId: doc.id,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        title: transaction.description?.trim() || 'Banka dekontu',
        counterpartyId: transaction.counterparty_id,
        counterpartyName: transaction.counterparty?.name ?? null,
        amountMinor: transaction.amount_minor,
        currencyCode: transaction.currency_code,
        date: transaction.occurred_at,
        obligationId: null,
      };
    }
    return {
      documentId: doc.id,
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      title: doc.counterparty_name ?? 'Banka dekontu',
      counterpartyId: null,
      counterpartyName: doc.counterparty_name,
      amountMinor: doc.total_amount_minor,
      currencyCode: doc.currency_code ?? 'TRY',
      date: doc.created_at,
      obligationId: null,
    };
  });

  const filtered = counterpartyId ? items.filter((item) => item.counterpartyId === counterpartyId) : items;
  return filtered.sort((a, b) => b.date.localeCompare(a.date));
}

// --- Hareket (transaction) dekontları ---------------------------------------------------------

// Bir harekete bağlı dekont: belge → hareket bağlantısı financial_documents.transaction_id'de tutulur
// (ödemeye bağlı dekontlar payments.receipt_document_id'yi kullanır, bkz. yukarısı). Aynı hareketin
// birden çok dekontu olmaz; en yenisi döner. Dosyası saklanmayan (silinmiş) belge sayılmaz.
export async function getTransactionReceipt(transactionId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('financial_documents')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('document_type', RECEIPT_DOCUMENT_TYPE)
    .eq('status', 'confirmed')
    .eq('retain_original', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Harekete bağlı mevcut dekont dosyalarını (belge satırı + Storage dosyası) siler; yenisiyle
// değiştirilirken ya da kullanıcı kaldırdığında çağrılır.
export async function removeTransactionReceipts(transactionId: string, exceptDocumentId?: string): Promise<void> {
  const { data, error } = await supabase
    .from('financial_documents')
    .select('id, storage_path')
    .eq('transaction_id', transactionId)
    .eq('document_type', RECEIPT_DOCUMENT_TYPE);
  if (error) throw error;
  for (const document of data ?? []) {
    if (document.id === exceptDocumentId) continue;
    await discardReceiptFile(document);
  }
}
