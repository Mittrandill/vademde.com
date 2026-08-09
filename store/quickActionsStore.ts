import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Ana Sayfa'daki Hızlı İşlemler satırında hangi aksiyonların, hangi sırada
// gösterileceği (bkz. components/finance/QuickActions.tsx). Burada yalnızca seçilen
// aksiyon kimlikleri saklanır — ikon/etiket/hedef gibi görünüm bilgisi sabit bir
// havuzdan (QUICK_ACTION_POOL) gelir; havuzda artık bulunmayan bir kimlik kalırsa
// (ör. bir güncellemede kaldırıldıysa) render sırasında sessizce atlanır.
export const DEFAULT_QUICK_ACTION_IDS = ['yeni-hareket', 'raporlar', 'hesaplar'];

interface QuickActionsState {
  actionIds: string[];
  setActionIds: (ids: string[]) => void;
}

export const useQuickActionsStore = create<QuickActionsState>()(
  persist(
    (set) => ({
      actionIds: DEFAULT_QUICK_ACTION_IDS,
      setActionIds: (actionIds) => set({ actionIds }),
    }),
    {
      name: 'vademde-quick-actions',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
