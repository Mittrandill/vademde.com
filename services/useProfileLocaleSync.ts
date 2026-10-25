import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { useLanguage } from '@/i18n';
import { useLanguagePreferenceStore } from '@/store/languagePreferenceStore';
import { syncProfileLocale } from './profileLocale';

export function useProfileLocaleSync(userId: string | null): void {
  const language = useLanguage();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const sync = () => {
      if (!active || !useLanguagePreferenceStore.persist.hasHydrated()) return;
      void syncProfileLocale(userId, language).catch((error) => console.warn('[profileLocale] sync failed', error));
    };
    sync();
    const hydrated = useLanguagePreferenceStore.persist.onFinishHydration(sync);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    const network = NetInfo.addEventListener((state) => { if (state.isConnected) sync(); });
    return () => { active = false; hydrated(); appState.remove(); network(); };
  }, [userId, language]);
}
