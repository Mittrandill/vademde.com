import type { ImageSourcePropType } from 'react-native';

// docs/08-tasarim-sistemi.md — hesap, kredi, kredi kartı ekstresi ve çek kayıtlarını
// bankalarla eşleştirip yanında gerçek banka logosunu göstermek için sabit BDDK banka
// listesi. Kullanıcıya özel olmadığı ve değişmediği için Supabase'de ayrı bir tablo
// yerine burada, uygulama içinde sabit tutulur (bkz. accounts/obligations.bank_code).
export interface Bank {
  code: string;
  name: string;
}

export const BANKS: Bank[] = [
  { code: 'adabank', name: 'Adabank' },
  { code: 'akbank', name: 'Akbank' },
  { code: 'aktif-yatirim-bankasi', name: 'Aktif Yatırım Bankası' },
  { code: 'albaraka-turk-katilim-bankasi', name: 'Albaraka Türk Katılım Bankası' },
  { code: 'alternatif-bank', name: 'Alternatif Bank' },
  { code: 'anadolubank', name: 'Anadolubank' },
  { code: 'bank-mellat', name: 'Bank Mellat' },
  { code: 'bankpozitif-kredi-ve-kalkinma-bankasi', name: 'BankPozitif Kredi ve Kalkınma Bankası' },
  { code: 'birlesik-fon-bankasi', name: 'Birleşik Fon Bankası' },
  { code: 'burgan-bank', name: 'Burgan Bank' },
  { code: 'citibank', name: 'Citibank' },
  { code: 'colendi-bank', name: 'Colendi Bank' },
  { code: 'denizbank', name: 'DenizBank' },
  { code: 'deutsche-bank', name: 'Deutsche Bank' },
  { code: 'diler-yatirim-bankasi', name: 'Diler Yatırım Bankası' },
  { code: 'dunya-katilim-bankasi', name: 'Dünya Katılım Bankası' },
  { code: 'enpara-bank', name: 'Enpara.com' },
  { code: 'fibabanka', name: 'Fibabanka' },
  { code: 'golden-global-yatirim-bankasi', name: 'Golden Global Yatırım Bankası' },
  { code: 'gsd-yatirim-bankasi', name: 'GSD Yatırım Bankası' },
  { code: 'habib-bank-limited', name: 'Habib Bank Limited' },
  { code: 'hayat-finans-katilim-bankasi', name: 'Hayat Finans Katılım Bankası' },
  { code: 'hsbc-bank', name: 'HSBC Bank' },
  { code: 'icbc-turkey-bank', name: 'ICBC Turkey Bank' },
  { code: 'iller-bankasi', name: 'İller Bankası' },
  { code: 'ing-bank', name: 'ING Bank' },
  { code: 'intesa-sanpaolo', name: 'Intesa Sanpaolo' },
  { code: 'istanbul-takas-ve-saklama-bankasi', name: 'İstanbul Takas ve Saklama Bankası (Takasbank)' },
  { code: 'jpmorgan-chase-bank', name: 'JPMorgan Chase Bank' },
  { code: 'kuveyt-turk-katilim-bankasi', name: 'Kuveyt Türk Katılım Bankası' },
  { code: 'merrill-lynch-yatirim-bank', name: 'Merrill Lynch Yatırım Bank' },
  { code: 'mufg-bank-turkey', name: 'MUFG Bank Turkey' },
  { code: 'nurol-yatirim-bankasi', name: 'Nurol Yatırım Bankası' },
  { code: 'odeabank', name: 'Odeabank' },
  { code: 'pasha-yatirim-bankasi', name: 'PASHA Yatırım Bankası' },
  { code: 'qnb-finansbank', name: 'QNB Finansbank' },
  { code: 'rabobank', name: 'Rabobank' },
  { code: 'sekerbank', name: 'Şekerbank' },
  { code: 'societe-generale', name: 'Société Générale' },
  { code: 'standard-chartered-yatirim-bankasi-turk', name: 'Standard Chartered Yatırım Bankası Türk' },
  { code: 'turk-eximbank', name: 'Türk Eximbank' },
  { code: 'turk-ticaret-bankasi', name: 'Türk Ticaret Bankası' },
  { code: 'turkish-bank', name: 'Turkish Bank' },
  { code: 'turkiye-ekonomi-bankasi', name: 'Türkiye Ekonomi Bankası (TEB)' },
  { code: 'turkiye-emlak-katilim-bankasi', name: 'Türkiye Emlak Katılım Bankası' },
  { code: 'turkiye-finans-katilim-bankasi', name: 'Türkiye Finans Katılım Bankası' },
  { code: 'turkiye-garanti-bankasi', name: 'Türkiye Garanti Bankası (Garanti BBVA)' },
  { code: 'turkiye-halk-bankasi', name: 'Türkiye Halk Bankası (Halkbank)' },
  { code: 'turkiye-is-bankasi', name: 'Türkiye İş Bankası' },
  { code: 'turkiye-kalkinma-ve-yatirim-bankasi', name: 'Türkiye Kalkınma ve Yatırım Bankası' },
  { code: 'turkiye-sinai-kalkinma-bankasi', name: 'Türkiye Sınai Kalkınma Bankası (TSKB)' },
  { code: 'vakif-katilim-bankasi', name: 'Vakıf Katılım Bankası' },
  { code: 'vakifbank', name: 'VakıfBank' },
  { code: 'yapi-kredi-bankasi', name: 'Yapı Kredi Bankası' },
  { code: 'ziraat-bankasi', name: 'Ziraat Bankası' },
  { code: 'ziraat-katilim-bankasi', name: 'Ziraat Katılım Bankası' },
];

export const BANK_NAME: Record<string, string> = Object.fromEntries(BANKS.map((b) => [b.code, b.name]));

function normalizeBankName(name: string): string {
  return name
    .toLocaleUpperCase('tr-TR')
    .replace(/A\.?\s?Ş\.?/g, '')
    .replace(/T\.?\s?A\.?\s?O\.?/g, '')
    .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, ' ')
    .trim();
}

// OCR'ın serbest metin olarak çıkardığı banka adını (örn. "TÜRKİYE İŞ BANKASI A.Ş.")
// sabit BANKS listesindeki koda eşler; belge türlerinde banka artık kişi/firma olarak
// değil doğrudan bu kod üzerinden (logosuyla) temsil edilir.
export function matchBankByName(rawName: string | null | undefined): string | null {
  if (!rawName) return null;
  const normalized = normalizeBankName(rawName);
  if (!normalized) return null;
  const match = BANKS.find((bank) => {
    const bankNormalized = normalizeBankName(bank.name);
    return normalized.includes(bankNormalized) || bankNormalized.includes(normalized);
  });
  return match?.code ?? null;
}

// Metro statik analizle bulabilsin diye her require() ayrı, literal bir satırda olmalı.
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  adabank: require('../../assets/bank-icons/adabank.png'),
  akbank: require('../../assets/bank-icons/akbank.png'),
  'aktif-yatirim-bankasi': require('../../assets/bank-icons/aktif-yatirim-bankasi.png'),
  'albaraka-turk-katilim-bankasi': require('../../assets/bank-icons/albaraka-turk-katilim-bankasi.png'),
  'alternatif-bank': require('../../assets/bank-icons/alternatif-bank.png'),
  anadolubank: require('../../assets/bank-icons/anadolubank.png'),
  'bank-mellat': require('../../assets/bank-icons/bank-mellat.png'),
  'bankpozitif-kredi-ve-kalkinma-bankasi': require('../../assets/bank-icons/bankpozitif-kredi-ve-kalkinma-bankasi.png'),
  'birlesik-fon-bankasi': require('../../assets/bank-icons/birlesik-fon-bankasi.png'),
  'burgan-bank': require('../../assets/bank-icons/burgan-bank.png'),
  citibank: require('../../assets/bank-icons/citibank.png'),
  'colendi-bank': require('../../assets/bank-icons/colendi-bank.png'),
  denizbank: require('../../assets/bank-icons/denizbank.png'),
  'deutsche-bank': require('../../assets/bank-icons/deutsche-bank.png'),
  'diler-yatirim-bankasi': require('../../assets/bank-icons/diler-yatirim-bankasi.png'),
  'dunya-katilim-bankasi': require('../../assets/bank-icons/dunya-katilim-bankasi.png'),
  'enpara-bank': require('../../assets/bank-icons/enpara-bank.png'),
  fibabanka: require('../../assets/bank-icons/fibabanka.png'),
  'golden-global-yatirim-bankasi': require('../../assets/bank-icons/golden-global-yatirim-bankasi.png'),
  'gsd-yatirim-bankasi': require('../../assets/bank-icons/gsd-yatirim-bankasi.png'),
  'habib-bank-limited': require('../../assets/bank-icons/habib-bank-limited.png'),
  'hayat-finans-katilim-bankasi': require('../../assets/bank-icons/hayat-finans-katilim-bankasi.png'),
  'hsbc-bank': require('../../assets/bank-icons/hsbc-bank.png'),
  'icbc-turkey-bank': require('../../assets/bank-icons/icbc-turkey-bank.png'),
  'iller-bankasi': require('../../assets/bank-icons/iller-bankasi.png'),
  'ing-bank': require('../../assets/bank-icons/ing-bank.png'),
  'intesa-sanpaolo': require('../../assets/bank-icons/intesa-sanpaolo.png'),
  'istanbul-takas-ve-saklama-bankasi': require('../../assets/bank-icons/istanbul-takas-ve-saklama-bankasi.png'),
  'jpmorgan-chase-bank': require('../../assets/bank-icons/jpmorgan-chase-bank.png'),
  'kuveyt-turk-katilim-bankasi': require('../../assets/bank-icons/kuveyt-turk-katilim-bankasi.png'),
  'merrill-lynch-yatirim-bank': require('../../assets/bank-icons/merrill-lynch-yatirim-bank.png'),
  'mufg-bank-turkey': require('../../assets/bank-icons/mufg-bank-turkey.png'),
  'nurol-yatirim-bankasi': require('../../assets/bank-icons/nurol-yatirim-bankasi.png'),
  odeabank: require('../../assets/bank-icons/odeabank.png'),
  'pasha-yatirim-bankasi': require('../../assets/bank-icons/pasha-yatirim-bankasi.png'),
  'qnb-finansbank': require('../../assets/bank-icons/qnb-finansbank.png'),
  rabobank: require('../../assets/bank-icons/rabobank.png'),
  sekerbank: require('../../assets/bank-icons/sekerbank.png'),
  'societe-generale': require('../../assets/bank-icons/societe-generale.png'),
  'standard-chartered-yatirim-bankasi-turk': require('../../assets/bank-icons/standard-chartered-yatirim-bankasi-turk.png'),
  'turk-eximbank': require('../../assets/bank-icons/turk-eximbank.png'),
  'turk-ticaret-bankasi': require('../../assets/bank-icons/turk-ticaret-bankasi.png'),
  'turkish-bank': require('../../assets/bank-icons/turkish-bank.png'),
  'turkiye-ekonomi-bankasi': require('../../assets/bank-icons/turkiye-ekonomi-bankasi.png'),
  'turkiye-emlak-katilim-bankasi': require('../../assets/bank-icons/turkiye-emlak-katilim-bankasi.png'),
  'turkiye-finans-katilim-bankasi': require('../../assets/bank-icons/turkiye-finans-katilim-bankasi.png'),
  'turkiye-garanti-bankasi': require('../../assets/bank-icons/turkiye-garanti-bankasi.png'),
  'turkiye-halk-bankasi': require('../../assets/bank-icons/turkiye-halk-bankasi.png'),
  'turkiye-is-bankasi': require('../../assets/bank-icons/turkiye-is-bankasi.png'),
  'turkiye-kalkinma-ve-yatirim-bankasi': require('../../assets/bank-icons/turkiye-kalkinma-ve-yatirim-bankasi.png'),
  'turkiye-sinai-kalkinma-bankasi': require('../../assets/bank-icons/turkiye-sinai-kalkinma-bankasi.png'),
  'vakif-katilim-bankasi': require('../../assets/bank-icons/vakif-katilim-bankasi.png'),
  vakifbank: require('../../assets/bank-icons/vakifbank.png'),
  'yapi-kredi-bankasi': require('../../assets/bank-icons/yapi-kredi-bankasi.png'),
  'ziraat-bankasi': require('../../assets/bank-icons/ziraat-bankasi.png'),
  'ziraat-katilim-bankasi': require('../../assets/bank-icons/ziraat-katilim-bankasi.png'),
};
