import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (value: boolean) => void;
  // Kayıttan sonra ilk çalışma alanı kurulunca paywall (7 gün ücretsiz deneme teklifi) bir kez
  // açılır (bkz. app/workspace-setup/index.tsx); bu bayrak teklifin tekrar tekrar çıkmasını önler.
  hasSeenTrialOffer: boolean;
  setHasSeenTrialOffer: (value: boolean) => void;
  // İlk kurulumdan sonra deneme teklifi hemen değil, kullanıcı ilk kaydını ekleyip Ana Sayfa'ya
  // dönünce (ya da "Şimdilik geç" deyince / 10 dk sonra) açılır. Bekleyen teklifin başlangıç
  // zamanı; teklif gösterilince null olur (bkz. app/first-record, app/(tabs)/index.tsx).
  trialOfferPendingSince: number | null;
  setTrialOfferPendingSince: (value: number | null) => void;
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
      hasSeenTrialOffer: false,
      setHasSeenTrialOffer: (value) => set({ hasSeenTrialOffer: value }),
      trialOfferPendingSince: null,
      setTrialOfferPendingSince: (value) => set({ trialOfferPendingSince: value }),
    }),
    {
      name: 'vademde-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
