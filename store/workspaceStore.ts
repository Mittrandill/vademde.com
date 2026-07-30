import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  balanceHidden: boolean;
  toggleBalanceHidden: () => void;
}

// docs/00-vizyon-ve-strateji.md §2.4 — kullanıcı üst menüden çalışma alanını değiştirir;
// bağlayıcı kural #3: tüm sorgular workspace_id üzerinden ayrılır.
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (workspaceId) => set({ activeWorkspaceId: workspaceId }),
      balanceHidden: false,
      toggleBalanceHidden: () => set((state) => ({ balanceHidden: !state.balanceHidden })),
    }),
    {
      name: 'vademde-active-workspace',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
