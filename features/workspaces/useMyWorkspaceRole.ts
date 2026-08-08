import { useQuery } from '@tanstack/react-query';

import { getMyWorkspaceRole, type WorkspaceRole } from '@/features/workspaces/members';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

// Aktif çalışma alanındaki rolü döner ve UI'yi buna göre gizlemek için `canEdit`/`isViewer`
// bayrakları sağlar. Güvenlik yaptırımı RLS'tedir; bu yalnızca görüntüsel bir kolaylıktır
// (viewer'a yazma butonu göstermeyip, RLS hatasıyla karşılaşmasını önlemek için).
export function useMyWorkspaceRole(): {
  role: WorkspaceRole | null;
  canEdit: boolean;
  isViewer: boolean;
  isLoading: boolean;
} {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const query = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.myWorkspaceRole(activeWorkspaceId) : ['my-role', 'disabled'],
    queryFn: () => getMyWorkspaceRole(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const role = query.data ?? null;
  // Rol henüz yüklenmediyse varsayılan olarak düzenlemeye izin verilir (owner/editor çoğunluk);
  // yükleme sonrası viewer ise butonlar gizlenir. Yazma yine de RLS ile korunur.
  return {
    role,
    canEdit: role === null ? true : role === 'owner' || role === 'editor',
    isViewer: role === 'viewer',
    isLoading: query.isLoading,
  };
}
