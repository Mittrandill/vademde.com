import { t } from '@/i18n';
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

// Eski kayıtlarda (color sütunu boş) veya renk seçilmeden kaydedilen kategorilerde
// ikondan renk türetmek için kullanılan küçük, elle küratörlüğü yapılmış eşleme —
// bkz. getCategoryIconColor. Kullanıcıya gösterilen ikon seçici artık bundan çok daha
// geniş (CATEGORY_ICON_CHOICES); renk ise kullanıcının kendi seçtiği CATEGORY_COLOR_PALETTE
// değeridir (bkz. app/categories/new.tsx).
export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { icon: 'cart', get label() { return t('categoryIcons.options.cart'); }, color: '#3FB27F' },
  { icon: 'restaurant', get label() { return t('categoryIcons.options.restaurant'); }, color: '#E8985E' },
  { icon: 'home', get label() { return t('categoryIcons.options.home'); }, color: '#C97B4A' },
  { icon: 'flash', get label() { return t('categoryIcons.options.flash'); }, color: '#F0B429' },
  { icon: 'car', get label() { return t('categoryIcons.options.car'); }, color: '#4C8DFF' },
  { icon: 'medkit', get label() { return t('categoryIcons.options.medkit'); }, color: '#F0616D' },
  { icon: 'school', get label() { return t('categoryIcons.options.school'); }, color: '#7C6FF0' },
  { icon: 'shirt', get label() { return t('categoryIcons.options.shirt'); }, color: '#E177B0' },
  { icon: 'game-controller', get label() { return t('categoryIcons.options.game-controller'); }, color: '#9B6BF2' },
  { icon: 'airplane', get label() { return t('categoryIcons.options.airplane'); }, color: '#2FA9C9' },
  { icon: 'cube', get label() { return t('categoryIcons.options.cube'); }, color: '#39B7C9' },
  { icon: 'construct', get label() { return t('categoryIcons.options.construct'); }, color: '#B98450' },
  { icon: 'shield-checkmark', get label() { return t('categoryIcons.options.shield-checkmark'); }, color: '#3457D5' },
  { icon: 'repeat', get label() { return t('categoryIcons.options.repeat'); }, color: '#8B6BE0' },
  { icon: 'paw', get label() { return t('categoryIcons.options.paw'); }, color: '#C98F4A' },
  { icon: 'gift', get label() { return t('categoryIcons.options.gift'); }, color: '#E0618E' },
  { icon: 'people', get label() { return t('categoryIcons.options.people'); }, color: '#6C7A89' },
  { icon: 'business', get label() { return t('categoryIcons.options.business'); }, color: '#5B6472' },
  { icon: 'briefcase', get label() { return t('categoryIcons.options.briefcase'); }, color: '#3E8E5A' },
  { icon: 'trending-up', get label() { return t('categoryIcons.options.trending-up'); }, color: '#52CE96' },
  { icon: 'rocket', get label() { return t('categoryIcons.options.rocket'); }, color: '#6B4DFF' },
  { icon: 'cash', get label() { return t('categoryIcons.options.cash'); }, color: '#52CE96' },
  { icon: 'pricetag', get label() { return t('categoryIcons.options.pricetag'); }, color: '#8B8D98' },
  { icon: 'ellipsis-horizontal', get label() { return t('categoryIcons.options.ellipsis-horizontal'); }, color: '#8B8D98' },
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

export interface CategoryIconChoice {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

// Kategori düzenleme ekranındaki ikon seçici — kullanıcı "standart" 24 ikonla sınırlı
// kalmasın diye çok daha geniş, aranabilir bir liste (bkz. app/categories/new.tsx'teki
// arama kutusu). Renkten bağımsızdır: ikon burada, renk CATEGORY_COLOR_PALETTE'ten
// ayrı ayrı seçilir.
export const CATEGORY_ICON_CHOICES: CategoryIconChoice[] = [
  { icon: 'cart', get label() { return t('categoryIcons.choices.cart'); } },
  { icon: 'basket', get label() { return t('categoryIcons.choices.basket'); } },
  { icon: 'restaurant', get label() { return t('categoryIcons.choices.restaurant'); } },
  { icon: 'fast-food', get label() { return t('categoryIcons.choices.fast-food'); } },
  { icon: 'pizza', get label() { return t('categoryIcons.choices.pizza'); } },
  { icon: 'cafe', get label() { return t('categoryIcons.choices.cafe'); } },
  { icon: 'wine', get label() { return t('categoryIcons.choices.wine'); } },
  { icon: 'beer', get label() { return t('categoryIcons.choices.beer'); } },
  { icon: 'ice-cream', get label() { return t('categoryIcons.choices.ice-cream'); } },
  { icon: 'nutrition', get label() { return t('categoryIcons.choices.nutrition'); } },
  { icon: 'egg', get label() { return t('categoryIcons.choices.egg'); } },
  { icon: 'home', get label() { return t('categoryIcons.choices.home'); } },
  { icon: 'bed', get label() { return t('categoryIcons.choices.bed'); } },
  { icon: 'key', get label() { return t('categoryIcons.choices.key'); } },
  { icon: 'hammer', get label() { return t('categoryIcons.choices.hammer'); } },
  { icon: 'construct', get label() { return t('categoryIcons.choices.construct'); } },
  { icon: 'color-palette', get label() { return t('categoryIcons.choices.color-palette'); } },
  { icon: 'car', get label() { return t('categoryIcons.choices.car'); } },
  { icon: 'car-sport', get label() { return t('categoryIcons.choices.car-sport'); } },
  { icon: 'bicycle', get label() { return t('categoryIcons.choices.bicycle'); } },
  { icon: 'bus', get label() { return t('categoryIcons.choices.bus'); } },
  { icon: 'train', get label() { return t('categoryIcons.choices.train'); } },
  { icon: 'boat', get label() { return t('categoryIcons.choices.boat'); } },
  { icon: 'airplane', get label() { return t('categoryIcons.choices.airplane'); } },
  { icon: 'walk', get label() { return t('categoryIcons.choices.walk'); } },
  { icon: 'footsteps', get label() { return t('categoryIcons.choices.footsteps'); } },
  { icon: 'compass', get label() { return t('categoryIcons.choices.compass'); } },
  { icon: 'map', get label() { return t('categoryIcons.choices.map'); } },
  { icon: 'globe', get label() { return t('categoryIcons.choices.globe'); } },
  { icon: 'location', get label() { return t('categoryIcons.choices.location'); } },
  { icon: 'flash', get label() { return t('categoryIcons.choices.flash'); } },
  { icon: 'water', get label() { return t('categoryIcons.choices.water'); } },
  { icon: 'wifi', get label() { return t('categoryIcons.choices.wifi'); } },
  { icon: 'call', get label() { return t('categoryIcons.choices.call'); } },
  { icon: 'mail', get label() { return t('categoryIcons.choices.mail'); } },
  { icon: 'tv', get label() { return t('categoryIcons.choices.tv'); } },
  { icon: 'radio', get label() { return t('categoryIcons.choices.radio'); } },
  { icon: 'print', get label() { return t('categoryIcons.choices.print'); } },
  { icon: 'medkit', get label() { return t('categoryIcons.choices.medkit'); } },
  { icon: 'fitness', get label() { return t('categoryIcons.choices.fitness'); } },
  { icon: 'bandage', get label() { return t('categoryIcons.choices.bandage'); } },
  { icon: 'heart', get label() { return t('categoryIcons.choices.heart'); } },
  { icon: 'heart-circle', get label() { return t('categoryIcons.choices.heart-circle'); } },
  { icon: 'pulse', get label() { return t('categoryIcons.choices.pulse'); } },
  { icon: 'body', get label() { return t('categoryIcons.choices.body'); } },
  { icon: 'school', get label() { return t('categoryIcons.choices.school'); } },
  { icon: 'book', get label() { return t('categoryIcons.choices.book'); } },
  { icon: 'library', get label() { return t('categoryIcons.choices.library'); } },
  { icon: 'pencil', get label() { return t('categoryIcons.choices.pencil'); } },
  { icon: 'calculator', get label() { return t('categoryIcons.choices.calculator'); } },
  { icon: 'shirt', get label() { return t('categoryIcons.choices.shirt'); } },
  { icon: 'bag', get label() { return t('categoryIcons.choices.bag'); } },
  { icon: 'diamond', get label() { return t('categoryIcons.choices.diamond'); } },
  { icon: 'glasses', get label() { return t('categoryIcons.choices.glasses'); } },
  { icon: 'watch', get label() { return t('categoryIcons.choices.watch'); } },
  { icon: 'game-controller', get label() { return t('categoryIcons.choices.game-controller'); } },
  { icon: 'film', get label() { return t('categoryIcons.choices.film'); } },
  { icon: 'musical-notes', get label() { return t('categoryIcons.choices.musical-notes'); } },
  { icon: 'headset', get label() { return t('categoryIcons.choices.headset'); } },
  { icon: 'ticket', get label() { return t('categoryIcons.choices.ticket'); } },
  { icon: 'camera', get label() { return t('categoryIcons.choices.camera'); } },
  { icon: 'videocam', get label() { return t('categoryIcons.choices.videocam'); } },
  { icon: 'color-wand', get label() { return t('categoryIcons.choices.color-wand'); } },
  { icon: 'football', get label() { return t('categoryIcons.choices.football'); } },
  { icon: 'basketball', get label() { return t('categoryIcons.choices.basketball'); } },
  { icon: 'tennisball', get label() { return t('categoryIcons.choices.tennisball'); } },
  { icon: 'barbell', get label() { return t('categoryIcons.choices.barbell'); } },
  { icon: 'golf', get label() { return t('categoryIcons.choices.golf'); } },
  { icon: 'cash', get label() { return t('categoryIcons.choices.cash'); } },
  { icon: 'wallet', get label() { return t('categoryIcons.choices.wallet'); } },
  { icon: 'card', get label() { return t('categoryIcons.choices.card'); } },
  { icon: 'business', get label() { return t('categoryIcons.choices.business'); } },
  { icon: 'briefcase', get label() { return t('categoryIcons.choices.briefcase'); } },
  { icon: 'trending-up', get label() { return t('categoryIcons.choices.trending-up'); } },
  { icon: 'trending-down', get label() { return t('categoryIcons.choices.trending-down'); } },
  { icon: 'stats-chart', get label() { return t('categoryIcons.choices.stats-chart'); } },
  { icon: 'receipt', get label() { return t('categoryIcons.choices.receipt'); } },
  { icon: 'rocket', get label() { return t('categoryIcons.choices.rocket'); } },
  { icon: 'people', get label() { return t('categoryIcons.choices.people'); } },
  { icon: 'person', get label() { return t('categoryIcons.choices.person'); } },
  { icon: 'person-add', get label() { return t('categoryIcons.choices.person-add'); } },
  { icon: 'paw', get label() { return t('categoryIcons.choices.paw'); } },
  { icon: 'gift', get label() { return t('categoryIcons.choices.gift'); } },
  { icon: 'star', get label() { return t('categoryIcons.choices.star'); } },
  { icon: 'trophy', get label() { return t('categoryIcons.choices.trophy'); } },
  { icon: 'ribbon', get label() { return t('categoryIcons.choices.ribbon'); } },
  { icon: 'flag', get label() { return t('categoryIcons.choices.flag'); } },
  { icon: 'flame', get label() { return t('categoryIcons.choices.flame'); } },
  { icon: 'leaf', get label() { return t('categoryIcons.choices.leaf'); } },
  { icon: 'flower', get label() { return t('categoryIcons.choices.flower'); } },
  { icon: 'rose', get label() { return t('categoryIcons.choices.rose'); } },
  { icon: 'balloon', get label() { return t('categoryIcons.choices.balloon'); } },
  { icon: 'shield-checkmark', get label() { return t('categoryIcons.choices.shield-checkmark'); } },
  { icon: 'shield', get label() { return t('categoryIcons.choices.shield'); } },
  { icon: 'document-text', get label() { return t('categoryIcons.choices.document-text'); } },
  { icon: 'document', get label() { return t('categoryIcons.choices.document'); } },
  { icon: 'folder', get label() { return t('categoryIcons.choices.folder'); } },
  { icon: 'clipboard', get label() { return t('categoryIcons.choices.clipboard'); } },
  { icon: 'settings', get label() { return t('categoryIcons.choices.settings'); } },
  { icon: 'hardware-chip', get label() { return t('categoryIcons.choices.hardware-chip'); } },
  { icon: 'happy', get label() { return t('categoryIcons.choices.happy'); } },
  { icon: 'sunny', get label() { return t('categoryIcons.choices.sunny'); } },
  { icon: 'rainy', get label() { return t('categoryIcons.choices.rainy'); } },
  { icon: 'snow', get label() { return t('categoryIcons.choices.snow'); } },
  { icon: 'thunderstorm', get label() { return t('categoryIcons.choices.thunderstorm'); } },
  { icon: 'umbrella', get label() { return t('categoryIcons.choices.umbrella'); } },
  { icon: 'repeat', get label() { return t('categoryIcons.choices.repeat'); } },
  { icon: 'apps', get label() { return t('categoryIcons.choices.apps'); } },
  { icon: 'cube', get label() { return t('categoryIcons.choices.cube'); } },
  { icon: 'layers', get label() { return t('categoryIcons.choices.layers'); } },
  { icon: 'pricetag', get label() { return t('categoryIcons.choices.pricetag'); } },
  { icon: 'ellipsis-horizontal', get label() { return t('categoryIcons.choices.ellipsis-horizontal'); } },
];

// Kullanıcı bir ikon seçtikten sonra öneri olarak sunulan, ikonun rengiyle eşleşen
// varsayılan renk — CATEGORY_ICON_OPTIONS'ta varsa oradan, yoksa paletin ilk rengi.
export function getSuggestedColorForIcon(icon: string): string {
  return COLOR_BY_ICON[icon] ?? CATEGORY_COLOR_PALETTE[0];
}

// docs/08-tasarim-sistemi.md ile uyumlu, geniş ve doygun bir renk paleti — kategori
// rengi artık ikondan otomatik türetilmiyor, kullanıcı burada bağımsız olarak seçiyor
// (bkz. app/categories/new.tsx). Serbest hex girişiyle birlikte kullanılır, bu yüzden
// tam bir renk seçici değil, hızlı seçim için bir başlangıç noktasıdır.
export const CATEGORY_COLOR_PALETTE: string[] = [
  '#3FB27F',
  '#52CE96',
  '#3E8E5A',
  '#39B7C9',
  '#2FA9C9',
  '#4C8DFF',
  '#3457D5',
  '#6B4DFF',
  '#7C6FF0',
  '#9B6BF2',
  '#8B6BE0',
  '#E177B0',
  '#E0618E',
  '#F0616D',
  '#FF625C',
  '#E8985E',
  '#C97B4A',
  '#C98F4A',
  '#B98450',
  '#F0B429',
  '#FFB000',
  '#6C7A89',
  '#5B6472',
  '#8B8D98',
];
