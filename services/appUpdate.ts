import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/services/supabase';

const PACKAGE = 'com.akintkaya.vademde';
export const installedVersion = Constants.expoConfig?.version;

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

export async function fetchStoreRelease() {
  if (!installedVersion) return null;
  let version: string;
  let url: string;

  if (Platform.OS === 'android') {
    const result = await supabase.rpc('android_store_version');
    if (result.error) throw result.error;
    version = result.data;
    url = `https://play.google.com/store/apps/details?id=${PACKAGE}`;
  } else if (Platform.OS === 'ios') {
    const response = await fetch(`https://itunes.apple.com/lookup?bundleId=${PACKAGE}&country=tr`);
    if (!response.ok) throw new Error('Store lookup failed');
    const item = (await response.json()).results?.[0];
    if (!item || item.bundleId !== PACKAGE || typeof item.trackViewUrl !== 'string' ||
        new URL(item.trackViewUrl).hostname !== 'apps.apple.com' ||
        !item.trackViewUrl.startsWith('https://')) return null;
    version = item.version;
    url = item.trackViewUrl;
  } else {
    return null;
  }

  if (!/^\d+(?:\.\d+){1,3}$/.test(version) || !isNewerVersion(version, installedVersion)) return null;
  return { version, url };
}
