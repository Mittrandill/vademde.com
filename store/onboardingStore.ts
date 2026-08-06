import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (value: boolean) => void;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — üç kısa değer önerisi ekranı yalnızca ilk
// açılışta gösterilir; kalıcı bayrak sayesinde oturum kapatılıp açılsa bile tekrar
// gösterilmez (app/_layout.tsx bu bayrağa göre (onboarding)/welcome mı (auth) mı
// gösterileceğine karar verir).
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenWelcome: false,
      setHasSeenWelcome: (value) => set({ hasSeenWelcome: value }),
    }),
    {
      name: 'vademde-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
