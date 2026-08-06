import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import { extractSessionTokensFromUrl } from '@/features/auth/api';
import { supabase } from './supabase';

async function handleUrl(url: string) {
  if (!url.includes('reset-password')) return;

  const tokens = extractSessionTokensFromUrl(url);
  if (!tokens) return;

  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (!error) router.replace('/reset-password');
}

// Şifre sıfırlama e-postasındaki bağlantı "vademde://reset-password#access_token=..."
// şemasıyla açılır (bkz. features/auth/api.ts resetPasswordForEmail). Uygulama kapalıyken
// açılan bağlantılar getInitialURL ile, açıkken gelenler 'url' event'iyle yakalanır.
export function attachAuthDeepLinkHandler() {
  Linking.getInitialURL().then((url) => {
    if (url) handleUrl(url);
  });

  const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
  return () => subscription.remove();
}
