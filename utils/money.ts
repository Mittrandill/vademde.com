// docs/01-finansal-kayit-modeli.md §8.1 — tutarlar en küçük para birimiyle (kuruş) tam sayı
// olarak tutulur; para birimi ISO koduyla saklanır. Görüntüleme Türkçe yerelleştirilir.
import { getValueUnit } from '@/features/valueUnits/units';

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

// Türkçe yazımda binlik ayıracı "." ondalık ayıracı ","dır ("1.234,56"); ancak kullanıcı
// klavyeden nokta ile de yazabiliyor ("1234.56") ve OCR her iki biçimi de döndürebiliyor.
// Kod tabanında yaygın olan `Number(value.replace(',', '.'))` yalnızca ilk virgülü
// değiştirip binlik noktalarını bıraktığı için "20.000,00" → "20.000.00" → NaN üretiyordu;
// NaN de tutar alanına sessizce yazılıp kaydı bozuyordu. Çözümlenemeyen değerde null döner.
export function parseAmount(value: string): number | null {
  // Para birimi simgesi/kodu ve boşlukları at; yalnızca rakam ve ayıraçlar kalsın.
  const cleaned = value.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi de varsa sonda gelen ondalık ayıracıdır, diğeri binlik ayıracıdır.
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = cleaned.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    // Yalnızca virgül: Türkçe yazımda ondalıktır ("1234,56").
    normalized = cleaned.replace(',', '.');
  } else if (lastDot >= 0) {
    // Yalnızca nokta belirsizdir: "2.000" binlik de olabilir ondalık da. Son noktadan
    // sonra tam 3 hane varsa binlik kabul edilir ("2.000" → 2000, "1.234.567" → 1234567);
    // aksi halde ondalıktır ("12.50" → 12.5). Kuruş iki haneli olduğu için bu ayrım
    // gerçek para tutarlarında güvenlidir.
    const afterDot = cleaned.length - lastDot - 1;
    normalized = afterDot === 3 ? cleaned.split('.').join('') : cleaned;
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Metin tutarı doğrudan kuruşa çevirir; çözümlenemezse null (çağıran tarafta doğrulama
// yapılabilsin diye 0'a düşürülmez — 0 geçerli bir tutar gibi kaydedilirdi).
export function parseAmountToMinor(value: string): number | null {
  const parsed = parseAmount(value);
  return parsed === null ? null : toMinorUnits(parsed);
}

// Kullanıcı tutar alanına yazarken binlik ayıracı ekler (ör. "1000" -> "1.000",
// "1000000,5" -> "1.000.000,5") — büyük tutarlar, özellikle milyon seviyesinde, ayraçsız
// okunması zor olduğu için her tuş vuruşunda canlı biçimlendirilir (bkz. AmountField).
// Yalnızca rakam, tek bir ondalık virgül ve baştaki tek bir eksi işaretine izin verilir;
// kullanıcının elle yazdığı nokta atılır çünkü binlik ayıracı zaten otomatik ekleniyor.
// maxDecimals=0 olan birimlerde (adet bazlı sikkeler, bkz. ValueUnit.precision) virgül
// tamamen engellenir.
export function formatAmountInput(value: string, maxDecimals: 0 | 2 = 2): string {
  const isNegative = value.trim().startsWith('-');
  let cleaned = value.replace(/[^\d,]/g, '');
  if (maxDecimals === 0) cleaned = cleaned.replace(/,/g, '');

  const firstComma = cleaned.indexOf(',');
  const rawIntPart = firstComma === -1 ? cleaned : cleaned.slice(0, firstComma);
  const intPart = rawIntPart.replace(/^0+(?=\d)/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = isNegative ? '-' : '';

  if (firstComma === -1) return `${sign}${grouped}`;
  const decimalPart = cleaned.slice(firstComma + 1).replace(/,/g, '').slice(0, maxDecimals);
  return `${sign}${grouped},${decimalPart}`;
}

export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100;
}

export function formatMinorAmount(
  amountMinor: number,
  currencyCode: string = 'TRY',
  locale: string = 'tr-TR'
): string {
  const value = fromMinorUnits(Number.isFinite(amountMinor) ? amountMinor : 0);
  // Intl.NumberFormat({style:'currency'}) geçersiz/desteklenmeyen bir ISO kodunda ya da
  // tam Intl verisi olmayan bir ortamda (Hermes) RangeError fırlatabilir. Bu fonksiyon
  // her liste/detay satırında çalıştığı için buradaki bir throw tüm ekranı çökertirdi;
  // bu yüzden güvenli bir sayısal biçime düşülür ve kod tutar sonuna eklenir.
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    let numeric: string;
    try {
      numeric = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      numeric = value.toFixed(2);
    }
    return `${numeric} ${currencyCode}`;
  }
}

// docs/01-finansal-kayit-modeli.md §3.5/§8.1 — "değer birimi" fiat'ın ötesine (kıymetli
// maden) genişleyince en küçük ölçü birimi de birime göre değişir: fiat/gram_altin'de
// 1/100 (kuruş/santigram), sikke birimlerinde (ceyrek_altin vb.) 1/1 — ondalık yoktur.
// Bu üç fonksiyon parseAmount/parseAmountToMinor/formatMinorAmount'ı DEĞİŞTİRMEZ (mevcut
// tüm fiat-only çağıranlar aynı davranışta kalır); yalnızca birim seçimi olan yeni
// ekranlar (obligation formu/detayı) bunları kullanır.

/**
 * Metin tutarı, birimin hassasiyetine göre ana birim cinsinden sayıya çözer.
 * precision 0 olan birimlerde (sikkeler) en yakın tam sayıya yuvarlanır — kullanıcı
 * "2,5" yazsa bile "adet" kavramında kesir anlamsızdır.
 */
export function parseValueUnitAmount(value: string, unitCode: string): number | null {
  const parsed = parseAmount(value);
  if (parsed === null) return null;
  const unit = getValueUnit(unitCode);
  return unit.precision === 0 ? Math.round(parsed) : parsed;
}

/** Metin tutarı doğrudan birimin en küçük ölçüsüne (minor) çevirir. */
export function toValueUnitMinor(amount: number, unitCode: string): number {
  const unit = getValueUnit(unitCode);
  const scale = 10 ** unit.precision;
  return Math.round(amount * scale);
}

/** Metin tutarı çözüp doğrudan minor'a çevirir; çözümlenemezse null. */
export function parseValueUnitAmountToMinor(value: string, unitCode: string): number | null {
  const parsed = parseValueUnitAmount(value, unitCode);
  return parsed === null ? null : toValueUnitMinor(parsed, unitCode);
}

export function fromValueUnitMinor(amountMinor: number, unitCode: string): number {
  const unit = getValueUnit(unitCode);
  return amountMinor / 10 ** unit.precision;
}

// Kıymetli maden kodları (gram_altin, ceyrek_altin...) ISO 4217 değildir; bunları
// Intl.NumberFormat({style:'currency', currency: unitCode}) ile formatlamaya çalışmak
// RangeError fırlatır. Fiat için mevcut formatMinorAmount yoluna düşer, kıymetli maden
// için elle "{miktar} {birim adı}" biçiminde yazılır (docs §3.5 örnekleri: "3 çeyrek
// altın", "2,50 gram altın").
export function formatValueUnitAmount(
  amountMinor: number,
  unitCode: string,
  locale: string = 'tr-TR'
): string {
  const unit = getValueUnit(unitCode);
  if (unit.unitType === 'fiat') return formatMinorAmount(amountMinor, unitCode, locale);

  const quantity = fromValueUnitMinor(amountMinor, unitCode);
  const formattedQuantity = new Intl.NumberFormat(locale, {
    minimumFractionDigits: unit.precision,
    maximumFractionDigits: unit.precision,
  }).format(quantity);
  return `${formattedQuantity} ${unit.name}`;
}
