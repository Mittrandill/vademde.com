import type { ImageSourcePropType } from 'react-native';
import { getAvatarColor, getInitials } from '@/utils/avatarColor';

// docs/08-tasarim-sistemi.md — hesap, kredi, kredi kartı ekstresi ve çek kayıtlarını
// bankalarla eşleştirip yanında gerçek banka logosunu göstermek için sabit BDDK banka
// listesi. Kullanıcıya özel olmadığı ve değişmediği için Supabase'de ayrı bir tablo
// yerine burada, uygulama içinde sabit tutulur (bkz. accounts/obligations.bank_code).
export interface Bank {
  code: string;
  name: string;
  /**
   * OCR'ın belge üzerinde görebileceği alternatif adlar: markanın günlük kullanımdaki
   * kısa hâli ("Halkbank"), resmî addan farklı ticari markası ("Enpara.com" ↔ "Enpara
   * Bank") veya kısaltması ("TEB"). Resmî ad tek başına yetmiyor çünkü ekstre/dekont
   * başlıklarında çoğunlukla marka adı yazıyor.
   */
  aliases?: string[];
}

export const BANKS: Bank[] = [
  { code: 'adabank', name: 'Adabank' },
  { code: 'akbank', name: 'Akbank', aliases: ['Ak Bank'] },
  { code: 'aktif-yatirim-bankasi', name: 'Aktif Yatırım Bankası' },
  { code: 'albaraka-turk-katilim-bankasi', name: 'Albaraka Türk Katılım Bankası', aliases: ['Albaraka', 'Albaraka Türk'] },
  { code: 'alternatif-bank', name: 'Alternatif Bank', aliases: ['Alternatifbank', 'ABank'] },
  { code: 'anadolubank', name: 'Anadolubank', aliases: ['Anadolu Bank'] },
  { code: 'bank-mellat', name: 'Bank Mellat' },
  { code: 'bankpozitif-kredi-ve-kalkinma-bankasi', name: 'BankPozitif Kredi ve Kalkınma Bankası' },
  { code: 'birlesik-fon-bankasi', name: 'Birleşik Fon Bankası' },
  { code: 'burgan-bank', name: 'Burgan Bank', aliases: ['Burgan'] },
  { code: 'citibank', name: 'Citibank', aliases: ['Citi'] },
  { code: 'colendi-bank', name: 'Colendi Bank', aliases: ['Colendi'] },
  { code: 'denizbank', name: 'DenizBank', aliases: ['Deniz Bank'] },
  { code: 'deutsche-bank', name: 'Deutsche Bank' },
  { code: 'diler-yatirim-bankasi', name: 'Diler Yatırım Bankası' },
  { code: 'dunya-katilim-bankasi', name: 'Dünya Katılım Bankası', aliases: ['Dünya Katılım'] },
  { code: 'enpara-bank', name: 'Enpara.com', aliases: ['Enpara', 'Enpara Bank', 'QNB Enpara'] },
  { code: 'fibabanka', name: 'Fibabanka', aliases: ['Fiba Banka', 'Fibabank'] },
  { code: 'golden-global-yatirim-bankasi', name: 'Golden Global Yatırım Bankası' },
  { code: 'gsd-yatirim-bankasi', name: 'GSD Yatırım Bankası' },
  { code: 'habib-bank-limited', name: 'Habib Bank Limited' },
  { code: 'hayat-finans-katilim-bankasi', name: 'Hayat Finans Katılım Bankası', aliases: ['Hayat Finans'] },
  { code: 'hsbc-bank', name: 'HSBC Bank', aliases: ['HSBC'] },
  { code: 'icbc-turkey-bank', name: 'ICBC Turkey Bank' },
  { code: 'iller-bankasi', name: 'İller Bankası' },
  { code: 'ing-bank', name: 'ING Bank', aliases: ['ING'] },
  { code: 'intesa-sanpaolo', name: 'Intesa Sanpaolo' },
  { code: 'istanbul-takas-ve-saklama-bankasi', name: 'İstanbul Takas ve Saklama Bankası (Takasbank)', aliases: ['Takasbank'] },
  { code: 'jpmorgan-chase-bank', name: 'JPMorgan Chase Bank' },
  { code: 'kuveyt-turk-katilim-bankasi', name: 'Kuveyt Türk Katılım Bankası', aliases: ['Kuveyt Türk'] },
  { code: 'merrill-lynch-yatirim-bank', name: 'Merrill Lynch Yatırım Bank' },
  { code: 'mufg-bank-turkey', name: 'MUFG Bank Turkey' },
  { code: 'nurol-yatirim-bankasi', name: 'Nurol Yatırım Bankası' },
  { code: 'odeabank', name: 'Odeabank', aliases: ['Odea Bank'] },
  { code: 'pasha-yatirim-bankasi', name: 'PASHA Yatırım Bankası' },
  { code: 'qnb-finansbank', name: 'QNB Finansbank', aliases: ['Finansbank', 'QNB'] },
  { code: 'rabobank', name: 'Rabobank' },
  { code: 'sekerbank', name: 'Şekerbank', aliases: ['Şeker Bank'] },
  { code: 'societe-generale', name: 'Société Générale' },
  { code: 'standard-chartered-yatirim-bankasi-turk', name: 'Standard Chartered Yatırım Bankası Türk' },
  { code: 'turk-eximbank', name: 'Türk Eximbank', aliases: ['Eximbank'] },
  { code: 'turk-ticaret-bankasi', name: 'Türk Ticaret Bankası' },
  { code: 'turkish-bank', name: 'Turkish Bank' },
  { code: 'turkiye-ekonomi-bankasi', name: 'Türkiye Ekonomi Bankası (TEB)', aliases: ['TEB'] },
  { code: 'turkiye-emlak-katilim-bankasi', name: 'Türkiye Emlak Katılım Bankası', aliases: ['Emlak Katılım'] },
  { code: 'turkiye-finans-katilim-bankasi', name: 'Türkiye Finans Katılım Bankası', aliases: ['Türkiye Finans'] },
  { code: 'turkiye-garanti-bankasi', name: 'Türkiye Garanti Bankası (Garanti BBVA)', aliases: ['Garanti', 'Garanti BBVA'] },
  { code: 'turkiye-halk-bankasi', name: 'Türkiye Halk Bankası (Halkbank)', aliases: ['Halkbank', 'Halk Bankası'] },
  { code: 'turkiye-is-bankasi', name: 'Türkiye İş Bankası', aliases: ['İş Bankası', 'İşbank', 'Isbank'] },
  { code: 'turkiye-kalkinma-ve-yatirim-bankasi', name: 'Türkiye Kalkınma ve Yatırım Bankası' },
  { code: 'turkiye-sinai-kalkinma-bankasi', name: 'Türkiye Sınai Kalkınma Bankası (TSKB)', aliases: ['TSKB'] },
  { code: 'vakif-katilim-bankasi', name: 'Vakıf Katılım Bankası', aliases: ['Vakıf Katılım'] },
  { code: 'vakifbank', name: 'Türkiye Vakıflar Bankası (VakıfBank)', aliases: ['VakıfBank', 'Vakıflar Bankası'] },
  { code: 'yapi-kredi-bankasi', name: 'Yapı Kredi Bankası', aliases: ['Yapı Kredi', 'Yapıkredi'] },
  { code: 'ziraat-bankasi', name: 'Ziraat Bankası', aliases: ['Ziraat', 'T.C. Ziraat Bankası'] },
  { code: 'ziraat-katilim-bankasi', name: 'Ziraat Katılım Bankası', aliases: ['Ziraat Katılım'] },
];

export const BANK_NAME: Record<string, string> = Object.fromEntries(BANKS.map((b) => [b.code, b.name]));

// OCR aynı bankayı bazen Türkçe karakterlerle ("Şekerbank", "İş Bankası") bazen
// ASCII'ye düşürerek ("Sekerbank", "IS BANKASI") döndürüyor; karşılaştırma yapılmadan
// önce ikisi tek biçime indirilir.
const TURKISH_TO_ASCII: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U', Â: 'A', Î: 'I', Û: 'U', É: 'E',
};

function normalizeBankName(name: string): string {
  return name
    .toLocaleUpperCase('tr-TR')
    .replace(/[ÇĞİIÖŞÜÂÎÛÉ]/g, (char) => TURKISH_TO_ASCII[char] ?? char)
    // Tüzel kişilik ekleri ayırt edici değildir: "A.Ş.", "T.A.O.", "T.C.".
    .replace(/\bA\.?\s?S\.?\b/g, ' ')
    .replace(/\bT\.?\s?A\.?\s?O\.?\b/g, ' ')
    .replace(/\bT\.?\s?C\.?\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Neredeyse her banka adında geçtiği için tek başına hiçbir şeyi ayırt etmeyen sözcükler.
// "KATILIM" bilinçli olarak listede DEĞİL: Ziraat Bankası ile Ziraat Katılım Bankası'nı
// yalnızca o ayırıyor. Bu liste sayesinde OCR "Bank" gibi tek bir genel sözcük
// döndürdüğünde artık listedeki ilk banka (Adabank) yanlışlıkla eşleşmiyor.
// "KALKINMA" da listede değil: Türkiye Kalkınma ve Yatırım Bankası'nda geriye ayırt edici
// hiçbir sözcük kalmazdı.
const GENERIC_BANK_TOKENS = new Set([
  'BANKASI', 'BANKA', 'BANK', 'BANKAS', 'TURKIYE', 'TURK', 'VE', 'COM', 'LIMITED', 'AS',
  'YATIRIM', 'KREDI',
]);

function distinctiveTokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((token) => token && !GENERIC_BANK_TOKENS.has(token)));
}

/** Bir banka için karşılaştırılacak tüm adlar: resmî ad + aliaslar. */
function bankCandidates(bank: Bank): string[] {
  return [bank.name, ...(bank.aliases ?? [])].map(normalizeBankName).filter(Boolean);
}

// OCR'ın serbest metin olarak çıkardığı banka adını (örn. "TÜRKİYE İŞ BANKASI A.Ş.",
// "Enpara Bank", "Halkbank") sabit BANKS listesindeki koda eşler; belge türlerinde banka
// kişi/firma olarak değil doğrudan bu kod üzerinden (logosuyla) temsil edilir.
//
// Eski sürüm iki yönlü substring karşılaştırması yapıyordu; bu hem gerçek eşleşmeleri
// kaçırıyordu (resmî adı "Enpara.com" olan banka, belgede yazan "Enpara Bank" ile
// örtüşmüyor) hem de yanlış eşleşme üretiyordu ("Bank" → Adabank). Artık önce tam ad
// eşleşmesi, sonra ayırt edici sözcük kümesi örtüşmesi aranır.
export function matchBankByName(rawName: string | null | undefined): string | null {
  if (!rawName) return null;
  const normalized = normalizeBankName(rawName);
  if (!normalized) return null;

  // 1) Tam eşleşme (resmî ad veya alias) — en güvenilir sinyal.
  const exact = BANKS.find((bank) => bankCandidates(bank).includes(normalized));
  if (exact) return exact.code;

  // 2) Ayırt edici sözcük örtüşmesi. En çok ortak sözcüğü olan banka kazanır; eşitlikte
  //    daha az ayırt edici sözcük içeren (yani daha dar/özgül) aday tercih edilir —
  //    "Türkiye Finans" sorgusu Hayat Finans Katılım yerine Türkiye Finans Katılım'a gider.
  const queryTokens = distinctiveTokens(normalized);
  if (queryTokens.size === 0) return null;

  let best: { code: string; shared: number; candidateSize: number } | null = null;

  for (const bank of BANKS) {
    for (const candidate of bankCandidates(bank)) {
      const candidateTokens = distinctiveTokens(candidate);
      if (candidateTokens.size === 0) continue;

      let shared = 0;
      for (const token of queryTokens) {
        if (candidateTokens.has(token)) shared += 1;
      }
      if (shared === 0) continue;

      // Taraflardan biri diğerini tümüyle kapsamalı; kısmi kesişim (ör. yalnızca
      // "YATIRIM" ortaklığı) yanlış bankaya bağlanmaya yol açar.
      const contained = shared === queryTokens.size || shared === candidateTokens.size;
      if (!contained) continue;

      if (
        !best ||
        shared > best.shared ||
        (shared === best.shared && candidateTokens.size < best.candidateSize)
      ) {
        best = { code: bank.code, shared, candidateSize: candidateTokens.size };
      }
    }
  }

  return best?.code ?? null;
}

// bank_code eşleşmesi bulunamayan (58'lik statik listede olmayan) bir banka OCR'dan
// çıkarsa, kırık/boş bir görsel yerine banka adının baş harfleriyle renkli, isme göre
// deterministik bir avatar gösterilir (bkz. components/finance/BankLogo.tsx). Genel
// isim->renk/baş harf mantığı utils/avatarColor.ts'te (kişi avatarları ve servis
// logoları da aynısını kullanır).
export const getBankAvatarColor = getAvatarColor;
export const getBankInitials = getInitials;

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
