import type { Ionicons } from '@expo/vector-icons';

// docs/01-finansal-kayit-modeli.md §3.2 — finansal kayıt/belge türleri.
// docs/08-tasarim-sistemi.md §12.9 — her belge türü kendi ikonunu taşır.
export interface DocumentTypeOption {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  // docs/08-tasarim-sistemi.md §12.9 — banka/servis logosu eşleşmediğinde (bkz.
  // components/finance/BankLogo.tsx fallbackColor) her belge türü tek bir paylaşılan
  // mor yerine kendi rengiyle ayrışır; kategorilerdeki aynı ilke (categoryIcons.ts).
  color: string;
}

export const DOCUMENT_TYPES: DocumentTypeOption[] = [
  { id: 'kredi', name: 'Kredi', icon: 'cash', color: '#3E8E5A' },
  { id: 'kredi_karti_ekstresi', name: 'Kredi Kartı Ekstresi', icon: 'card', color: '#4C8DFF' },
  { id: 'cek', name: 'Çek', icon: 'document-text', color: '#2FA9C9' },
  { id: 'senet', name: 'Senet', icon: 'reader', color: '#7C6FF0' },
  { id: 'fatura', name: 'Fatura', icon: 'receipt', color: '#F0B429' },
  { id: 'abonelik', name: 'Abonelik', icon: 'repeat', color: '#8B6BE0' },
  { id: 'kira', name: 'Kira', icon: 'home', color: '#C97B4A' },
  { id: 'vergi_sgk', name: 'Vergi / SGK', icon: 'shield-checkmark', color: '#3457D5' },
  { id: 'tedarikci_borcu', name: 'Tedarikçi Borcu', icon: 'cube', color: '#39B7C9' },
  { id: 'musteri_alacagi', name: 'Müşteri Alacağı', icon: 'people', color: '#52CE96' },
  { id: 'banka_dekontu', name: 'Banka Dekontu', icon: 'business', color: '#5B6472' },
  { id: 'makbuz_fis', name: 'Makbuz / Fiş', icon: 'clipboard', color: '#E8985E' },
  { id: 'sozlesme_odeme_plani', name: 'Sözleşme / Ödeme Planı', icon: 'document-attach', color: '#E177B0' },
  { id: 'diger', name: 'Diğer', icon: 'ellipsis-horizontal', color: '#8B8D98' },
];

export const DOCUMENT_TYPE_COLOR: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.id, t.color])
);

const FALLBACK_DOCUMENT_TYPE_COLOR = '#8B8D98';

export function getDocumentTypeColor(documentType?: string | null): string {
  if (!documentType) return FALLBACK_DOCUMENT_TYPE_COLOR;
  return DOCUMENT_TYPE_COLOR[documentType] ?? FALLBACK_DOCUMENT_TYPE_COLOR;
}

export const DOCUMENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.id, t.name])
);

// Türkçe çoğul/iyelik eki programatik türetilemez (bkz. app/paywall/index.tsx
// PLAN_CTA_LABELS yorumu) — liste ekranı başlığı için elle yazılmış eşleme.
export const DOCUMENT_TYPE_LABEL_PLURAL: Record<string, string> = {
  kredi: 'Kredilerim',
  kredi_karti_ekstresi: 'Kredi Kartı Ekstrelerim',
  cek: 'Çeklerim',
  senet: 'Senetlerim',
  fatura: 'Faturalarım',
  abonelik: 'Aboneliklerim',
  kira: 'Kira Ödemelerim',
  vergi_sgk: 'Vergi / SGK Kayıtlarım',
  tedarikci_borcu: 'Tedarikçi Borçlarım',
  musteri_alacagi: 'Müşteri Alacaklarım',
  banka_dekontu: 'Banka Dekontlarım',
  makbuz_fis: 'Makbuz / Fişlerim',
  sozlesme_odeme_plani: 'Sözleşme / Ödeme Planlarım',
  diger: 'Diğer Kayıtlarım',
};

export const DOCUMENT_TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.id, t.icon])
);

// Bu belge türleri bir banka tarafından düzenlenir; diğerlerinde (senet, fatura vb.) banka alanı yoktur.
export const BANK_DOCUMENT_TYPES = new Set(['kredi', 'kredi_karti_ekstresi', 'cek']);

// Bu belge türlerinde karşı taraf gerçekten bankadır (banka kimliği bank_code/logo üzerinden
// temsil edilir) — kişi/firma alanı bu ikisinde anlamsızdır. Çek/senet'te ise durum farklı:
// çekte hem düzenleyen bankası hem de ayrı bir lehtar/karşı taraf vardır (docs/04-ocr-belge-isleme.md
// §7.1) — bu yüzden BANK_DOCUMENT_TYPES'tan (banka alanı görünürlüğü) ayrı tutulur.
export const COUNTERPARTY_LESS_DOCUMENT_TYPES = new Set(['kredi', 'kredi_karti_ekstresi']);
