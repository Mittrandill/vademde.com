import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AnalyticsConsentState {
  /** Kullanıcı Ayarlar → Gizlilik'te kullanım analitiğine açıkça izin verdi mi. Varsayılan KAPALI. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

// Kullanım analitiği (hangi ekranın açıldığı, abonelik ekranı adımları) yalnızca bu izin açıkken
// toplanır; KVKK m.5/1 açık rıza + App Store 5.1.1. Tercih cihaz üzerinde tutulur; izin kapatılınca
// bekleyen olaylar silinir (bkz. services/analytics.ts). Varsayılan hiçbir zaman "açık" olmamalı.
export const useAnalyticsConsentStore = create<AnalyticsConsentState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'vademde-analytics-consent',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
