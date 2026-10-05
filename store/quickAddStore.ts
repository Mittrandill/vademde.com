import { create } from 'zustand';

// Hızlı ekle sheet'inin (components/finance/QuickAddSheet.tsx) açık/kapalı durumu. Tek bir
// sheet (sekme düzeninde) mount edilir; Tara uzun basışı ve Hareketler "+" aynı sheet'i açar.
interface QuickAddState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useQuickAddStore = create<QuickAddState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
