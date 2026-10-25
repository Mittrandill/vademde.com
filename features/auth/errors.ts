import { t } from '@/i18n';

// Supabase Auth, hata mesajlarını her zaman İngilizce döner (ör. "Invalid login
// credentials"); bu doğrudan kullanıcıya gösterilirse Türkçe uygulamada garip kaçar.
// `error.code` alanı (node_modules/@supabase/auth-js/src/lib/error-codes.ts) SDK
// sürümüne göre stabil kalan makine-okunur bir alan — mesaj metni yerine bu eşlenir.
// Yeni bir auth ekranı eklenirse (sign-in/sign-up/reset-password gibi) catch bloğunda
// ham `err.message` yerine bu fonksiyon kullanılmalı. Metinler: i18n errors.auth.
const MESSAGE_KEY_BY_CODE = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_already_exists',
  email_exists: 'user_already_exists',
  identity_already_exists: 'identity_already_exists',
  weak_password: 'weak_password',
  same_password: 'same_password',
  user_not_found: 'user_not_found',
  user_banned: 'user_banned',
  signup_disabled: 'signup_disabled',
  email_address_invalid: 'email_address_invalid',
  email_address_not_authorized: 'email_address_not_authorized',
  over_email_send_rate_limit: 'rate_limit',
  over_request_rate_limit: 'rate_limit',
  over_sms_send_rate_limit: 'rate_limit',
  captcha_failed: 'captcha_failed',
  session_expired: 'session_expired',
  session_not_found: 'session_expired',
  refresh_token_not_found: 'session_expired',
  refresh_token_already_used: 'session_expired',
  bad_oauth_state: 'oauth_retry',
  bad_oauth_callback: 'oauth_retry',
  oauth_provider_not_supported: 'oauth_unavailable',
  provider_disabled: 'oauth_unavailable',
  request_timeout: 'request_timeout',
} as const;

export function translateAuthError(error: unknown, fallback: string): string {
  const err = error as { message?: string; code?: string } | null;
  const code = err?.code;
  if (code && code in MESSAGE_KEY_BY_CODE) {
    return t(`errors.auth.${MESSAGE_KEY_BY_CODE[code as keyof typeof MESSAGE_KEY_BY_CODE]}`);
  }

  const rawMessage = err?.message ?? '';
  if (/network|fetch|internet/i.test(rawMessage)) {
    return t('errors.checkConnection');
  }

  return fallback;
}
