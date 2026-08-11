import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';
import { ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';

export type Counterparty = Tables<'counterparties'>;

export async function listCounterparties(workspaceId: string): Promise<Counterparty[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createCounterparty(input: TablesInsert<'counterparties'>): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCounterparty(
  id: string,
  input: TablesUpdate<'counterparties'>
): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getCounterparty(id: string): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export interface CounterpartyLedger {
  /** Bu cariden tahsil edilecek toplam. */
  receivableMinor: number;
  /** Bu cariye ödenecek toplam. */
  payableMinor: number;
  /** Pozitifse cari size borçlu, negatifse siz borçlusunuz. */
  netMinor: number;
  overdueMinor: number;
  overdueCount: number;
  openCount: number;
  nearestDueDate: string | null;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.7 — cari detayında toplam alacak, toplam borç ve
// geciken tutar gösterilir. Yalnızca açık (terminal olmayan) kayıtlar sayılır; kalan tutar
// üzerinden hesaplanır (docs/01-finansal-kayit-modeli.md §8 — "Toplam borç/alacak").
export async function getCounterpartyLedger(
  workspaceId: string,
  counterpartyId: string
): Promise<CounterpartyLedger> {
  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('obligations')
      .select('direction, remaining_amount_minor, currency_code, status, due_date')
      .eq('workspace_id', workspaceId)
      .eq('counterparty_id', counterpartyId)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (error) throw error;

  const rows = data ?? [];
  const toRef = (r: { remaining_amount_minor: number; currency_code: string }) =>
    sumToReferenceMinor([{ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code }], rates);
  // Kayıtlar farklı değer birimlerinde olabilir (TRY, USD, gram_altin, ...) — bkz.
  // getObligationSummary'deki aynı gerekçe. Doğrudan toplamak yerine her satır önce
  // güncel TL karşılığına çevrilir.
  const receivableMinor = rows.filter((r) => r.direction === 'receivable').reduce((sum, r) => sum + toRef(r), 0);
  const payableMinor = rows.filter((r) => r.direction === 'payable').reduce((sum, r) => sum + toRef(r), 0);
  const overdue = rows.filter((r) => r.status === 'gecikti');
  const dueDates = rows
    .map((r) => r.due_date)
    .filter((d): d is string => !!d)
    .sort();

  return {
    receivableMinor,
    payableMinor,
    netMinor: receivableMinor - payableMinor,
    overdueMinor: overdue.reduce((sum, r) => sum + toRef(r), 0),
    overdueCount: overdue.length,
    openCount: rows.length,
    nearestDueDate: dueDates[0] ?? null,
  };
}

// Cari listesinde her satırın net bakiyesi. Tek sorguyla tüm cariler hesaplanır; kişi başına
// ayrı istek atılmaz. Dönüş Map değil düz nesnedir çünkü react-query cache'i AsyncStorage'a
// JSON olarak yazılıyor (bkz. services/queryClient.ts).
export async function getCounterpartyBalances(workspaceId: string): Promise<Record<string, number>> {
  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('obligations')
      .select('counterparty_id, direction, remaining_amount_minor, currency_code')
      .eq('workspace_id', workspaceId)
      .not('counterparty_id', 'is', null)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (error) throw error;

  const balances: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.counterparty_id) continue;
    const sign = row.direction === 'receivable' ? 1 : -1;
    const refMinor = sumToReferenceMinor([{ amountMinor: row.remaining_amount_minor, unitCode: row.currency_code }], rates);
    balances[row.counterparty_id] = (balances[row.counterparty_id] ?? 0) + sign * refMinor;
  }
  return balances;
}

// Kişi/firma işlem/borç kayıtlarında kullanılıyorsa FK NO ACTION nedeniyle silme başarısız olur;
// çağıran taraf bu durumu kullanıcıya "kullanımda" mesajıyla iletir.
export async function deleteCounterparty(id: string): Promise<void> {
  const { error } = await supabase.from('counterparties').delete().eq('id', id);
  if (error) throw error;
}
