import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LanguagePreference = 'system' | 'tr' | 'en';

interface LanguagePreferenceState {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
}

// docs/20-ingilizce-dil-destegi.md — varsayılan 'system': cihaz dili Türkçeyse Türkçe, değilse
// İngilizce (bkz. i18n/index.ts resolveLanguage). Kullanıcı Ayarlar > Görünüm'den elle
// Türkçe/English seçebilir; tercih kalıcıdır.
export const useLanguagePreferenceStore = create<LanguagePreferenceState>()(
  persist(
    (set) => ({
      languagePreference: 'system',
      setLanguagePreference: (preference) => set({ languagePreference: preference }),
    }),
    {
      name: 'vademde-language-preference',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
