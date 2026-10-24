import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/services/supabase';
import { useAnalyticsConsentStore } from '@/store/analyticsConsentStore';
import { createTracker, type AnalyticsEventName, type AnalyticsProps } from '@/services/analyticsCore';

// Kullanım analitiği: yalnızca kullanıcı izin verdiyse ve giriş yapılmışsa, küçük partiler halinde
// public.analytics_ingest_events RPC'sine gönderilir (sunucu kullanıcıyı JWT'den alır, olay adı ve
// özellik anahtarlarını süzer, tekrarları yok sayar). Kural ve gerekçeler: services/analyticsCore.ts.
// Takip hiçbir zaman uygulama akışını bozmaz: her hata sessizce yutulur.

const FLUSH_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const REOPEN_AFTER_MS = 30 * 60_000;

type IngestClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }> };

let signedIn = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoffMs = FLUSH_MS;

// Takipçi ilk kullanımda oluşturulur ve bütün kurulum bir try/catch içindedir: modül içe aktarılırken
// (uygulama açılışı) hiçbir şey çalıştırılmaz ve herhangi bir hata takibi sessizce devre dışı bırakır.
type Tracker = ReturnType<typeof createTracker>;
let tracker: Tracker | null = null;
let trackerFailed = false;

function getTracker(): Tracker | null {
  if (tracker || trackerFailed) return tracker;
  try {
    tracker = createTracker({
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? null,
      sessionId: Crypto.randomUUID(),
      uuid: () => Crypto.randomUUID(),
      now: () => new Date(),
      isConsented: () => Platform.OS !== 'web' && useAnalyticsConsentStore.getState().enabled,
      isSignedIn: () => signedIn,
      send: async (batch) => {
        try {
          const { error } = await (supabase as unknown as IngestClient).rpc('analytics_ingest_events', {
            p_events: batch,
          });
          return !error;
        } catch {
          return false;
        }
      },
    });
  } catch {
    trackerFailed = true;
    tracker = null;
  }
  return tracker;
}

function schedule(delay: number) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void runFlush();
  }, delay);
}

async function runFlush() {
  const t = getTracker();
  if (!t) return;
  await t.flush();
  if (t.size() > 0) {
    // Gönderilemedi (ağ yok, yetki henüz verilmemiş…): artan aralıkla tekrar dene.
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    schedule(backoffMs);
  } else {
    backoffMs = FLUSH_MS;
  }
}

export function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
  try {
    const t = getTracker();
    if (!t) return;
    t.track(name, props);
    if (t.size() > 0) schedule(backoffMs);
  } catch {
    // takip asla uygulamayı bozmaz
  }
}

export function setAnalyticsSignedIn(value: boolean): void {
  try {
    // Çıkışta bekleyen olaylar silinir; bir sonraki hesaba taşınmaz.
    if (!value && signedIn) tracker?.clear();
    signedIn = value;
    if (value && tracker && tracker.size() > 0) schedule(FLUSH_MS);
  } catch {
    signedIn = value;
  }
}

/** Ayarlar anahtarı. Kapatılınca bekleyen olaylar da silinir. */
export function setAnalyticsConsent(enabled: boolean): void {
  useAnalyticsConsentStore.getState().setEnabled(enabled);
  try {
    if (!enabled) tracker?.clear();
  } catch {
    // izin kapatma her koşulda başarılı olmalı
  }
}

// app_opened: soğuk açılış ve en az 30 dakika arka planda kaldıktan sonra öne dönüş. Kalıcı izin
// bayrağı AsyncStorage'dan okunana kadar (ilk açılış) beklenir; yoksa ilk olay kaybolurdu.
export function attachAnalyticsLifecycle(): () => void {
  try {
    return attachLifecycle();
  } catch {
    return () => undefined;
  }
}

function attachLifecycle(): () => void {
  let leftAt: number | null = null;
  let opened = false;

  const openIfDue = () => {
    const now = Date.now();
    if (!opened || (leftAt !== null && now - leftAt >= REOPEN_AFTER_MS)) {
      opened = true;
      track('app_opened');
    }
    leftAt = null;
  };
  const onActive = () => {
    try {
      const persistApi = useAnalyticsConsentStore.persist;
      if (persistApi.hasHydrated()) openIfDue();
      else persistApi.onFinishHydration(() => openIfDue());
    } catch {
      // takip asla uygulamayı bozmaz
    }
  };

  const subscription = AppState.addEventListener('change', (state) => {
    try {
      if (state === 'active') onActive();
      else {
        if (leftAt === null) leftAt = Date.now();
        void tracker?.flush();
      }
    } catch {
      // takip asla uygulamayı bozmaz
    }
  });
  if (AppState.currentState === 'active') onActive();
  return () => subscription.remove();
}
