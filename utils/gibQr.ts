// e-Arşiv / e-Fatura karekodu (GİB): QR içeriği JSON'dur. Kullanılan alanlar GİB'in yayımladığı
// karekod şemasındandır: vkntckn (satıcı VKN/TCKN), tarih, no (fatura no), ettn, parabirimi,
// odenecek (ödenecek tutar) ya da vergidahil/malhizmettoplam (yedek). Alan adları sürümler
// arasında küçük farklar gösterebildiği için büyük/küçük harf yok sayılır ve doğrulama sıkıdır:
// ETTN + tutar + tarih yoksa karekod geçersiz sayılır ve normal OCR akışı devam eder.
export interface GibInvoiceQr {
  sellerTaxId: string | null;
  invoiceNo: string | null;
  ettn: string;
  /** YYYY-MM-DD */
  date: string;
  currencyCode: string;
  /** Ödenecek tutar, kuruş cinsinden. */
  amountMinor: number;
}

const ETTN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lowerKeys(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k.toLowerCase(), v]));
}

// GİB tutarları nokta ondalıklı metindir ("1250.50"); virgüllü gelirse de kabul edilir.
function toMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const tr = /^(\d{2})[./-](\d{2})[./-](\d{4})/.exec(value.trim());
  return tr ? `${tr[3]}-${tr[2]}-${tr[1]}` : null;
}

export function parseGibInvoiceQr(raw: string): GibInvoiceQr | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const data = lowerKeys(parsed as Record<string, unknown>);

  const ettn = typeof data.ettn === 'string' ? data.ettn.trim() : '';
  if (!ETTN_PATTERN.test(ettn)) return null;

  const amountMinor = toMinor(data.odenecek) ?? toMinor(data.vergidahil) ?? toMinor(data.malhizmettoplam);
  const date = toIsoDate(data.tarih);
  if (amountMinor === null || amountMinor <= 0 || !date) return null;

  return {
    sellerTaxId: typeof data.vkntckn === 'string' ? data.vkntckn : null,
    invoiceNo: typeof data.no === 'string' ? data.no : null,
    ettn,
    date,
    currencyCode: typeof data.parabirimi === 'string' && data.parabirimi.length === 3 ? data.parabirimi.toUpperCase() : 'TRY',
    amountMinor,
  };
}
