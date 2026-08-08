// Aşama 2 — Ekip paylaşımı istemci katmanı. Üyelik, roller ve davet kodları.
// Tüm yetki kontrolleri sunucuda (SECURITY DEFINER RPC'ler + RLS) yapılır; buradaki
// fonksiyonlar yalnızca çağrı sarmalayıcılarıdır. Roller: owner | editor | viewer.
import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceMember {
  user_id: string;
  role: WorkspaceRole;
  full_name: string | null;
  email: string | null;
  joined_at: string;
}

export type WorkspaceInvite = Tables<'workspace_invites'>;

// Aktif kullanıcının belirtilen çalışma alanındaki rolü. UI'yi (yazma butonlarını,
// yönetim ekranlarını) buna göre gizler/gösterir; asıl yaptırım RLS'tedir.
export async function getMyWorkspaceRole(workspaceId: string): Promise<WorkspaceRole | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as WorkspaceRole | undefined) ?? null;
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase.rpc('list_workspace_members', { p_workspace_id: workspaceId });
  if (error) throw error;
  return (data ?? []) as WorkspaceMember[];
}

// Sahibin gördüğü aktif (iptal edilmemiş) davetler. RLS yalnızca sahibe okuma verir.
export async function listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createWorkspaceInvite(input: {
  workspaceId: string;
  role: 'editor' | 'viewer';
  label?: string | null;
  expiresAt?: string | null;
  maxUses?: number | null;
}): Promise<WorkspaceInvite> {
  const { data, error } = await supabase.rpc('create_workspace_invite', {
    p_workspace_id: input.workspaceId,
    p_role: input.role,
    p_label: input.label ?? undefined,
    p_expires_at: input.expiresAt ?? undefined,
    p_max_uses: input.maxUses ?? undefined,
  });
  if (error) throw error;
  return data as WorkspaceInvite;
}

export async function revokeWorkspaceInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}

// Davet koduyla çalışma alanına katıl. Katılınan çalışma alanının id'sini döner.
export async function redeemWorkspaceInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_workspace_invite', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  if (!data) throw new Error('Çalışma alanına katılınamadı');
  return data as string;
}

export async function updateMemberRole(input: {
  workspaceId: string;
  userId: string;
  role: 'editor' | 'viewer';
}): Promise<void> {
  const { error } = await supabase.rpc('update_member_role', {
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId,
    p_role: input.role,
  });
  if (error) throw error;
}

export async function removeWorkspaceMember(input: { workspaceId: string; userId: string }): Promise<void> {
  const { error } = await supabase.rpc('remove_workspace_member', {
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId,
  });
  if (error) throw error;
}

// docs/03 — davet linki uygulama içi derin bağlantıya çözülür; alıcı uygulamada oturum
// açıp kodu girer. Link, kodun paylaşılabilir bir sarmalayıcısıdır.
export function buildInviteLink(code: string): string {
  return `https://vademde.com/join/${code}`;
}
