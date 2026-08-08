import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';

const WORKSPACE_TABLES = [
  'accounts',
  'categories',
  'counterparties',
  'transactions',
  'obligations',
  'installments',
  'payments',
  'financial_documents',
  'document_processing_jobs',
  'reminders',
] as const;

// docs/06-teknik-mimari.md §10.6.3 — aktif çalışma alanına filtrelenmiş postgres_changes
// aboneliği; gelen her olayda ilgili React Query anahtarları geçersiz kılınır.
export function useWorkspaceRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    // Realtime olayı, cihazın kendi kaydettiği satırdan da geri döner; invalidation
    // hemen çalışırsa, save ekranı hâlâ mount'tayken (başarı Alert'i / geri navigasyon
    // sırasında) arka planda yeniden render tetikler ve Fabric çökme sınıfını (bkz.
    // utils/alerts.ts) tüm kayıt türlerine yayardı. Bu yüzden invalidation, aktif
    // etkileşim/animasyon bitene kadar InteractionManager ile ertelenir; ayrıca aynı
    // entity için kısa aralıkta gelen olaylar tek bir ertelenmiş çağrıda birleştirilir.
    const pending = new Set<string>();
    let scheduled = false;
    const invalidate = (entity: string) => {
      pending.add(entity);
      if (scheduled) return;
      scheduled = true;
      InteractionManager.runAfterInteractions(() => {
        const entities = [...pending];
        pending.clear();
        scheduled = false;
        for (const key of entities) {
          queryClient.invalidateQueries({ queryKey: [workspaceId, key] });
        }
      });
    };

    let channel = supabase.channel(`workspace-${workspaceId}`);
    for (const table of WORKSPACE_TABLES) {
      const entity =
        table === 'installments' || table === 'payments'
          ? 'obligations'
          : table === 'document_processing_jobs'
            ? 'financial_documents'
            : table;
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
        () => invalidate(entity)
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
