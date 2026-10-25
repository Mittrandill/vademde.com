import { getLocales } from 'expo-localization';

import { getLocaleTag } from './index';

// Tutar girişindeki ondalık ayıracı uygulama diline değil CİHAZ BÖLGESİNE bağlıdır: iOS/Android
// sayı klavyesi (decimal-pad) yalnızca bölgenin ayıracını gösterir. Uygulama İngilizce, telefon
// Türkiye bölgesindeyse klavyede yalnızca "," vardır; giriş "." bekleseydi kuruş yazılamazdı.
// Gösterim (formatMinorAmount) ise uygulama dilini izler. Varsayılan ",": mevcut Türkçe davranış.
export function getInputDecimalSeparator(): '.' | ',' {
  return getLocales()[0]?.decimalSeparator === '.' ? '.' : ',';
}

export function getInputGroupSeparator(): '.' | ',' {
  return getInputDecimalSeparator() === '.' ? ',' : '.';
}

// Elle kısaltılan gösterim sayıları ("1,5Mn", "2.3M") için: uygulama dilinin ondalık ayıracı.
export function getDisplayDecimalSeparator(): '.' | ',' {
  return getLocaleTag() === 'en-US' ? '.' : ',';
}

// Biçimlenmiş tutardaki sıfır kuruşu ("₺1.250,00" → "₺1.250", "$1,250.00" → "$1,250") silen desen;
// sondaki para birimi kodu/simgesi korunur. Kullanım: text.replace(zeroFractionPattern(), '').
export function zeroFractionPattern(): RegExp {
  return new RegExp(`\\${getDisplayDecimalSeparator()}00(?=\\D*$)`);
}

// Ekranlarda modül seviyesinde tanımlanan `new Intl.DateTimeFormat('tr-TR', …)` kalıbının
// dile duyarlı karşılığı. Biçimleyici çağrı anındaki dile göre seçilir ve dil başına önbelleğe
// alınır; böylece modül bir kez yüklense de dil değişince yeni dilde biçimler.
type DateFormatter = Pick<Intl.DateTimeFormat, 'format' | 'formatToParts'>;
type NumberFormatter = {
  format: (value: number | bigint) => string;
  formatToParts: (value: number | bigint) => Intl.NumberFormatPart[];
};

export function localeDateFormatter(options: Intl.DateTimeFormatOptions): DateFormatter {
  const cache = new Map<string, Intl.DateTimeFormat>();
  const current = () => {
    const tag = getLocaleTag();
    let formatter = cache.get(tag);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(tag, options);
      cache.set(tag, formatter);
    }
    return formatter;
  };
  return {
    format: (date) => current().format(date),
    formatToParts: (date) => current().formatToParts(date),
  };
}

export function localeNumberFormatter(options: Intl.NumberFormatOptions): NumberFormatter {
  const cache = new Map<string, Intl.NumberFormat>();
  const current = () => {
    const tag = getLocaleTag();
    let formatter = cache.get(tag);
    if (!formatter) {
      formatter = new Intl.NumberFormat(tag, options);
      cache.set(tag, formatter);
    }
    return formatter;
  };
  return {
    format: (value) => current().format(value),
    formatToParts: (value) => current().formatToParts(value),
  };
}

// Arayüz metinlerinin (çevrilen etiketler, biçimlenmiş tarih adları) büyük/küçük harf dönüşümü.
// Kullanıcı verisi (cari/kategori adı, arama) Türkçe kurallarla ('tr-TR') kalır: "i" → "İ".
export function upperUi(text: string): string {
  return text.toLocaleUpperCase(getLocaleTag());
}

export function lowerUi(text: string): string {
  return text.toLocaleLowerCase(getLocaleTag());
}

export function capitalizeUi(text: string): string {
  return text.charAt(0).toLocaleUpperCase(getLocaleTag()) + text.slice(1);
}

// Sayaç metinlerindeki birim adı ("3 taksit daha göster" / "Show 3 more installments"): Türkçede
// sayıdan sonra isim tekil kalır, İngilizcede count ≠ 1 ise çoğul olur.
export function unitForCount(unit: string, count: number): string {
  if (getLocaleTag() !== 'en-US' || count === 1) return unit;
  return /(s|x|ch|sh)$/i.test(unit) ? `${unit}es` : `${unit}s`;
}

// Türkçe belirtme hâli: taksit → taksiti, ödeme → ödemeyi, kira → kirayı. İngilizcede çoğul.
export function unitAccusative(unit: string, count: number): string {
  if (getLocaleTag() === 'en-US') return unitForCount(unit, count);
  const vowels = unit.toLocaleLowerCase('tr-TR').match(/[aeıioöuü]/g) ?? ['i'];
  const last = vowels[vowels.length - 1];
  const suffix = ({ a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' } as Record<string, string>)[last] ?? 'i';
  return /[aeıioöuü]$/i.test(unit) ? `${unit}y${suffix}` : `${unit}${suffix}`;
}

// Yüzde gösterimi: Türkçede işaret önde ("%15"), İngilizcede sonda ("15%").
export function formatPercent(value: number | string): string {
  return getLocaleTag() === 'en-US' ? `${value}%` : `%${value}`;
}

// Tutar alanlarının yer tutucusu ("0,00" / "0.00") — giriş ayıracıyla aynı (cihaz bölgesi).
export function amountPlaceholder(): string {
  return `0${getInputDecimalSeparator()}00`;
}

// Biçimlenmiş tutardaki kuruş kısmını (sıfır olmasa da) silen desen: "₺1.250,40" → "₺1.250".
export function fractionPattern(): RegExp {
  return new RegExp(`\\${getDisplayDecimalSeparator()}\\d{2}(?=\\D*$)`);
}
