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
  { id: 'nakit_avans', name: 'Nakit Avans', icon: 'cash-outline', color: '#FF7A59' },
  { id: 'cek', name: 'Çek', icon: 'document-text', color: '#2FA9C9' },
  { id: 'senet', name: 'Senet', icon: 'reader', color: '#7C6FF0' },
  { id: 'fatura', name: 'Fatura', icon: 'receipt', color: '#F0B429' },
  { id: 'abonelik', name: 'Abonelik', icon: 'repeat', color: '#8B6BE0' },
  { id: 'kira', name: 'Kira', icon: 'home', color: '#C97B4A' },
  { id: 'maas', name: 'Personel Maaşı', icon: 'person-circle', color: '#6C7A89' },
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
  nakit_avans: 'Nakit Avanslarım',
  cek: 'Çeklerim',
  senet: 'Senetlerim',
  fatura: 'Faturalarım',
  abonelik: 'Aboneliklerim',
  kira: 'Kira Ödemelerim',
  maas: 'Personel Maaşları',
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
// §7.1) — bu yüzden BANK_DOCUMENT_TYPES'tan (banka alanı görünürlüğü) ayrı tutulur. Nakit avans'ta
// da karşı taraf yoktur ama bankası ayrıca seçilmez — zaten seçilen HESAP (kredi kartı) kendi
// bank_code'unu taşır, bu yüzden BANK_DOCUMENT_TYPES'a değil yalnızca buraya eklenir.
export const COUNTERPARTY_LESS_DOCUMENT_TYPES = new Set(['kredi', 'kredi_karti_ekstresi', 'nakit_avans']);

// Bu belge türlerinde girilen TUTAR doğal olarak TOPLAM borcu ifade eder: kredinin anaparası,
// çekin/senedin yazılı tutarı, ekstrenin dönem borcu. Vade sayısı > 1 ise bu toplam vadelere
// bölünür (bkz. utils/installmentPlan.ts buildAmortizedInstallments).
//
// Diğer tüm türlerde (maaş, kira, abonelik, vergi/SGK, fatura, sözleşme ödeme planı,
// tedarikçi borcu, müşteri alacağı, diğer) tutar HER VADENİN tutarıdır — 4 ay boyunca aylık
// 28.075,50 ₺ maaş, dört ayrı 28.075,50 ₺ vade demektir; toplamın dörde bölünmesi değil.
//
// Bu yalnızca VARSAYILAN'dır: kullanıcı formda "Toplam tutar / Her vade tutarı" seçimini her
// zaman değiştirebilir (bkz. app/obligations/new.tsx amountMode) — örneğin toplamı belli olan,
// 4 taksite bölünmüş bir sözleşme de girilebilir.
export const TOTAL_AMOUNT_DOCUMENT_TYPES = new Set([
  'kredi',
  'kredi_karti_ekstresi',
  'nakit_avans',
  'cek',
  'senet',
  'banka_dekontu',
  'makbuz_fis',
]);

export type ObligationAmountMode = 'total' | 'per_installment';

export function getDefaultAmountMode(documentType: string | null): ObligationAmountMode {
  if (!documentType) return 'total';
  return TOTAL_AMOUNT_DOCUMENT_TYPES.has(documentType) ? 'total' : 'per_installment';
}

// Faiz yalnızca gerçekten azalan bakiye üzerinden işleyen türlerde sorulur; "her vade"
// modunda girilen tutar zaten ödenecek nihai tutardır, üzerine amortisman uygulanmaz.
export const INTEREST_DOCUMENT_TYPES = new Set(['kredi', 'nakit_avans']);

// Vade etiketi belge türüne göre değişir: kredide "taksit", maaş/kira/abonelik gibi
// tekrarlayan kayıtlarda "ay" daha doğrudur (kullanıcı 4 taksit değil 4 ay girer).
const MONTHLY_PERIOD_DOCUMENT_TYPES = new Set(['abonelik', 'kira', 'maas', 'vergi_sgk']);

export interface InstallmentUnitLabels {
  /** "KAÇ AY" / "TAKSİT SAYISI" gibi alan etiketi için. */
  countLabel: string;
  /** "3. ay" / "3. taksit" gibi satır etiketi için (küçük harf). */
  unit: string;
  /** "4 aya bölünür" / "4 taksite bölünür" — Türkçe yönelme hâli eki ünlü uyumu nedeniyle
   * programatik türetilemez (bkz. DOCUMENT_TYPE_LABEL_PLURAL yorumu), elle yazılır. */
  unitDative: string;
  /** "AY ÖNİZLEME" / "TAKSİT ÖNİZLEME" gibi başlık için (büyük harf kullanılacak). */
  unitTitle: string;
}

export function getInstallmentUnitLabels(documentType: string | null): InstallmentUnitLabels {
  const monthly = !!documentType && MONTHLY_PERIOD_DOCUMENT_TYPES.has(documentType);
  return monthly
    ? { countLabel: 'KAÇ AY', unit: 'ay', unitDative: 'aya', unitTitle: 'Ay' }
    : { countLabel: 'TAKSİT SAYISI', unit: 'taksit', unitDative: 'taksite', unitTitle: 'Taksit' };
}
