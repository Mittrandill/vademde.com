import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';
import { createWorkspaceRefreshQueue } from '@/services/workspaceRefresh';

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
// aboneliği; satır olayları birleştirilip kayıt işlemi tamamlanınca önbellek tazelenir.
export function useWorkspaceRealtime(workspaceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    // Bir kayıt çok sayıda satır olayı üretir (ör. 36 taksit + geçmiş ödemeler).
    // Yazma bitince çalışma alanını tek seferde yenile; ekran geçişi güvenliğini koru.
    const refresh = createWorkspaceRefreshQueue(
      queryClient,
      workspaceId,
      (callback) => InteractionManager.runAfterInteractions(callback),
    );

    let channel = supabase.channel(`workspace-${workspaceId}`);
    for (const table of WORKSPACE_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
        () => refresh.enqueue()
      );
    }
    channel.subscribe();

    return () => {
      refresh.dispose();
      supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
