import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { useLanguagePreferenceStore, type LanguagePreference } from '@/store/languagePreferenceStore';
import { tr } from './locales/tr';
import { en } from './locales/en';
import type { AppLanguage } from './types';

export type { AppLanguage } from './types';

// docs/20-ingilizce-dil-destegi.md — Türkçe kaynak dildir; cihaz dili Türkçe değilse İngilizce.
export function resolveLanguage(preference: LanguagePreference): AppLanguage {
  if (preference !== 'system') return preference;
  return getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: resolveLanguage(useLanguagePreferenceStore.getState().languagePreference),
  fallbackLng: 'tr',
  // React Native metni HTML olarak yorumlamaz; kaçış gereksiz ve "&amp;" gibi bozulmalar üretir.
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Tercih AsyncStorage'dan geç yüklenir (persist) ve Ayarlar'dan değişebilir; ikisinde de dil izlenir.
useLanguagePreferenceStore.subscribe((state) => {
  const next = resolveLanguage(state.languagePreference);
  if (i18n.language !== next) i18n.changeLanguage(next);
});

export function getLanguage(): AppLanguage {
  return i18n.language === 'en' ? 'en' : 'tr';
}

// Intl (sayı/tarih) için BCP-47 etiketi. Kod tabanındaki sabit 'tr-TR' kullanımlarının yerine geçer.
export function getLocaleTag(): 'tr-TR' | 'en-US' {
  return getLanguage() === 'en' ? 'en-US' : 'tr-TR';
}

// Dil değişince yeniden çizilmesi gereken bileşenler için (useTranslation dil değişikliğine abonedir).
export function useLanguage(): AppLanguage {
  const { i18n: instance } = useTranslation();
  return instance.language === 'en' ? 'en' : 'tr';
}

export { useTranslation };
export const t = i18n.t.bind(i18n);
export default i18n;
