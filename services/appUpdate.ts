import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Mağazadaki sürüm, yüklü sürümden yeniyse kullanıcıya "Güncelleme var" uyarısı gösterir.
// expo-updates (OTA) kurulu değil; native build gerektiren her sürüm mağazadan gelir, bu
// yüzden iOS'ta App Store'un herkese açık iTunes Lookup uç noktası okunur. Android için
// Play Store'un herkese açık bir sürüm sorgusu yoktur (Play In-App Updates native modül
// ister); şimdilik yalnızca iOS'ta çalışır.
const BUNDLE_ID = 'com.akintkaya.vademde';
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=tr`;
const PROMPT_STATE_KEY = 'vademde-update-prompt';
// Aynı sürüm için "Sonra"ya basan kullanıcıyı her açılışta rahatsız etmemek için.
const REPROMPT_AFTER_MS = 24 * 60 * 60 * 1000;

interface PromptState {
  version: string;
  shownAt: number;
}

// "1.0.10" > "1.0.9" olmalı; düz metin karşılaştırması bunu yanlış yapar.
export function isNewerVersion(storeVersion: string, installedVersion: string): boolean {
  const a = storeVersion.split('.').map((part) => parseInt(part, 10) || 0);
  const b = installedVersion.split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

async function fetchStoreRelease(): Promise<{ version: string; url: string } | null> {
  const response = await fetch(`${LOOKUP_URL}&t=${Date.now()}`);
  if (!response.ok) return null;
  const body = (await response.json()) as {
    results?: { version?: string; trackViewUrl?: string }[];
  };
  const item = body.results?.[0];
  if (!item?.version || !item.trackViewUrl) return null;
  return { version: item.version, url: item.trackViewUrl };
}

async function wasPromptedRecently(version: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as PromptState;
    return state.version === version && Date.now() - state.shownAt < REPROMPT_AFTER_MS;
  } catch {
    return false;
  }
}

let isChecking = false;

// Ağ, mağaza veya depolama hatası uygulamayı etkilemez: güncelleme kontrolü tamamen
// "en iyi çaba"dır, başarısız olursa sessizce geçilir.
export async function checkForAppUpdate(): Promise<void> {
  if (Platform.OS !== 'ios' || isChecking) return;
  const installedVersion = Constants.expoConfig?.version;
  if (!installedVersion) return;

  isChecking = true;
  try {
    const release = await fetchStoreRelease();
    if (!release || !isNewerVersion(release.version, installedVersion)) return;
    if (await wasPromptedRecently(release.version)) return;

    const state: PromptState = { version: release.version, shownAt: Date.now() };
    await AsyncStorage.setItem(PROMPT_STATE_KEY, JSON.stringify(state));

    Alert.alert(
      'Yeni sürüm hazır',
      `Vademde ${release.version} App Store'da. Güncelleyerek son iyileştirmelere ve düzeltmelere ulaşabilirsiniz.`,
      [
        { text: 'Sonra', style: 'cancel' },
        { text: 'Güncelle', onPress: () => Linking.openURL(release.url) },
      ]
    );
  } catch {
    // Sessizce geç.
  } finally {
    isChecking = false;
  }
}

// Oturum açıkken (kullanıcı uygulamaya girmişken) hem açılışta hem uygulama arka plandan
// öne her döndüğünde kontrol eder.
export function useAppUpdatePrompt(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    checkForAppUpdate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForAppUpdate();
    });
    return () => subscription.remove();
  }, [enabled]);
}
