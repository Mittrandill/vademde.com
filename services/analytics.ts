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

const platform = Platform.OS === 'ios' ? 'ios' : 'android';
const tracker = createTracker({
  platform,
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

function schedule(delay: number) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void runFlush();
  }, delay);
}

async function runFlush() {
  await tracker.flush();
  if (tracker.size() > 0) {
    // Gönderilemedi (ağ yok, yetki henüz verilmemiş…): artan aralıkla tekrar dene.
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    schedule(backoffMs);
  } else {
    backoffMs = FLUSH_MS;
  }
}

export function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
  tracker.track(name, props);
  if (tracker.size() > 0) schedule(backoffMs);
}

export function setAnalyticsSignedIn(value: boolean): void {
  // Çıkışta bekleyen olaylar silinir; bir sonraki hesaba taşınmaz.
  if (!value && signedIn) tracker.clear();
  signedIn = value;
  if (value && tracker.size() > 0) schedule(FLUSH_MS);
}

/** Ayarlar anahtarı. Kapatılınca bekleyen olaylar da silinir. */
export function setAnalyticsConsent(enabled: boolean): void {
  useAnalyticsConsentStore.getState().setEnabled(enabled);
  if (!enabled) tracker.clear();
}

// app_opened: soğuk açılış ve en az 30 dakika arka planda kaldıktan sonra öne dönüş. Kalıcı izin
// bayrağı AsyncStorage'dan okunana kadar (ilk açılış) beklenir; yoksa ilk olay kaybolurdu.
export function attachAnalyticsLifecycle(): () => void {
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
    const persistApi = useAnalyticsConsentStore.persist;
    if (persistApi.hasHydrated()) openIfDue();
    else persistApi.onFinishHydration(() => openIfDue());
  };

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') onActive();
    else {
      if (leftAt === null) leftAt = Date.now();
      void tracker.flush();
    }
  });
  if (AppState.currentState === 'active') onActive();
  return () => subscription.remove();
}
