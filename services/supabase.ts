import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/db/database.types';
import { largeSecureStore } from '@/services/secureStorage';

// docs/07-guvenlik-gizlilik.md §11.1 — oturum SecureStore (Keychain/Keystore) destekli
// şifreli depoda tutulur (bkz. secureStorage.ts). SecureStore yalnızca native'de var; web'de
// (bu proje Expo web'i de destekliyor) supabase-js zaten kendi localStorage tabanlı
// davranışına düşer, o yüzden web'de eski AsyncStorage adaptörü korunur.
const authStorage = Platform.OS === 'web' ? AsyncStorage : largeSecureStore;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı (.env.local).'
  );
}

// Oturum düştüğünde (yenileme jetonu geçersiz, çıkış sırasında hâlâ açık ekranlar) supabase-js
// istekleri kullanıcı jetonu yerine anahtarla gönderiyor. Sunucu bunları zaten reddediyor ama
// her biri hata kaydı açıyordu (is_workspace_member, support_replies, get_workspace_entitlements;
// 2026-11-11 … 2026-11-18). Kullanıcı jetonu olmayan veri isteği cihazdan hiç çıkmaz; çağıran
// taraf sunucunun vereceği 401 yanıtının aynısını alır. Oturumsuz da çalışması gereken uç
// noktalar aşağıdaki listededir.
const REST_PREFIX = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`;
const ANON_REST_PATHS = new Set(['rpc/android_store_version']);

const sessionGuardFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(REST_PREFIX) && !ANON_REST_PATHS.has(url.slice(REST_PREFIX.length).split('?')[0])) {
    const authorization = new Headers(init?.headers).get('Authorization');
    if (!authorization || authorization === `Bearer ${supabaseAnonKey}`) {
      const body = JSON.stringify({ code: 'PGRST301', message: 'No user session', details: null, hint: null });
      return Promise.resolve(new Response(body, { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }
  }
  return fetch(input, init);
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: sessionGuardFetch },
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Dönüş kodu yalnızca akışı başlatan cihazdaki doğrulayıcıyla oturuma çevrilebilir.
    flowType: 'pkce',
  },
});

// Supabase'in React Native için zorunlu tuttuğu bağlantı: `autoRefreshToken: true` tek
// başına yeterli değil, zamanlayıcı yalnızca uygulama ön plandayken çalışmalı. Bu olmadan
// (bkz. Tara akışı: kamera/galeri açılışı uygulamayı arka plana düşürüyor) arka planda token
// süresi dolabiliyor; öne dönüşteki ilk istek (OCR yükleme) bazen yenilenmemiş oturumla gidip
// storage.objects RLS politikasını "auth.uid() boş" sayarak reddediyordu.
//
// Yalnızca native'de kayıt edilir: web'de @supabase/auth-js zaten kendi
// `document.visibilitychange` dinleyicisiyle aynı işi native olarak yapıyor
// (GoTrueClient#_onVisibilityChanged). İkisini birden web'de çalıştırmak aynı olaya iki
// bağımsız dinleyici bağlar; ikisi de aynı anda startAutoRefresh/stopAutoRefresh'i
// tetikleyip kilit çakışmasına yol açabiliyordu — sonraki bir sorgunun (ör. tarama
// sırasındaki mükerrer belge kontrolü) hiç yanıt vermeden asılı kalmasına neden olan
// buydu ("%25'te donma").
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
