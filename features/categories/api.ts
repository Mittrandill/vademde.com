import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Category = Tables<'categories'>;

export async function listCategories(workspaceId: string, kind?: 'income' | 'expense'): Promise<Category[]> {
  let query = supabase.from('categories').select('*').eq('workspace_id', workspaceId);
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory(input: TablesInsert<'categories'>): Promise<Category> {
  const { data, error } = await supabase.from('categories').insert(input).select('*').single();
  if (error) throw error;
  return data;
}
