import type { Ionicons } from '@expo/vector-icons';

// docs/01-finansal-kayit-modeli.md §3.2 — finansal kayıt/belge türleri.
// docs/08-tasarim-sistemi.md §12.9 — her belge türü kendi ikonunu taşır.
export interface DocumentTypeOption {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const DOCUMENT_TYPES: DocumentTypeOption[] = [
  { id: 'kredi', name: 'Kredi', icon: 'cash-outline' },
  { id: 'kredi_karti_ekstresi', name: 'Kredi Kartı Ekstresi', icon: 'card-outline' },
  { id: 'cek', name: 'Çek', icon: 'document-text-outline' },
  { id: 'senet', name: 'Senet', icon: 'reader-outline' },
  { id: 'fatura', name: 'Fatura', icon: 'receipt-outline' },
  { id: 'abonelik', name: 'Abonelik', icon: 'repeat-outline' },
  { id: 'kira', name: 'Kira', icon: 'home-outline' },
  { id: 'vergi_sgk', name: 'Vergi / SGK', icon: 'shield-checkmark-outline' },
  { id: 'tedarikci_borcu', name: 'Tedarikçi Borcu', icon: 'cube-outline' },
  { id: 'musteri_alacagi', name: 'Müşteri Alacağı', icon: 'people-outline' },
  { id: 'banka_dekontu', name: 'Banka Dekontu', icon: 'business-outline' },
  { id: 'makbuz_fis', name: 'Makbuz / Fiş', icon: 'clipboard-outline' },
  { id: 'sozlesme_odeme_plani', name: 'Sözleşme / Ödeme Planı', icon: 'document-attach-outline' },
  { id: 'diger', name: 'Diğer', icon: 'ellipsis-horizontal-outline' },
];

export const DOCUMENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.id, t.name])
);

export const DOCUMENT_TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.id, t.icon])
);

// Bu belge türleri bir banka tarafından düzenlenir; diğerlerinde (senet, fatura vb.) banka alanı yoktur.
export const BANK_DOCUMENT_TYPES = new Set(['kredi', 'kredi_karti_ekstresi', 'cek']);
