import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { writeWidgetHideAmounts } from '@/services/widgetSync';

interface WidgetPrefsState {
  hideAmounts: boolean;
  setHideAmounts: (hide: boolean) => void;
}

// Ayarlar > Widget'lar: "Widget'ta tutarları gizle". Tercih widget'ın okuyabilmesi için
// App Group'a da yazılır (bkz. services/widgetSync.ts).
export const useWidgetPrefsStore = create<WidgetPrefsState>()(
  persist(
    (set) => ({
      hideAmounts: false,
      setHideAmounts: (hide) => {
        writeWidgetHideAmounts(hide);
        set({ hideAmounts: hide });
      },
    }),
    {
      name: 'vademde-widget-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) writeWidgetHideAmounts(state.hideAmounts);
      },
    }
  )
);
