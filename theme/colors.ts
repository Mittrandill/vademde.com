export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  backgroundPrimary: string;
  surfacePrimary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  brandPrimary: string;
  brandPrimaryText: string;
  accentViolet: string;
  accentAqua: string;
  success: string;
  danger: string;
  border: string;
}

// docs/08-tasarim-sistemi.md §12.5 — Graphite Finance renk sistemi.
// Marka tonları (brandPrimary/accentViolet/graphite/soft/white) Vademde_Tam_Logo_Paketi_v2.0
// /07_Gelistirici/design-tokens.json ile birebir eşleşir. success/danger marka kimliği değil,
// finansal durum anlamı taşıdığı için (gelir=yeşil, gecikme=kırmızı) pakette tanımlı
// income/expense eşlemesinden ayrı tutulur ve değiştirilmez.
const shared = {
  brandPrimary: '#FFB000',
  brandPrimaryText: '#1F2126',
  accentViolet: '#6B4DFF',
  accentAqua: '#86DDEB',
  success: '#52CE96',
  danger: '#FF625C',
};

export const darkColors: ThemeColors = {
  ...shared,
  backgroundPrimary: '#1F2126',
  surfacePrimary: '#2B2D31',
  surfaceElevated: '#393B3F',
  textPrimary: '#F6F5F1',
  textSecondary: '#B1B2AA',
  border: '#3D3F45',
};

export const lightColors: ThemeColors = {
  ...shared,
  backgroundPrimary: '#F6F5F1',
  surfacePrimary: '#FAFAF7',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1F2126',
  textSecondary: '#6E6F66',
  border: '#E2E2DC',
};

export const colorsByScheme: Record<ColorScheme, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};
