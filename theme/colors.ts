export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  backgroundPrimary: string;
  surfacePrimary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  brandPrimary: string;
  brandPrimaryText: string;
  /** Yalnızca aksiyon (ana buton, +, Tara, seçili segment/çip, açık anahtar). brandPrimary ile aynı. */
  action: string;
  /** action üzerindeki yazı/ikon. brandPrimaryText ile aynı. */
  onAction: string;
  /** Ödeme bekleyen her şey: ödenecek çubuklar, sıradaki taksit, "Yarın/3 gün" etiketleri. */
  payable: string;
  /** payable dolgulu etiketler (üzerinde beyaz yazı). */
  payableFill: string;
  /** Para girişi / doğrulandı: tahsil, gelir, "Belgeden okundu". success ile aynı. */
  receivable: string;
  /** "Kontrol et" kesik çizgisi, okunmamış noktası, eski kur uyarısı. */
  attentionMarker: string;
  /** Boş radyo/kutucuk, pasif ok, boş taksit kutusu. */
  mutedControl: string;
  /** Marka kilitli mor (logo çubukları, illüstrasyon). Ödeme anlamı için payable kullanılır. */
  accentViolet: string;
  accentAqua: string;
  success: string;
  danger: string;
  border: string;
  overlay: string;
  /** İnce ayırıcı çizgi (vademde.css --sep). */
  separator: string;
  /** Hafif dolgu: segment zemini, ikon kutusu, çip (vademde.css --fill). */
  fill: string;
}

// Tasarım tuvali (Vademde Ekran Tasarımı) vademde.css tokenları. Marka tonları
// (brandPrimary/accentViolet) Vademde_Tam_Logo_Paketi_v2.0 ile birebir eşleşir ve temadan bağımsızdır.
// Anlam renkleri açık temada metin kontrastı için koyu tonlarla (--*-t) gelir:
// payable = mor metin (--vi-t), receivable/success = yeşil metin (--ok-t), danger = kırmızı (yalnızca gecikme/silme).
const shared = {
  brandPrimary: '#FFB000',
  brandPrimaryText: '#1F2126',
  action: '#FFB000',
  onAction: '#1F2126',
  accentViolet: '#6B4DFF',
  accentAqua: '#86DDEB',
  overlay: 'rgba(0, 0, 0, 0.45)',
};

export const darkColors: ThemeColors = {
  ...shared,
  backgroundPrimary: '#1F2126',
  surfacePrimary: '#2B2D31',
  surfaceElevated: '#393B3F',
  textPrimary: '#F6F5F1',
  textSecondary: '#B1B2AA',
  border: '#3D3F45',
  separator: 'rgba(246, 245, 241, 0.08)',
  fill: 'rgba(246, 245, 241, 0.07)',
  payable: '#A08CFF',
  payableFill: '#6B4DFF',
  receivable: '#52CE96',
  success: '#52CE96',
  danger: '#FF7A75',
  attentionMarker: '#FFB000',
  mutedControl: '#86877F',
};

export const lightColors: ThemeColors = {
  ...shared,
  backgroundPrimary: '#F6F5F1',
  surfacePrimary: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1F2126',
  textSecondary: '#6E6F66',
  border: '#E2E2DC',
  separator: '#E9E9E3',
  fill: 'rgba(31, 33, 38, 0.055)',
  payable: '#5A3DF0',
  payableFill: '#6B4DFF',
  receivable: '#14804F',
  success: '#14804F',
  danger: '#D23B35',
  attentionMarker: '#8A5F00',
  mutedControl: '#8E8F86',
};

export const colorsByScheme: Record<ColorScheme, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

// Halka track'i, yumuşak kenarlık gibi yerlerde token rengin şeffaf tonu gerekir.
// Palete yeni bir sabit renk eklemek yerine mevcut token'dan türetilir (docs §12.5).
export function withAlpha(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
