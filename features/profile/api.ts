import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';

export type Profile = Tables<'profiles'>;

// docs §5 — auth.users'a `on_auth_user_created` trigger'ı ile kayıt açılışında
// otomatik bir profiles satırı oluşturulur; bu yüzden burada ayrıca create edilmez.
export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(userId: string, fullName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() || null })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
