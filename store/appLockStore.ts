import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppLockState {
  /** Kullanıcı biyometrik kilidi açtı mı (Ayarlar → Uygulama Kilidi). */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

// docs/10-abonelik-gelir-modeli.md — "Face ID kilidi" Plus ve İşletme planlarının
// özelliğidir (plan_limits.face_id). Tercih cihaz üzerinde tutulur, sunucuya gönderilmez:
// bu bir gizlilik ayarıdır ve başka bir cihazda otomatik açılması beklenmez.
//
// Kilit tercihi kalıcı olsa da her açılışta plan yeniden doğrulanır (bkz.
// components/auth/AppLockGate.tsx) — abonelik biterse kilit sessizce devre dışı kalır ve
// kullanıcı kendi verisine erişemez duruma düşmez.
export const useAppLockStore = create<AppLockState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'vademde-app-lock',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
