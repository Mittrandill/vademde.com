// docs/06-teknik-mimari.md §10.7 — kur ve altın fiyat senkronizasyonu.
// docs/05-veri-modeli.md §9.4.2 — value_unit_rates önbellek tablosu.
// process-document ile aynı desen: dış servis anahtarı (ALTINAPI_KEY) yalnızca bu
// Edge Function'ın ortam değişkeninde tutulur, mobil istemci hiç erişmez ve dış
// API'leri hiçbir zaman doğrudan çağırmaz — yalnızca value_unit_rates'i okur.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALTINAPI_KEY = Deno.env.get('ALTINAPI_KEY')!;

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const ALTINAPI_URL = 'https://altinapi.com/api/v1/prices';

// docs/06-teknik-mimari.md §10.7 — P1 kapsamı yalnızca "_YENI" (güncel basım)
// sikke varyantlarını kapsar; ATA altını ve "_ESKI" varyantları ayrı bir üründür,
// ileride ayrı value_unit_code'lar olarak eklenebilir.
const GOLD_SYMBOL_MAP: Record<string, string> = {
  gram_altin: 'ALTIN',
  ceyrek_altin: 'CEYREK_YENI',
  yarim_altin: 'YARIM_YENI',
  tam_altin: 'TEK_YENI',
};

interface RateRow {
  unit_code: string;
  unit_type: 'fiat' | 'kiymetli_maden';
  try_equivalent_minor: number;
  source: string;
  source_fetched_at: string | null;
}

function toMinor(value: number): number {
  return Math.round(value * 100);
}

// docs/01-finansal-kayit-modeli.md §8.2 — bir borcu kapatmak için ilgili döviz/altını
// piyasadan almak gerektiğinden referans değer olarak satış (ask) fiyatı kullanılır.
async function fetchTcmbRates(): Promise<RateRow[]> {
  const response = await fetch(TCMB_URL);
  if (!response.ok) throw new Error(`TCMB isteği başarısız: ${response.status}`);
  const xml = await response.text();

  const dateMatch = xml.match(/Tarih_Date[^>]*Date="([^"]+)"/);
  const fetchedAt = dateMatch ? new Date(dateMatch[1]).toISOString() : null;

  const rows: RateRow[] = [];
  for (const code of ['USD', 'EUR']) {
    const block = xml.match(new RegExp(`<Currency[^>]*Kod="${code}"[^>]*>([\\s\\S]*?)</Currency>`));
    if (!block) continue;
    const sellingMatch = block[1].match(/<ForexSelling>([^<]*)<\/ForexSelling>/);
    const selling = sellingMatch ? parseFloat(sellingMatch[1]) : NaN;
    if (!Number.isFinite(selling) || selling <= 0) continue;
    rows.push({
      unit_code: code,
      unit_type: 'fiat',
      try_equivalent_minor: toMinor(selling),
      source: 'tcmb',
      source_fetched_at: fetchedAt,
    });
  }
  return rows;
}

async function fetchGoldRates(): Promise<RateRow[]> {
  const response = await fetch(ALTINAPI_URL, { headers: { 'X-API-Key': ALTINAPI_KEY } });
  if (!response.ok) throw new Error(`altinapi.com isteği başarısız: ${response.status}`);
  const body = await response.json();
  const items: Array<{ symbol?: string; ask?: number; timestamp_utc?: string }> = body.data ?? [];

  const rows: RateRow[] = [];
  for (const [unitCode, symbol] of Object.entries(GOLD_SYMBOL_MAP)) {
    const item = items.find((i) => i.symbol === symbol);
    const ask = item?.ask;
    if (typeof ask !== 'number' || ask <= 0) continue;
    rows.push({
      unit_code: unitCode,
      unit_type: 'kiymetli_maden',
      try_equivalent_minor: toMinor(ask),
      source: 'altinapi.com',
      source_fetched_at: item?.timestamp_utc ?? null,
    });
  }
  return rows;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results = await Promise.allSettled([fetchTcmbRates(), fetchGoldRates()]);
  const rows: RateRow[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      rows.push(...result.value);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ success: false, errors }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cachedAt = new Date().toISOString();
  const { error } = await supabase
    .from('value_unit_rates')
    .upsert(
      rows.map((row) => ({ ...row, cached_at: cachedAt })),
      { onConflict: 'unit_code' }
    );

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message, errors }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ success: true, updated: rows.map((r) => r.unit_code), errors }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
