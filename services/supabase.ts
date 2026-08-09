import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/db/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı (.env.local).'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
