// docs/01-finansal-kayit-modeli.md §3.5 — bir borç/alacak yalnızca fiat para biriminde
// değil, kıymetli maden cinsinden de tutulabilir. Bu dosya, obligations.currency_code'un
// kabul ettiği sabit "değer birimi" kümesini tanımlar (bkz. docs/05-veri-modeli.md §9.4.1).
// Kod tabanında ISO 4217 dışı bir sabit liste olduğu için (features/banks/banks.ts'teki
// BANKS ile aynı gerekçe) burada, uygulama içinde sabit tutulur.

export type ValueUnitType = 'fiat' | 'kiymetli_maden';

export interface ValueUnit {
  code: string;
  name: string;
  unitType: ValueUnitType;
  /**
   * Tutarın en küçük ölçü birimine göre ondalık basamak sayısı (docs §8.1):
   * fiat ve gram_altin için 2 (kuruş/santigram), sikke birimleri için 0 (adet, ondalık yok).
   */
  precision: 0 | 2;
  /** Miktar girişinde kullanıcıya gösterilecek birim adı (ör. "gram", "adet"). */
  quantityLabel: string;
}

export const VALUE_UNITS: ValueUnit[] = [
  { code: 'TRY', name: 'Türk Lirası', unitType: 'fiat', precision: 2, quantityLabel: 'TL' },
  { code: 'USD', name: 'Amerikan Doları', unitType: 'fiat', precision: 2, quantityLabel: 'USD' },
  { code: 'EUR', name: 'Euro', unitType: 'fiat', precision: 2, quantityLabel: 'EUR' },
  { code: 'gram_altin', name: 'Gram Altın', unitType: 'kiymetli_maden', precision: 2, quantityLabel: 'gram' },
  { code: 'ceyrek_altin', name: 'Çeyrek Altın', unitType: 'kiymetli_maden', precision: 0, quantityLabel: 'adet' },
  { code: 'yarim_altin', name: 'Yarım Altın', unitType: 'kiymetli_maden', precision: 0, quantityLabel: 'adet' },
  { code: 'tam_altin', name: 'Tam Altın', unitType: 'kiymetli_maden', precision: 0, quantityLabel: 'adet' },
  { code: 'cumhuriyet_altini', name: 'Cumhuriyet Altını', unitType: 'kiymetli_maden', precision: 0, quantityLabel: 'adet' },
];

export const VALUE_UNIT_BY_CODE: Record<string, ValueUnit> = Object.fromEntries(
  VALUE_UNITS.map((u) => [u.code, u])
);

export const VALUE_UNIT_LABEL: Record<string, string> = Object.fromEntries(
  VALUE_UNITS.map((u) => [u.code, u.name])
);

export const VALUE_UNIT_ICON: Record<ValueUnitType, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  fiat: 'cash-outline',
  kiymetli_maden: 'diamond-outline',
};

/** Bilinmeyen/eski bir kod için güvenli varsayım: fiat, TRY davranışıyla aynı hassasiyet. */
export function getValueUnit(code: string | null | undefined): ValueUnit {
  if (!code) return VALUE_UNIT_BY_CODE.TRY;
  return VALUE_UNIT_BY_CODE[code] ?? { code, name: code, unitType: 'fiat', precision: 2, quantityLabel: code };
}
