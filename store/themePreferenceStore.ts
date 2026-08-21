import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemePreferenceState {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

// docs/08-tasarim-sistemi.md — Graphite Finance sistemi hem açık hem koyu tema tanımlar.
// Varsayılan (ilk kurulumda) 'dark': sistem ayarı açık olan kullanıcılarda bile uygulama
// koyu temada başlar — ürün kimliği koyu grafit zemin üzerine kurulu (bkz. Logo.png/marka
// varlığı, kök CLAUDE.md). Kullanıcı Ayarlar'dan 'Sistem' veya 'Açık' seçerek değiştirebilir;
// bu tercih kalıcıdır (persist), yani burada değişen yalnızca daha önce hiç seçim
// yapmamış kullanıcılar için ilk değerdir.
export const useThemePreferenceStore = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      themePreference: 'dark',
      setThemePreference: (preference) => set({ themePreference: preference }),
    }),
    {
      name: 'vademde-theme-preference',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
