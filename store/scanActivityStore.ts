import { create } from 'zustand';

// Tara sekmesi Ana Sayfa'ya geçildiğinde de yüklemeye devam edebilir.
export const useScanActivityStore = create(() => ({ active: false }));
