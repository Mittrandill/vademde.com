// Supabase Auth, hata mesajlarını her zaman İngilizce döner (ör. "Invalid login
// credentials"); bu doğrudan kullanıcıya gösterilirse Türkçe uygulamada garip kaçar.
// `error.code` alanı (node_modules/@supabase/auth-js/src/lib/error-codes.ts) SDK
// sürümüne göre stabil kalan makine-okunur bir alan — mesaj metni yerine bu eşlenir.
// Yeni bir auth ekranı eklenirse (sign-in/sign-up/reset-password gibi) catch bloğunda
// ham `err.message` yerine bu fonksiyon kullanılmalı.
const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed: 'E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzu kontrol edin.',
  user_already_exists: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.',
  email_exists: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.',
  identity_already_exists: 'Bu hesap zaten bağlı.',
  weak_password: 'Şifreniz çok zayıf. En az 6 karakter kullanın.',
  same_password: 'Yeni şifre eskisiyle aynı olamaz.',
  user_not_found: 'Bu bilgilerle bir hesap bulunamadı.',
  user_banned: 'Bu hesaba erişim kısıtlanmış. Destek ile iletişime geçin.',
  signup_disabled: 'Şu anda yeni kayıt kabul edilmiyor.',
  email_address_invalid: 'Geçerli bir e-posta adresi girin.',
  email_address_not_authorized: 'Bu e-posta adresiyle kayıt olunamıyor.',
  over_email_send_rate_limit: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  over_request_rate_limit: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  over_sms_send_rate_limit: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  captcha_failed: 'Doğrulama başarısız oldu. Lütfen tekrar deneyin.',
  session_expired: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  session_not_found: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  refresh_token_not_found: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  refresh_token_already_used: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  bad_oauth_state: 'Bu giriş yöntemi şu anda kullanılamıyor. Lütfen tekrar deneyin.',
  bad_oauth_callback: 'Bu giriş yöntemi şu anda kullanılamıyor. Lütfen tekrar deneyin.',
  oauth_provider_not_supported: 'Bu giriş yöntemi şu anda kullanılamıyor.',
  provider_disabled: 'Bu giriş yöntemi şu anda kullanılamıyor.',
  request_timeout: 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
};

export function translateAuthError(error: unknown, fallback: string): string {
  const err = error as { message?: string; code?: string } | null;
  const code = err?.code;
  if (code && MESSAGES_BY_CODE[code]) return MESSAGES_BY_CODE[code];

  const rawMessage = err?.message ?? '';
  if (/network|fetch|internet/i.test(rawMessage)) {
    return 'İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }

  return fallback;
}
