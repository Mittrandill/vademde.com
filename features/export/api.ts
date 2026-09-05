import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { supabase } from '@/services/supabase';

// docs/07-guvenlik-gizlilik.md — kullanıcı kendi verisinin tamamını her zaman dışa
// aktarabilmelidir (KVKK/GDPR veri taşınabilirliği). Bu yüzden TAM VERİ DIŞA AKTARIMI
// bilerek plan limitine bağlanmaz; plan_limits.unlimited_export yalnızca RAPOR
// çıktılarının (analiz PDF/CSV) kapsamını sınırlar — bkz. app/reports/index.tsx.
//
// Belge DOSYALARI bu pakete girmez: private bucket'taki orijinal görseller yüzlerce MB
// olabilir ve tek bir paylaşım dosyasına sığmaz. Bunun yerine belge kayıtlarının meta
// verisi (tür, tutar, tarih, güven, storage yolu) dışa aktarılır.
const EXPORTED_TABLES = [
  'accounts',
  'categories',
  'counterparties',
  'transactions',
  'obligations',
  'installments',
  'payments',
  'financial_documents',
  'reminders',
] as const;

export interface WorkspaceExport {
  formatVersion: 1;
  exportedAt: string;
  workspace: Record<string, unknown> | null;
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
}

export async function buildWorkspaceExport(workspaceId: string): Promise<WorkspaceExport> {
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  // Sıralı çekilir, paralel değil: büyük çalışma alanlarında dokuz eşzamanlı sorgu
  // Supabase bağlantı havuzunu gereksiz zorluyor ve mobilde iptal edilen istekler
  // yarım paket üretebiliyordu.
  for (const table of EXPORTED_TABLES) {
    const { data, error } = await supabase.from(table).select('*').eq('workspace_id', workspaceId);
    if (error) throw error;
    tables[table] = data ?? [];
    counts[table] = data?.length ?? 0;
  }

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    workspace: workspace ?? null,
    tables,
    counts,
  };
}

function safeFileName(name: string): string {
  const slug = name
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'calisma-alani';
}

// Paylaşım sayfasına gerçek bir DOSYA verilir (Share.share ile metin göndermek yerine):
// tam veri paketi birkaç MB olabilir ve mesaj gövdesine sığmaz; ayrıca kullanıcı dosyayı
// Dosyalar/iCloud/Drive'a kaydedip gerçek bir yedek olarak saklayabilmelidir.
export async function exportWorkspaceJson(workspaceId: string, workspaceName: string): Promise<void> {
  const payload = await buildWorkspaceExport(workspaceId);
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `vademde-${safeFileName(workspaceName)}-${stamp}.json`);

  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Vademde Veri Yedeği',
      UTI: 'public.json',
    });
  }
}
