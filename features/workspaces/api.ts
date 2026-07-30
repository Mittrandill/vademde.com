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
