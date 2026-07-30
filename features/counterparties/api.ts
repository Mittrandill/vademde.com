import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';

export type Counterparty = Tables<'counterparties'>;

export async function listCounterparties(workspaceId: string): Promise<Counterparty[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createCounterparty(input: TablesInsert<'counterparties'>): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCounterparty(
  id: string,
  input: TablesUpdate<'counterparties'>
): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
