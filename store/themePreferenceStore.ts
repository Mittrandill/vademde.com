import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemePreferenceState {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

// docs/08-tasarim-sistemi.md — Graphite Finance sistemi hem açık hem koyu tema tanımlar;
// varsayılan 'system' cihazın görünüm ayarını izler, kullanıcı Ayarlar'dan sabitleyebilir.
export const useThemePreferenceStore = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      setThemePreference: (preference) => set({ themePreference: preference }),
    }),
    {
      name: 'vademde-theme-preference',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
