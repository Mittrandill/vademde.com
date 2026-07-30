import { useEffect } from 'react';
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
] as const;

// docs/06-teknik-mimari.md §10.6.3 — aktif çalışma alanına filtrelenmiş postgres_changes
// aboneliği; gelen her olayda ilgili React Query anahtarları geçersiz kılınır.
export function useWorkspaceRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const invalidate = (entity: string) => {
      queryClient.invalidateQueries({ queryKey: [workspaceId, entity] });
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
