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
}

// docs/08-tasarim-sistemi.md §12.5 — Graphite Finance renk sistemi
// (yeniden tasarım: design/vademde-redesign/HANDOFF.md §1).
// Marka tonları (brandPrimary/accentViolet) Vademde_Tam_Logo_Paketi_v2.0 ile birebir eşleşir ve
// temadan bağımsızdır (logo kilitli). success = receivable (para girişi/doğrulandı); danger
// yalnızca gecikme ve yıkıcı aksiyon içindir.
const shared = {
  brandPrimary: '#FFB000',
  brandPrimaryText: '#1F2126',
  action: '#FFB000',
  onAction: '#1F2126',
  accentViolet: '#6B4DFF',
  accentAqua: '#86DDEB',
  // ActionSheet ve diğer modal/sheet backdrop'ları için ortak scrim (docs §12.8 — ağır efekt değil, kontrollü karartma).
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
  payable: '#8B73FF',
  payableFill: '#6B4DFF',
  receivable: '#52CE96',
  success: '#52CE96',
  danger: '#FF625C',
  attentionMarker: '#FFB000',
  mutedControl: '#6E7076',
};

export const lightColors: ThemeColors = {
  ...shared,
  backgroundPrimary: '#F1F2F4',
  surfacePrimary: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#111114',
  textSecondary: '#5E606A',
  border: '#DCDEE3',
  payable: '#5638F0',
  payableFill: '#5638F1',
  receivable: '#0F7A52',
  success: '#0F7A52',
  danger: '#C8361C',
  attentionMarker: '#B07800',
  mutedControl: '#83868F',
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
