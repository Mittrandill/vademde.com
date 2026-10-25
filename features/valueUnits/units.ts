// docs/01-finansal-kayit-modeli.md §3.5 — bir borç/alacak yalnızca fiat para biriminde
// değil, kıymetli maden cinsinden de tutulabilir. Bu dosya, obligations.currency_code'un
// kabul ettiği sabit "değer birimi" kümesini tanımlar (bkz. docs/05-veri-modeli.md §9.4.1).
// Kod tabanında ISO 4217 dışı bir sabit liste olduğu için (features/banks/banks.ts'teki
// BANKS ile aynı gerekçe) burada, uygulama içinde sabit tutulur.

import { t } from '@/i18n';
import { localizedRecord } from '@/i18n/localized';

export type ValueUnitType = 'fiat' | 'kiymetli_maden';

export interface ValueUnit {
  code: string;
  /** Uygulama diline göre (i18n domain.valueUnits) okunduğu anda çözülür. */
  readonly name: string;
  unitType: ValueUnitType;
  /**
   * Tutarın en küçük ölçü birimine göre ondalık basamak sayısı (docs §8.1):
   * fiat ve gram_altin için 2 (kuruş/santigram), sikke birimleri için 0 (adet, ondalık yok).
   */
  precision: 0 | 2;
  /** Miktar girişinde kullanıcıya gösterilecek birim adı (ör. "gram", "adet"). */
  readonly quantityLabel: string;
  /** MaterialCommunityIcons glyph adı — para birimleri için gerçek sembol (₺/$/€), altın
   * türleri için külçe/madalyon ikonu (bkz. ValueUnitPicker'daki dolgu+beyaz ikon dili). */
  icon: keyof typeof import('@expo/vector-icons').MaterialCommunityIcons.glyphMap;
  color: string;
}

export const VALUE_UNITS: ValueUnit[] = [
  { code: 'TRY', get name() { return t('domain.valueUnits.TRY.name'); }, unitType: 'fiat', precision: 2, get quantityLabel() { return t('domain.valueUnits.TRY.quantity'); }, icon: 'currency-try', color: '#3E8E5A' },
  { code: 'USD', get name() { return t('domain.valueUnits.USD.name'); }, unitType: 'fiat', precision: 2, get quantityLabel() { return t('domain.valueUnits.USD.quantity'); }, icon: 'currency-usd', color: '#4C8DFF' },
  { code: 'EUR', get name() { return t('domain.valueUnits.EUR.name'); }, unitType: 'fiat', precision: 2, get quantityLabel() { return t('domain.valueUnits.EUR.quantity'); }, icon: 'currency-eur', color: '#3457D5' },
  { code: 'gram_altin', get name() { return t('domain.valueUnits.gram_altin.name'); }, unitType: 'kiymetli_maden', precision: 2, get quantityLabel() { return t('domain.valueUnits.gram_altin.quantity'); }, icon: 'gold', color: '#F0B429' },
  { code: 'ceyrek_altin', get name() { return t('domain.valueUnits.ceyrek_altin.name'); }, unitType: 'kiymetli_maden', precision: 0, get quantityLabel() { return t('domain.valueUnits.ceyrek_altin.quantity'); }, icon: 'medal', color: '#C97B4A' },
  { code: 'yarim_altin', get name() { return t('domain.valueUnits.yarim_altin.name'); }, unitType: 'kiymetli_maden', precision: 0, get quantityLabel() { return t('domain.valueUnits.yarim_altin.quantity'); }, icon: 'medal', color: '#B98450' },
  { code: 'tam_altin', get name() { return t('domain.valueUnits.tam_altin.name'); }, unitType: 'kiymetli_maden', precision: 0, get quantityLabel() { return t('domain.valueUnits.tam_altin.quantity'); }, icon: 'medal', color: '#E8985E' },
  { code: 'cumhuriyet_altini', get name() { return t('domain.valueUnits.cumhuriyet_altini.name'); }, unitType: 'kiymetli_maden', precision: 0, get quantityLabel() { return t('domain.valueUnits.cumhuriyet_altini.quantity'); }, icon: 'medal', color: '#8B6BE0' },
];

export const VALUE_UNIT_BY_CODE: Record<string, ValueUnit> = Object.fromEntries(
  VALUE_UNITS.map((u) => [u.code, u])
);

export const VALUE_UNIT_LABEL: Record<string, string> = localizedRecord(
  VALUE_UNITS.map((u) => u.code),
  (code) => VALUE_UNIT_BY_CODE[code].name
);

/** Bilinmeyen/eski bir kod için güvenli varsayım: fiat, TRY davranışıyla aynı hassasiyet. */
export function getValueUnit(code: string | null | undefined): ValueUnit {
  if (!code) return VALUE_UNIT_BY_CODE.TRY;
  return (
    VALUE_UNIT_BY_CODE[code] ?? {
      code,
      name: code,
      unitType: 'fiat',
      precision: 2,
      quantityLabel: code,
      icon: 'cash',
      color: '#8B8D98',
    }
  );
}
