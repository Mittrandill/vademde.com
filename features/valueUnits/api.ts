import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';
import { getValueUnit } from '@/features/valueUnits/units';

export type ValueUnitRate = Tables<'value_unit_rates'>;

// docs/05-veri-modeli.md §9.4.2 — value_unit_rates workspace'e özel değildir, tüm
// authenticated kullanıcılar SELECT edebilir; istemci hiçbir zaman dış kur API'sine
// veya sync-market-rates Edge Function'ına doğrudan erişmez, yalnızca bu önbelleği okur.
export async function listValueUnitRates(): Promise<ValueUnitRate[]> {
  const { data, error } = await supabase.from('value_unit_rates').select('*');
  if (error) throw error;
  return data;
}

// Kur/fiyat çok eskiyse (Edge Function günde 1 kez çalışıyor, bkz. supabase/functions/
// sync-market-rates) referans TL karşılığı yerine "güncellenemedi" şeffaflığı gösterilir.
// 36 saat: günlük senkronizasyonun bir günü kaçırması durumuna tolerans tanır, iki günü kaçırırsa göstermez.
export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export interface ReferenceValue {
  amountMinor: number;
  cachedAt: string;
  isStale: boolean;
}

export function isRateStale(cachedAt: string): boolean {
  const cachedAtMs = new Date(cachedAt).getTime();
  return !Number.isFinite(cachedAtMs) || Date.now() - cachedAtMs > STALE_AFTER_MS;
}

// docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydının TL karşılığı
// kalıcı olarak saklanmaz, her görüntülemede canlı fiyattan hesaplanır. Kur satırı yoksa
// null döner; kaydın kendi tutarı bundan etkilenmez, çağıran taraf yalnızca "≈ TL" satırını
// göstermez.
export function convertToReferenceMinor(
  amountMinor: number,
  unitCode: string,
  rates: ValueUnitRate[]
): ReferenceValue | null {
  if (unitCode === 'TRY') return { amountMinor, cachedAt: new Date().toISOString(), isStale: false };

  const rate = rates.find((r) => r.unit_code === unitCode);
  if (!rate) return null;

  // try_equivalent_minor: 1 tam birimin (1 TRY, 1 USD, 1 gram altın, 1 adet çeyrek altın)
  // TL karşılığı, kuruş cinsinden. Kaydın kendi amountMinor'ını önce kendi biriminin
  // hassasiyetine göre tam birime çevirip (features/valueUnits/units.ts'teki precision —
  // fiat/gram_altin: /100, sikkeler: /1), sonra kurla çarpıyoruz.
  const amountInUnits = amountMinor / 10 ** getValueUnit(unitCode).precision;
  const referenceMinor = Math.round(amountInUnits * rate.try_equivalent_minor);

  return { amountMinor: referenceMinor, cachedAt: rate.cached_at, isStale: isRateStale(rate.cached_at) };
}

// docs/01-finansal-kayit-modeli.md §3.5 — birden çok kayıt (ör. bir kısmı TRY, bir kısmı
// gram_altin) tek bir toplamda gösterilecekse önce her biri kendi biriminden TL karşılığına
// çevrilip öyle toplanmalı; aksi halde "5 gram" ham sayı olarak "5 TL" gibi toplama girer.
// Kur satırı bulunamayan (senkron hiç çalışmamış/silinmiş birim) kayıtlar toplamdan hariç
// tutulur — yanlış bir TL karşılığı uydurmak, hiç göstermemekten daha kötüdür.
export function sumToReferenceMinor(
  rows: { amountMinor: number; unitCode: string }[],
  rates: ValueUnitRate[]
): number {
  return rows.reduce(
    (sum, row) => sum + (convertToReferenceMinor(row.amountMinor, row.unitCode, rates)?.amountMinor ?? 0),
    0
  );
}
