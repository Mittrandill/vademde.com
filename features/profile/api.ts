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

const AVATARS_BUCKET = 'avatars';

// Sabit dosya adı (avatar.jpg) + upsert:true — her yeni fotoğraf öncekinin üzerine yazar,
// storage'da eski dosyalar birikmez. Bucket public olduğu için imzalı URL'ye gerek yok
// (financial-documents'ın aksine — profil fotoğrafı hassas finansal veri değil), ama public
// URL'ler CDN'de önbelleklendiğinden yol aynı kalınca eski fotoğraf görünmeye devam edebilir;
// bu yüzden URL'ye önbellek kırıcı bir zaman damgası eklenir.
export async function uploadAvatar(userId: string, uri: string, mimeType: string): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${userId}/avatar.${extension}`;

  // React Native'in Blob polyfill'i yerel file:// URI'lerinde içerik türünü yanlış
  // algılayabildiği için (bkz. features/documents/api.ts'teki aynı not), arrayBuffer + açık
  // contentType kullanılır.
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updateError) throw updateError;

  return avatarUrl;
}
