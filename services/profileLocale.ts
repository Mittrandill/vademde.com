import { supabase } from '@/services/supabase';
import { getLanguage, type AppLanguage } from '@/i18n';
import { useLanguagePreferenceStore } from '@/store/languagePreferenceStore';

// Serialize changes: a slower request for the old language cannot win the last write.
let pending: Promise<void> = Promise.resolve();

export function syncProfileLocale(userId: string, locale: AppLanguage): Promise<void> {
  const next = pending.catch(() => undefined).then(async () => {
    if (locale !== getLanguage()) return;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user.id !== userId) return;
    const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId).select('id').single();
    if (error) throw error;
  });
  pending = next;
  return next;
}

export async function syncCurrentProfileLocale(): Promise<void> {
  if (!useLanguagePreferenceStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useLanguagePreferenceStore.persist.onFinishHydration(() => { unsubscribe(); resolve(); });
    });
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) await syncProfileLocale(data.session.user.id, getLanguage());
}
