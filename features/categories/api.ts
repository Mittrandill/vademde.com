import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';

export type Category = Tables<'categories'>;

export async function listCategories(workspaceId: string, kind?: 'income' | 'expense'): Promise<Category[]> {
  let query = supabase.from('categories').select('*').eq('workspace_id', workspaceId);
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getCategory(id: string): Promise<Category> {
  const { data, error } = await supabase.from('categories').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createCategory(input: TablesInsert<'categories'>): Promise<Category> {
  const { data, error } = await supabase.from('categories').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, input: TablesUpdate<'categories'>): Promise<Category> {
  const { data, error } = await supabase.from('categories').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// Kategori işlem/borç kayıtlarında kullanılıyorsa FK NO ACTION nedeniyle silme başarısız olur;
// çağıran taraf bu durumu kullanıcıya "kullanımda" mesajıyla iletir.
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}
