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
  /**
   * Bankanın TCMB/EFT kodu. Türk IBAN'ının 5.-9. karakterleri bu koddur
   * (TRkk BBBBB ...), bu yüzden belgede görünen bir IBAN, banka adını hiç okumadan
   * bankayı kesin olarak belirler — OCR'ın en güvenilir banka sinyali budur.
   * Yalnızca EFT sistemine katılan bankalarda vardır (ör. İller Bankası'nda yoktur).
   */
  eftCode?: number;
}

export const BANKS: Bank[] = [
  { code: 'akbank', name: 'Akbank', eftCode: 46, aliases: ['Ak Bank'] },
  { code: 'aktif-yatirim-bankasi', name: 'Aktif Yatırım Bankası', eftCode: 143, aliases: ['Aktif Bank', 'N Kolay'] },
  { code: 'albaraka-turk-katilim-bankasi', name: 'Albaraka Türk Katılım Bankası', eftCode: 203, aliases: ['Albaraka', 'Albaraka Türk'] },
  { code: 'alternatif-bank', name: 'Alternatif Bank', eftCode: 124, aliases: ['Alternatifbank', 'ABank'] },
  { code: 'anadolubank', name: 'Anadolubank', eftCode: 135, aliases: ['Anadolu Bank'] },
  { code: 'arap-turk-bankasi', name: 'Arap Türk Bankası', eftCode: 91, aliases: ['A&T Bank', 'ATBank', 'Arab Turkish Bank'] },
  { code: 'aytemiz-bank', name: 'Aytemiz Bank', eftCode: 161, aliases: ['Aytemiz'] },
  { code: 'bank-mellat', name: 'Bank Mellat', eftCode: 94, aliases: ['Bank Mellat Türkiye'] },
  { code: 'bank-of-china-turkey', name: 'Bank of China Turkey', eftCode: 149, aliases: ['Bank of China'] },
  { code: 'bankpozitif-kredi-ve-kalkinma-bankasi', name: 'BankPozitif Kredi ve Kalkınma Bankası', eftCode: 142, aliases: ['BankPozitif'] },
  { code: 'birlesik-fon-bankasi', name: 'Birleşik Fon Bankası', eftCode: 29, aliases: ['Birleşik Fon'] },
  { code: 'burgan-bank', name: 'Burgan Bank', eftCode: 125, aliases: ['Burgan'] },
  { code: 'citibank', name: 'Citibank', eftCode: 92, aliases: ['Citi'] },
  { code: 'colendi-bank', name: 'Colendi Bank', eftCode: 158, aliases: ['Colendi'] },
  { code: 'd-yatirim-bankasi', name: 'D Yatırım Bankası', eftCode: 151, aliases: ['Doğan Yatırım Bankası', 'DYBank'] },
  { code: 'denizbank', name: 'DenizBank', eftCode: 134, aliases: ['Deniz Bank'] },
  { code: 'destek-yatirim-bankasi', name: 'Destek Yatırım Bankası', eftCode: 152, aliases: ['Destekbank', 'Destek Bank'] },
  { code: 'deutsche-bank', name: 'Deutsche Bank', eftCode: 115 },
  { code: 'diler-yatirim-bankasi', name: 'Diler Yatırım Bankası', eftCode: 138, aliases: ['Dilerbank'] },
  { code: 'dunya-katilim-bankasi', name: 'Dünya Katılım Bankası', eftCode: 100, aliases: ['Dünya Katılım', 'Adabank'] },
  { code: 'enpara-bank', name: 'Enpara Bank', eftCode: 157, aliases: ['Enpara', 'Enpara.com', 'QNB Enpara'] },
  { code: 'fibabanka', name: 'Fibabanka', eftCode: 103, aliases: ['Fiba Banka', 'Fibabank'] },
  { code: 'fups-bank', name: 'FUPS Bank', eftCode: 159, aliases: ['FUPS'] },
  { code: 'golden-global-yatirim-bankasi', name: 'Golden Global Bank', eftCode: 150, aliases: ['Golden Global', 'Golden Global Yatırım Bankası'] },
  { code: 'gsd-yatirim-bankasi', name: 'GSD Yatırım Bankası', eftCode: 139, aliases: ['GSD Bank'] },
  { code: 'habib-bank-limited', name: 'Habib Bank Limited', eftCode: 97, aliases: ['Habib Bank'] },
  { code: 'hayat-finans-katilim-bankasi', name: 'Hayat Finans Katılım Bankası', eftCode: 212, aliases: ['Hayat Finans'] },
  { code: 'hedef-yatirim-bankasi', name: 'Hedef Yatırım Bankası', eftCode: 156, aliases: ['Hedef Bank'] },
  { code: 'hsbc-bank', name: 'HSBC Bank', eftCode: 123, aliases: ['HSBC'] },
  { code: 'icbc-turkey-bank', name: 'ICBC Turkey Bank', eftCode: 109, aliases: ['ICBC', 'ICBC Bank'] },
  { code: 'iktisat-katilim-bankasi', name: 'İktisat Katılım Bankası', eftCode: 216, aliases: ['İktisat Katılım'] },
  { code: 'iller-bankasi', name: 'İller Bankası', aliases: ['İlbank'] },
  { code: 'ing-bank', name: 'ING Bank', eftCode: 99, aliases: ['ING'] },
  { code: 'intesa-sanpaolo', name: 'Intesa Sanpaolo', eftCode: 148 },
  { code: 'istanbul-takas-ve-saklama-bankasi', name: 'Takasbank', eftCode: 132, aliases: ['İstanbul Takas ve Saklama Bankası'] },
  { code: 'jpmorgan-chase-bank', name: 'JPMorgan Chase Bank', eftCode: 98, aliases: ['JPMorgan', 'JP Morgan'] },
  { code: 'kuveyt-turk-katilim-bankasi', name: 'Kuveyt Türk Katılım Bankası', eftCode: 205, aliases: ['Kuveyt Türk'] },
  { code: 'merrill-lynch-yatirim-bank', name: 'Bank of America Yatırım Bank', eftCode: 129, aliases: ['Bank of America', 'Merrill Lynch Yatırım Bank', 'Merrill Lynch'] },
  { code: 'misyon-yatirim-bankasi', name: 'Misyon Yatırım Bankası', eftCode: 153, aliases: ['Misyon Bank'] },
  { code: 'mufg-bank-turkey', name: 'MUFG Bank Turkey', eftCode: 147, aliases: ['MUFG', 'MUFG Bank'] },
  { code: 'nurol-yatirim-bankasi', name: 'Nurol Yatırım Bankası', eftCode: 141, aliases: ['Nurol Bank'] },
  { code: 'odeabank', name: 'Odeabank', eftCode: 146, aliases: ['Odea Bank'] },
  { code: 'pasha-yatirim-bankasi', name: 'PASHA Bank', eftCode: 116, aliases: ['PASHA', 'PASHA Yatırım Bankası'] },
  { code: 'q-yatirim-bankasi', name: 'Q Yatırım Bankası', eftCode: 155, aliases: ['Q Bank'] },
  { code: 'qnb-finansbank', name: 'QNB', eftCode: 111, aliases: ['QNB Bank', 'QNB Finansbank', 'Finansbank', 'QNB Türkiye'] },
  { code: 'rabobank', name: 'Hepsi Bank', eftCode: 137, aliases: ['Hepsi', 'Rabobank'] },
  { code: 'sekerbank', name: 'Şekerbank', eftCode: 59, aliases: ['Şeker Bank'] },
  { code: 'societe-generale', name: 'Société Générale', eftCode: 122, aliases: ['Societe Generale'] },
  { code: 'standard-chartered-yatirim-bankasi-turk', name: 'Standard Chartered Yatırım Bankası Türk', eftCode: 121, aliases: ['Standard Chartered'] },
  { code: 'tera-yatirim-bankasi', name: 'Tera Yatırım Bankası', eftCode: 154, aliases: ['Tera Bank'] },
  { code: 'tom-katilim-bankasi', name: 'T.O.M. Katılım Bankası', eftCode: 213, aliases: ['TOM Bank', 'T.O.M. Katılım', 'TOM Katılım'] },
  { code: 'turk-eximbank', name: 'Türk Eximbank', eftCode: 16, aliases: ['Eximbank'] },
  { code: 'turk-ticaret-bankasi', name: 'Türk Ticaret Bankası', eftCode: 60, aliases: ['Turkish Commercial Bank'] },
  { code: 'turkish-bank', name: 'Turkish Bank', eftCode: 96 },
  { code: 'turkiye-ekonomi-bankasi', name: 'TEB', eftCode: 32, aliases: ['Türk Ekonomi Bankası', 'Türkiye Ekonomi Bankası', 'CEPTETEB'] },
  { code: 'turkiye-emlak-katilim-bankasi', name: 'Türkiye Emlak Katılım Bankası', eftCode: 211, aliases: ['Emlak Katılım'] },
  { code: 'turkiye-finans-katilim-bankasi', name: 'Türkiye Finans Katılım Bankası', eftCode: 206, aliases: ['Türkiye Finans'] },
  { code: 'turkiye-garanti-bankasi', name: 'Garanti BBVA', eftCode: 62, aliases: ['Garanti', 'BBVA', 'Türkiye Garanti Bankası'] },
  { code: 'turkiye-halk-bankasi', name: 'Halkbank', eftCode: 12, aliases: ['Halk Bankası', 'Türkiye Halk Bankası'] },
  { code: 'turkiye-is-bankasi', name: 'Türkiye İş Bankası', eftCode: 64, aliases: ['İş Bankası', 'İşbank', 'Isbank', 'Is Bankasi'] },
  { code: 'turkiye-kalkinma-ve-yatirim-bankasi', name: 'Türkiye Kalkınma ve Yatırım Bankası', eftCode: 17, aliases: ['Kalkınma Bankası', 'TKYB'] },
  { code: 'turkiye-sinai-kalkinma-bankasi', name: 'TSKB', eftCode: 14, aliases: ['Türkiye Sınai Kalkınma Bankası'] },
  { code: 'turkland-bank', name: 'Turkland Bank', eftCode: 108, aliases: ['T-Bank', 'TBank'] },
  { code: 'vakif-katilim-bankasi', name: 'Vakıf Katılım Bankası', eftCode: 210, aliases: ['Vakıf Katılım'] },
  { code: 'vakifbank', name: 'VakıfBank', eftCode: 15, aliases: ['Vakıflar Bankası', 'Türkiye Vakıflar Bankası'] },
  { code: 'yapi-kredi-bankasi', name: 'Yapı Kredi Bankası', eftCode: 67, aliases: ['Yapı Kredi', 'Yapıkredi', 'Yapı ve Kredi Bankası'] },
  { code: 'ziraat-bankasi', name: 'Ziraat Bankası', eftCode: 10, aliases: ['Ziraat', 'T.C. Ziraat Bankası'] },
  { code: 'ziraat-dinamik-banka', name: 'Ziraat Dinamik Banka', eftCode: 160, aliases: ['Ziraat Dinamik'] },
  { code: 'ziraat-katilim-bankasi', name: 'Ziraat Katılım Bankası', eftCode: 209, aliases: ['Ziraat Katılım'] },
];

// Artık var olmayan ama eski kayıtlarda bank_code olarak durabilecek kodlar. Adabank
// 23 Kasım 2023'te katılım bankasına dönüştü ve ticaret unvanı "Dünya Katılım Bankası"
// olarak tescil edildi — listede iki ayrı banka gibi görünmemesi için BANKS'tan çıkarıldı,
// ama eski bir kayıt bu kodu taşıyorsa adı boş görünmesin diye burada karşılığı kalır.
const LEGACY_BANK_CODE_NAMES: Record<string, string> = {
  adabank: 'Dünya Katılım Bankası',
};

export const BANK_NAME: Record<string, string> = {
  ...LEGACY_BANK_CODE_NAMES,
  ...Object.fromEntries(BANKS.map((b) => [b.code, b.name])),
};

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

// Ekstre/dekont başlıklarında banka adının yanında neredeyse her zaman şube veya birim
// bilgisi de yazar ("TÜRKİYE İŞ BANKASI A.Ş. KADIKÖY ŞUBESİ", "GARANTİ BBVA GENEL
// MÜDÜRLÜK"). Bu sözcükler ayırt edici sözcük kümesine girince aday adı sorguyu tümüyle
// kapsayamıyor ve eşleşme sessizce düşüyordu — karşılaştırmadan önce elenirler.
const BRANCH_NOISE_TOKENS = new Set([
  'SUBE', 'SUBESI', 'SB', 'MERKEZ', 'GENEL', 'MUDURLUK', 'MUDURLUGU', 'BOLGE',
  'TICARI', 'BIREYSEL', 'KURUMSAL', 'MERKEZI', 'ANONIM', 'SIRKETI', 'SIRKET',
  'INTERNET', 'MOBIL', 'ATM', 'IBAN', 'HESAP', 'MUSTERI', 'NO',
]);

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
  return new Set(
    normalized
      .split(' ')
      .filter((token) => token && !GENERIC_BANK_TOKENS.has(token) && !BRANCH_NOISE_TOKENS.has(token))
  );
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

// ---------------------------------------------------------------------------
// IBAN üzerinden banka tespiti — OCR'ın en güvenilir sinyali
// ---------------------------------------------------------------------------

// Türk IBAN'ı 26 karakterdir: TR + 2 kontrol hanesi + 5 haneli banka (EFT) kodu +
// 1 rezerv hane + 16 haneli hesap numarası. Banka kodu 5 haneye sağa yaslı yazılır
// (Ziraat 10 -> "00010"), bu yüzden sayıya çevrilip Bank.eftCode ile karşılaştırılır.
//
// Bu yol ad eşleştirmesinden önce denenmelidir: banka adı OCR'da bozuk okunabilir,
// kısaltılabilir veya hiç yazmayabilir; IBAN ise yapısı gereği kesindir.
const BANK_BY_EFT_CODE = new Map<number, string>(
  BANKS.filter((bank) => bank.eftCode !== undefined).map((bank) => [bank.eftCode as number, bank.code])
);

export function matchBankByIban(rawIban: string | null | undefined): string | null {
  if (!rawIban) return null;
  const normalized = rawIban.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^TR\d{24}$/.test(normalized)) return null;
  return BANK_BY_EFT_CODE.get(Number(normalized.slice(4, 9))) ?? null;
}

// Serbest metin içinde geçen ilk IBAN'ı bulur. Belgelerde IBAN çoğu zaman boşluklu
// yazılır ("TR33 0006 1005 ...") — bu yüzden 26 karakteri bitişik aramak yetmez.
const IBAN_IN_TEXT = /TR\s*\d{2}(?:\s*\d){22}/i;

export function findIbanInText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(IBAN_IN_TEXT);
  return match ? match[0].replace(/\s+/g, '').toUpperCase() : null;
}

// Belgenin ham metninde geçen banka adını arar. OCR bazen "bankName" alanını hiç
// doldurmaz (ör. logo görsel olarak var ama başlıkta metin yok) ama gövdede banka adı
// bir yerde geçer. Uzun aday adı önce denenir ki "Ziraat Katılım", "Ziraat"ten önce
// eşleşsin; aksi halde kısa ad daha erken bulunup yanlış bankaya bağlanır.
const TEXT_SCAN_CANDIDATES: { code: string; needle: string }[] = BANKS.flatMap((bank) =>
  [bank.name, ...(bank.aliases ?? [])]
    .map((candidate) => ({ code: bank.code, needle: normalizeBankName(candidate) }))
    .filter((entry) => entry.needle.length >= 4)
).sort((a, b) => b.needle.length - a.needle.length);

export function matchBankInText(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = normalizeBankName(text);
  if (!normalized) return null;
  const padded = ` ${normalized} `;
  for (const entry of TEXT_SCAN_CANDIDATES) {
    if (padded.includes(` ${entry.needle} `)) return entry.code;
  }
  return null;
}

/**
 * Bir belgeden bankayı belirlemenin tek giriş noktası. Sinyaller güvenilirlik sırasıyla
 * denenir: IBAN (yapısal, kesin) -> OCR'ın çıkardığı banka adı -> ham metin taraması.
 * Çağıran tarafın hangi sinyalin hangi sırayla deneneceğini bilmesi gerekmez.
 */
export function resolveBankFromDocument(input: {
  bankName?: string | null;
  iban?: string | null;
  rawText?: string | null;
}): string | null {
  const iban = input.iban ?? findIbanInText(input.rawText);
  return matchBankByIban(iban) ?? matchBankByName(input.bankName) ?? matchBankInText(input.rawText);
}

// bank_code eşleşmesi bulunamayan (58'lik statik listede olmayan) bir banka OCR'dan
// çıkarsa, kırık/boş bir görsel yerine banka adının baş harfleriyle renkli, isme göre
// deterministik bir avatar gösterilir (bkz. components/finance/BankLogo.tsx). Genel
// isim->renk/baş harf mantığı utils/avatarColor.ts'te (kişi avatarları ve servis
// logoları da aynısını kullanır).
export const getBankAvatarColor = getAvatarColor;
export const getBankInitials = getInitials;

// Metro statik analizle bulabilsin diye her require() ayrı, literal bir satırda olmalı.
//
// Burada olmayan bankalarda BankLogo baş harfli renkli avatara düşer (bkz. aşağıdaki
// getBankAvatarColor notu) — bu bilinçlidir: ticaret unvanı ve markası tümüyle değişen
// bankaların (Rabobank -> Hepsi Bank, Merrill Lynch -> Bank of America) eski logosunu
// göstermek, logosuz göstermekten daha yanlıştır. Yeni eklenen bankaların logo dosyaları
// da henüz yoktur.
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  akbank: require('../../assets/bank-icons/akbank.png'),
  'aktif-yatirim-bankasi': require('../../assets/bank-icons/aktif-yatirim-bankasi.png'),
  'albaraka-turk-katilim-bankasi': require('../../assets/bank-icons/albaraka-turk-katilim-bankasi.png'),
  'alternatif-bank': require('../../assets/bank-icons/alternatif-bank.png'),
  anadolubank: require('../../assets/bank-icons/anadolubank.png'),
  'arap-turk-bankasi': require('../../assets/bank-icons/arap-turk-bankasi.png'),
  'aytemiz-bank': require('../../assets/bank-icons/aytemiz-bank.png'),
  'bank-mellat': require('../../assets/bank-icons/bank-mellat.png'),
  'bank-of-china-turkey': require('../../assets/bank-icons/bank-of-china-turkey.png'),
  'bankpozitif-kredi-ve-kalkinma-bankasi': require('../../assets/bank-icons/bankpozitif-kredi-ve-kalkinma-bankasi.png'),
  'birlesik-fon-bankasi': require('../../assets/bank-icons/birlesik-fon-bankasi.png'),
  'burgan-bank': require('../../assets/bank-icons/burgan-bank.png'),
  citibank: require('../../assets/bank-icons/citibank.png'),
  'colendi-bank': require('../../assets/bank-icons/colendi-bank.png'),
  'd-yatirim-bankasi': require('../../assets/bank-icons/d-yatirim-bankasi.png'),
  denizbank: require('../../assets/bank-icons/denizbank.png'),
  'destek-yatirim-bankasi': require('../../assets/bank-icons/destek-yatirim-bankasi.png'),
  'deutsche-bank': require('../../assets/bank-icons/deutsche-bank.png'),
  'diler-yatirim-bankasi': require('../../assets/bank-icons/diler-yatirim-bankasi.png'),
  'dunya-katilim-bankasi': require('../../assets/bank-icons/dunya-katilim-bankasi.png'),
  'enpara-bank': require('../../assets/bank-icons/enpara-bank.png'),
  fibabanka: require('../../assets/bank-icons/fibabanka.png'),
  'fups-bank': require('../../assets/bank-icons/fups-bank.png'),
  'golden-global-yatirim-bankasi': require('../../assets/bank-icons/golden-global-yatirim-bankasi.png'),
  'gsd-yatirim-bankasi': require('../../assets/bank-icons/gsd-yatirim-bankasi.png'),
  'habib-bank-limited': require('../../assets/bank-icons/habib-bank-limited.png'),
  'hayat-finans-katilim-bankasi': require('../../assets/bank-icons/hayat-finans-katilim-bankasi.png'),
  'hedef-yatirim-bankasi': require('../../assets/bank-icons/hedef-yatirim-bankasi.png'),
  'hsbc-bank': require('../../assets/bank-icons/hsbc-bank.png'),
  'icbc-turkey-bank': require('../../assets/bank-icons/icbc-turkey-bank.png'),
  'iktisat-katilim-bankasi': require('../../assets/bank-icons/iktisat-katilim-bankasi.png'),
  'iller-bankasi': require('../../assets/bank-icons/iller-bankasi.png'),
  'ing-bank': require('../../assets/bank-icons/ing-bank.png'),
  'intesa-sanpaolo': require('../../assets/bank-icons/intesa-sanpaolo.png'),
  'istanbul-takas-ve-saklama-bankasi': require('../../assets/bank-icons/istanbul-takas-ve-saklama-bankasi.png'),
  'jpmorgan-chase-bank': require('../../assets/bank-icons/jpmorgan-chase-bank.png'),
  'kuveyt-turk-katilim-bankasi': require('../../assets/bank-icons/kuveyt-turk-katilim-bankasi.png'),
  'merrill-lynch-yatirim-bank': require('../../assets/bank-icons/merrill-lynch-yatirim-bank.png'),
  'misyon-yatirim-bankasi': require('../../assets/bank-icons/misyon-yatirim-bankasi.png'),
  'mufg-bank-turkey': require('../../assets/bank-icons/mufg-bank-turkey.png'),
  'nurol-yatirim-bankasi': require('../../assets/bank-icons/nurol-yatirim-bankasi.png'),
  odeabank: require('../../assets/bank-icons/odeabank.png'),
  'pasha-yatirim-bankasi': require('../../assets/bank-icons/pasha-yatirim-bankasi.png'),
  'q-yatirim-bankasi': require('../../assets/bank-icons/q-yatirim-bankasi.png'),
  'qnb-finansbank': require('../../assets/bank-icons/qnb-finansbank.png'),
  rabobank: require('../../assets/bank-icons/rabobank.png'),
  sekerbank: require('../../assets/bank-icons/sekerbank.png'),
  'societe-generale': require('../../assets/bank-icons/societe-generale.png'),
  'standard-chartered-yatirim-bankasi-turk': require('../../assets/bank-icons/standard-chartered-yatirim-bankasi-turk.png'),
  'tera-yatirim-bankasi': require('../../assets/bank-icons/tera-yatirim-bankasi.png'),
  'tom-katilim-bankasi': require('../../assets/bank-icons/tom-katilim-bankasi.png'),
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
  'turkland-bank': require('../../assets/bank-icons/turkland-bank.png'),
  'vakif-katilim-bankasi': require('../../assets/bank-icons/vakif-katilim-bankasi.png'),
  vakifbank: require('../../assets/bank-icons/vakifbank.png'),
  'yapi-kredi-bankasi': require('../../assets/bank-icons/yapi-kredi-bankasi.png'),
  'ziraat-bankasi': require('../../assets/bank-icons/ziraat-bankasi.png'),
  'ziraat-dinamik-banka': require('../../assets/bank-icons/ziraat-dinamik-banka.png'),
  'ziraat-katilim-bankasi': require('../../assets/bank-icons/ziraat-katilim-bankasi.png'),
};
