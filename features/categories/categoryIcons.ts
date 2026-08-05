import type { Ionicons } from '@expo/vector-icons';

// Kategori oluşturma ekranındaki ikon seçici burada tanımlanır (tek kaynak) ve
// CategoryIcon bileşeni aynı listeden renk eşlemesi türetir — böylece "Market"
// için seçilen sepet ikonu her yerde (hareketler, raporlar, kategori listesi)
// aynı yeşil rozette görünür. docs/08-tasarim-sistemi.md §12.9 — banka logoları
// gibi kategoriler de artık jenerik tek renkli ikon yerine kendi rengiyle ayrışır;
// bu bir "hazır stok paketi" değil, uygulama içinde elle küratörlüğü yapılmış bir
// palettir (bkz. features/banks/banks.ts'teki gerçek banka logoları ile aynı mantık).
export interface CategoryIconOption {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { icon: 'cart-outline', label: 'Market', color: '#3FB27F' },
  { icon: 'restaurant-outline', label: 'Restoran / Kafe', color: '#E8985E' },
  { icon: 'home-outline', label: 'Kira / Ev', color: '#C97B4A' },
  { icon: 'flash-outline', label: 'Faturalar', color: '#F0B429' },
  { icon: 'car-outline', label: 'Ulaşım', color: '#4C8DFF' },
  { icon: 'medkit-outline', label: 'Sağlık', color: '#F0616D' },
  { icon: 'school-outline', label: 'Eğitim', color: '#7C6FF0' },
  { icon: 'shirt-outline', label: 'Giyim', color: '#E177B0' },
  { icon: 'game-controller-outline', label: 'Eğlence', color: '#9B6BF2' },
  { icon: 'airplane-outline', label: 'Seyahat', color: '#2FA9C9' },
  { icon: 'cube-outline', label: 'Alışveriş', color: '#39B7C9' },
  { icon: 'construct-outline', label: 'Bakım / Tamir', color: '#B98450' },
  { icon: 'shield-checkmark-outline', label: 'Sigorta', color: '#3457D5' },
  { icon: 'repeat-outline', label: 'Abonelik', color: '#8B6BE0' },
  { icon: 'paw-outline', label: 'Evcil Hayvan', color: '#C98F4A' },
  { icon: 'gift-outline', label: 'Hediye', color: '#E0618E' },
  { icon: 'people-outline', label: 'Kişisel / Aile', color: '#6C7A89' },
  { icon: 'business-outline', label: 'İşyeri / Kurumsal', color: '#5B6472' },
  { icon: 'briefcase-outline', label: 'Maaş / İş Geliri', color: '#3E8E5A' },
  { icon: 'trending-up-outline', label: 'Ek Gelir', color: '#52CE96' },
  { icon: 'rocket-outline', label: 'Yatırım', color: '#6B4DFF' },
  { icon: 'cash-outline', label: 'Nakit', color: '#52CE96' },
  { icon: 'pricetag-outline', label: 'Etiket', color: '#8B8D98' },
  { icon: 'ellipsis-horizontal-outline', label: 'Diğer', color: '#8B8D98' },
];

const COLOR_BY_ICON: Record<string, string> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((o) => [o.icon, o.color])
);

const FALLBACK_COLOR = '#8B8D98';

// Kullanıcı serbest bir ikon seçebildiği için (veya eski kayıtlarda icon boş olabilir)
// eşleşme yoksa nötr bir gri rozete düşülür — kırık/rastgele renk yerine.
export function getCategoryIconColor(icon?: string | null): string {
  if (!icon) return FALLBACK_COLOR;
  return COLOR_BY_ICON[icon] ?? FALLBACK_COLOR;
}
