// docs/08-tasarim-sistemi.md §12.7 — Spacing, grid ve radius.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  massive: 64,
} as const;

export const screenEdge = {
  standard: 20,
  narrow: 16,
} as const;

export const radius = {
  widget: 20,
  heroWidget: 30,
  input: 15,
  pill: 999,
} as const;

export const touchTarget = {
  minimum: 44,
} as const;

export const buttonHeight = {
  primary: 55,
} as const;

// Filtre/segment satırları uygulama genelinde aynı yükseklikte olmalı; aksi halde her
// ekranda farklı boyda kapsüller görünür. 46 = Takvim/Raporlar'daki mevcut ölçü.
export const controlHeight = {
  segmented: 46,
} as const;

// Floating TabBar tüm sekme kök ekranlarının içeriğini kapatmamalı; 100 = mevcut
// tab ekranlarının çoğunda kullanılan pay, tek bir yerden yönetilir.
//
// tabBarHeight/tabBarBottomGap, TabBar.tsx'in kendi ölçüleridir ve burada durur ki
// tam ekran sekme ekranları (ör. Tara'nın kamera modu) kendi kontrollerini bu yüzen
// çubuğun üstüne yerleştirebilsin. Kamera deklanşörü, bu değerler sabit kodlu kaldığı
// için TabBar'ın arkasında kalıyordu — ölçü tek kaynaktan okunmalı.
export const layout = {
  tabBarClearance: 100,
  tabBarHeight: 64,
  tabBarBottomGap: 4,
} as const;
