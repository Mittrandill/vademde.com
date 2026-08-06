import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { supabase } from '@/services/supabase';

// Web tabanlı OAuth (Google) tarayıcı sekmesi kapandığında sonucu uygulamaya
// bildirebilmesi için bir kere kayıt edilmesi gerekir (bkz. Expo AuthSession dokümanı).
WebBrowser.maybeCompleteAuthSession();

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function resetPasswordForEmail(email: string) {
  const redirectTo = Linking.createURL('reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Supabase, hem Google OAuth dönüşünde hem de şifre sıfırlama bağlantısında oturum
// belirteçlerini yönlendirme URL'sinin hash parçasında döner (#access_token=...); bu
// yüzden iki akış da aynı manuel ayrıştırmayı paylaşır (bkz. services/authDeepLinks.ts).
export function extractSessionTokensFromUrl(
  url: string
): { accessToken: string; refreshToken: string } | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// App Store yönergesi 4.8 — Google gibi başka sosyal girişler sunulduğunda Apple ile
// giriş de yerel (native) "Sign in with Apple" akışıyla sunulmalıdır; bu yüzden web
// OAuth yerine expo-apple-authentication + Supabase signInWithIdToken kullanılır.
export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) throw new Error('Apple kimlik doğrulaması tamamlanamadı');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

// Google için native SDK yerine Supabase'in tarayıcı tabanlı OAuth akışı kullanılır;
// dönüş, uygulamanın "vademde://" şemasına yönlendirilip oturum belirteçleri URL'den
// okunarak tamamlanır (bkz. Supabase Expo/React Native OAuth örneği).
export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Google giriş bağlantısı oluşturulamadı');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) return;

  const tokens = extractSessionTokensFromUrl(result.url);
  if (!tokens) return;

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (sessionError) throw sessionError;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  // Kullanıcı zaten sunucuda silindi; yerel oturumu temizlemek yeterli, sunucu hatası göz ardı edilir.
  await supabase.auth.signOut().catch(() => undefined);
}
