import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { getWorkspaceEntitlements } from './api';

export function useWorkspaceEntitlements(workspaceId?: string | null) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const id = workspaceId === undefined ? activeWorkspaceId : workspaceId;
  const query = useQuery({
    queryKey: queryKeys.workspaceEntitlements(id),
    queryFn: () => getWorkspaceEntitlements(id!),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: 60_000,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}
