import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import { extractAuthCodeFromUrl } from '@/features/auth/api';
import { supabase } from './supabase';

async function handleUrl(url: string) {
  if (!url.includes('reset-password')) return;

  const code = extractAuthCodeFromUrl(url);
  if (!code) return;

  // Başka birinin hazırladığı bağlantı, bu cihazda doğrulayıcı olmadığı için oturum açamaz.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) router.replace('/reset-password');
}

// Şifre sıfırlama e-postasındaki bağlantı "vademde://reset-password?code=..."
// şemasıyla açılır (bkz. features/auth/api.ts resetPasswordForEmail). Uygulama kapalıyken
// açılan bağlantılar getInitialURL ile, açıkken gelenler 'url' event'iyle yakalanır.
export function attachAuthDeepLinkHandler() {
  Linking.getInitialURL().then((url) => {
    if (url) handleUrl(url);
  });

  const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
  return () => subscription.remove();
}
