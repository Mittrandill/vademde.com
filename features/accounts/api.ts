import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';

export type Account = Tables<'accounts'>;

export async function listAccounts(workspaceId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createAccount(input: TablesInsert<'accounts'>): Promise<Account> {
  const { data, error } = await supabase.from('accounts').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, input: TablesUpdate<'accounts'>): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function archiveAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}
