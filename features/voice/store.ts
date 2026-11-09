import { create } from 'zustand';

import type { VoiceDraft } from './route';

// Yalnızca bellekte tutulur: taslak onay ekranındaki bilgi kartını besler, kalıcı veri değildir.
interface VoiceDraftState {
  draft: VoiceDraft | null;
  setDraft: (draft: VoiceDraft | null) => void;
}

export const useVoiceDraftStore = create<VoiceDraftState>()((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));
