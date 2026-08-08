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
  { icon: 'cart', label: 'Market', color: '#3FB27F' },
  { icon: 'restaurant', label: 'Restoran / Kafe', color: '#E8985E' },
  { icon: 'home', label: 'Kira / Ev', color: '#C97B4A' },
  { icon: 'flash', label: 'Faturalar', color: '#F0B429' },
  { icon: 'car', label: 'Ulaşım', color: '#4C8DFF' },
  { icon: 'medkit', label: 'Sağlık', color: '#F0616D' },
  { icon: 'school', label: 'Eğitim', color: '#7C6FF0' },
  { icon: 'shirt', label: 'Giyim', color: '#E177B0' },
  { icon: 'game-controller', label: 'Eğlence', color: '#9B6BF2' },
  { icon: 'airplane', label: 'Seyahat', color: '#2FA9C9' },
  { icon: 'cube', label: 'Alışveriş', color: '#39B7C9' },
  { icon: 'construct', label: 'Bakım / Tamir', color: '#B98450' },
  { icon: 'shield-checkmark', label: 'Sigorta', color: '#3457D5' },
  { icon: 'repeat', label: 'Abonelik', color: '#8B6BE0' },
  { icon: 'paw', label: 'Evcil Hayvan', color: '#C98F4A' },
  { icon: 'gift', label: 'Hediye', color: '#E0618E' },
  { icon: 'people', label: 'Kişisel / Aile', color: '#6C7A89' },
  { icon: 'business', label: 'İşyeri / Kurumsal', color: '#5B6472' },
  { icon: 'briefcase', label: 'Maaş / İş Geliri', color: '#3E8E5A' },
  { icon: 'trending-up', label: 'Ek Gelir', color: '#52CE96' },
  { icon: 'rocket', label: 'Yatırım', color: '#6B4DFF' },
  { icon: 'cash', label: 'Nakit', color: '#52CE96' },
  { icon: 'pricetag', label: 'Etiket', color: '#8B8D98' },
  { icon: 'ellipsis-horizontal', label: 'Diğer', color: '#8B8D98' },
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
  { icon: 'cart', label: 'Market' },
  { icon: 'basket', label: 'Alışveriş sepeti' },
  { icon: 'restaurant', label: 'Restoran / Kafe' },
  { icon: 'fast-food', label: 'Fast Food' },
  { icon: 'pizza', label: 'Pizza' },
  { icon: 'cafe', label: 'Kahve' },
  { icon: 'wine', label: 'Şarap' },
  { icon: 'beer', label: 'Bira' },
  { icon: 'ice-cream', label: 'Dondurma' },
  { icon: 'nutrition', label: 'Beslenme' },
  { icon: 'egg', label: 'Gıda' },
  { icon: 'home', label: 'Kira / Ev' },
  { icon: 'bed', label: 'Yatak Odası' },
  { icon: 'key', label: 'Anahtar / Emlak' },
  { icon: 'hammer', label: 'Tadilat' },
  { icon: 'construct', label: 'Bakım / Tamir' },
  { icon: 'color-palette', label: 'Dekorasyon' },
  { icon: 'car', label: 'Ulaşım' },
  { icon: 'car-sport', label: 'Otomobil' },
  { icon: 'bicycle', label: 'Bisiklet' },
  { icon: 'bus', label: 'Otobüs' },
  { icon: 'train', label: 'Tren' },
  { icon: 'boat', label: 'Tekne' },
  { icon: 'airplane', label: 'Seyahat / Uçak' },
  { icon: 'walk', label: 'Yürüyüş' },
  { icon: 'footsteps', label: 'Adım' },
  { icon: 'compass', label: 'Pusula' },
  { icon: 'map', label: 'Harita' },
  { icon: 'globe', label: 'Dünya' },
  { icon: 'location', label: 'Konum' },
  { icon: 'flash', label: 'Elektrik / Faturalar' },
  { icon: 'water', label: 'Su' },
  { icon: 'wifi', label: 'İnternet' },
  { icon: 'call', label: 'Telefon' },
  { icon: 'mail', label: 'Posta / E-posta' },
  { icon: 'tv', label: 'Televizyon' },
  { icon: 'radio', label: 'Radyo' },
  { icon: 'print', label: 'Yazıcı' },
  { icon: 'medkit', label: 'Sağlık' },
  { icon: 'fitness', label: 'Spor / Fitness' },
  { icon: 'bandage', label: 'İlk Yardım' },
  { icon: 'heart', label: 'Kalp / Sağlık' },
  { icon: 'heart-circle', label: 'Sevgili / İlişki' },
  { icon: 'pulse', label: 'Nabız' },
  { icon: 'body', label: 'Vücut / Bakım' },
  { icon: 'school', label: 'Eğitim' },
  { icon: 'book', label: 'Kitap' },
  { icon: 'library', label: 'Kütüphane' },
  { icon: 'pencil', label: 'Kırtasiye' },
  { icon: 'calculator', label: 'Hesap Makinesi' },
  { icon: 'shirt', label: 'Giyim' },
  { icon: 'bag', label: 'Çanta' },
  { icon: 'diamond', label: 'Mücevher' },
  { icon: 'glasses', label: 'Gözlük' },
  { icon: 'watch', label: 'Saat' },
  { icon: 'game-controller', label: 'Eğlence / Oyun' },
  { icon: 'film', label: 'Sinema' },
  { icon: 'musical-notes', label: 'Müzik' },
  { icon: 'headset', label: 'Kulaklık' },
  { icon: 'ticket', label: 'Bilet' },
  { icon: 'camera', label: 'Fotoğraf' },
  { icon: 'videocam', label: 'Video' },
  { icon: 'color-wand', label: 'Hobi' },
  { icon: 'football', label: 'Futbol' },
  { icon: 'basketball', label: 'Basketbol' },
  { icon: 'tennisball', label: 'Tenis' },
  { icon: 'barbell', label: 'Ağırlık / Spor Salonu' },
  { icon: 'golf', label: 'Golf' },
  { icon: 'cash', label: 'Nakit' },
  { icon: 'wallet', label: 'Cüzdan' },
  { icon: 'card', label: 'Kart' },
  { icon: 'business', label: 'İşyeri / Kurumsal' },
  { icon: 'briefcase', label: 'Maaş / İş Geliri' },
  { icon: 'trending-up', label: 'Ek Gelir / Artış' },
  { icon: 'trending-down', label: 'Azalış' },
  { icon: 'stats-chart', label: 'İstatistik' },
  { icon: 'receipt', label: 'Fiş / Fatura' },
  { icon: 'rocket', label: 'Yatırım' },
  { icon: 'people', label: 'Kişisel / Aile' },
  { icon: 'person', label: 'Kişi' },
  { icon: 'person-add', label: 'Yeni Kişi' },
  { icon: 'paw', label: 'Evcil Hayvan' },
  { icon: 'gift', label: 'Hediye' },
  { icon: 'star', label: 'Yıldız' },
  { icon: 'trophy', label: 'Ödül' },
  { icon: 'ribbon', label: 'Rozet' },
  { icon: 'flag', label: 'Bayrak' },
  { icon: 'flame', label: 'Alev' },
  { icon: 'leaf', label: 'Doğa' },
  { icon: 'flower', label: 'Çiçek' },
  { icon: 'rose', label: 'Gül' },
  { icon: 'balloon', label: 'Balon' },
  { icon: 'shield-checkmark', label: 'Sigorta' },
  { icon: 'shield', label: 'Güvenlik' },
  { icon: 'document-text', label: 'Belge' },
  { icon: 'document', label: 'Doküman' },
  { icon: 'folder', label: 'Klasör' },
  { icon: 'clipboard', label: 'Pano' },
  { icon: 'settings', label: 'Ayarlar' },
  { icon: 'hardware-chip', label: 'Teknoloji' },
  { icon: 'happy', label: 'Mutlu / Bebek' },
  { icon: 'sunny', label: 'Güneş' },
  { icon: 'rainy', label: 'Yağmur' },
  { icon: 'snow', label: 'Kar' },
  { icon: 'thunderstorm', label: 'Fırtına' },
  { icon: 'umbrella', label: 'Şemsiye' },
  { icon: 'repeat', label: 'Abonelik' },
  { icon: 'apps', label: 'Uygulamalar' },
  { icon: 'cube', label: 'Alışveriş Kutusu' },
  { icon: 'layers', label: 'Katmanlar' },
  { icon: 'pricetag', label: 'Etiket' },
  { icon: 'ellipsis-horizontal', label: 'Diğer' },
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
