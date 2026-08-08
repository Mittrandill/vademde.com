import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Workspace = Tables<'workspaces'>;

export async function listMyWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createWorkspace(input: Pick<TablesInsert<'workspaces'>, 'name' | 'type'>) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Oturum bulunamadı');

  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: input.name, type: input.type, owner_id: userData.user.id })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// RLS (workspaces_update_owner) yalnızca sahibine izin verir — burada ekstra bir sahiplik
// kontrolü yapılmaz, çağıran ekran (app/profile) düğmeyi zaten yalnızca sahibe gösterir.
export async function updateWorkspaceName(id: string, name: string): Promise<Workspace> {
  const { data, error } = await supabase.from('workspaces').update({ name }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// docs/00-vizyon-ve-strateji.md §2.4 — workspace_id tüm finansal tablolarda ON DELETE
// CASCADE'dir: bu çağrı çalışma alanındaki tüm hesap/işlem/borç-alacak/belge kaydını
// kalıcı olarak siler. Çağıran ekran, hesap silmeyle aynı çift onaylı akışı kullanır.
export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').delete().eq('id', id);
  if (error) throw error;
}
