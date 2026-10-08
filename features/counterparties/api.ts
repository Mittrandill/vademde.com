import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';
import { ACTIVE_OBLIGATION_STATUSES, getSettlingInstrumentIds } from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';

export type Counterparty = Tables<'counterparties'>;

// counterparties.type'ın tek kaynağı. DB tarafında enum değil `text` + CHECK constraint
// olarak tutulur (bkz. supabase/migrations/20260905120000_add_personel_counterparty_type.sql);
// bu union ile CHECK listesi birlikte değiştirilmelidir.
//
// 'personel' ayrı bir tür olarak vardır çünkü personel, müşteri/tedarikçi ile aynı listede
// karışınca maaş takibi yapılamıyordu — ayrı filtre sekmesi, ayrı ikon ve TC kimlik alanı
// için tür bilgisi gerekir (bkz. app/counterparties/index.tsx TYPE_FILTERS).
export type CounterpartyType = 'individual' | 'company' | 'personel';

export const COUNTERPARTY_TYPES: CounterpartyType[] = ['individual', 'company', 'personel'];

export const COUNTERPARTY_TYPE_LABEL: Record<CounterpartyType, string> = {
  individual: 'Kişi',
  company: 'Firma',
  personel: 'Personel',
};

// Türkçe çoğul eki programatik türetilemez (bkz. features/obligations/documentTypes.ts
// DOCUMENT_TYPE_LABEL_PLURAL) — liste filtresi başlıkları elle yazılır.
export const COUNTERPARTY_TYPE_LABEL_PLURAL: Record<CounterpartyType, string> = {
  individual: 'Kişiler',
  company: 'Firmalar',
  personel: 'Personel',
};

export function getCounterpartyType(type: string | null | undefined): CounterpartyType {
  return type === 'company' || type === 'personel' ? type : 'individual';
}

export function getCounterpartyTypeLabel(type: string | null | undefined): string {
  return COUNTERPARTY_TYPE_LABEL[getCounterpartyType(type)];
}

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
  /**
   * Bu cariye faturası karşılığında verilmiş, vadesi gelmemiş çek/senetlerin kalanı. Cari bakiyesine
   * girmez (cari çek verilince kapanır); vadede hesaptan ödenecek tutar olarak ayrıca gösterilir.
   */
  instrumentPayableMinor: number;
  /** Bu cariden alacağı karşılığında alınmış, henüz tahsil edilmemiş çek/senetlerin kalanı. */
  instrumentReceivableMinor: number;
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
      .select('id, document_type, direction, remaining_amount_minor, currency_code, status, due_date')
      .eq('workspace_id', workspaceId)
      .eq('counterparty_id', counterpartyId)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (error) throw error;

  // Faturayı kapatmış çek/senet cari bakiyesinden ayrılır (bkz. getSettlingInstrumentIds).
  const settlingInstrumentIds = await getSettlingInstrumentIds(workspaceId, data ?? []);
  const instruments = (data ?? []).filter((r) => settlingInstrumentIds.has(r.id));
  const rows = (data ?? []).filter((r) => !settlingInstrumentIds.has(r.id));
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
    instrumentPayableMinor: instruments
      .filter((r) => r.direction === 'payable')
      .reduce((sum, r) => sum + toRef(r), 0),
    instrumentReceivableMinor: instruments
      .filter((r) => r.direction === 'receivable')
      .reduce((sum, r) => sum + toRef(r), 0),
  };
}

// Cari listesinde her satırın net bakiyesi. Tek sorguyla tüm cariler hesaplanır; kişi başına
// ayrı istek atılmaz. Dönüş Map değil düz nesnedir çünkü react-query cache'i AsyncStorage'a
// JSON olarak yazılıyor (bkz. services/queryClient.ts).
export async function getCounterpartyBalances(workspaceId: string): Promise<Record<string, number>> {
  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('obligations')
      .select('id, document_type, counterparty_id, direction, remaining_amount_minor, currency_code')
      .eq('workspace_id', workspaceId)
      .not('counterparty_id', 'is', null)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (error) throw error;

  // Faturayı kapatmış çek/senet cari bakiyesine ikinci kez girmez (bkz. getSettlingInstrumentIds).
  const settlingInstrumentIds = await getSettlingInstrumentIds(workspaceId, data ?? []);
  const balances: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.counterparty_id || settlingInstrumentIds.has(row.id)) continue;
    const sign = row.direction === 'receivable' ? 1 : -1;
    const refMinor = sumToReferenceMinor([{ amountMinor: row.remaining_amount_minor, unitCode: row.currency_code }], rates);
    balances[row.counterparty_id] = (balances[row.counterparty_id] ?? 0) + sign * refMinor;
  }
  return balances;
}

// --- Cari ekstresi ------------------------------------------------------------------------------

export type StatementEntryKind = 'document' | 'payment' | 'transaction';

export interface StatementEntry {
  /** Liste anahtarı — türle önekli, benzersiz. */
  key: string;
  kind: StatementEntryKind;
  date: string;
  title: string;
  subtitle: string | null;
  amountMinor: number;
  currencyCode: string;
  /**
   * Cari bakiyesine etkisi (pozitif = cari bize daha çok borçlu / biz daha az borçluyuz).
   * Fatura/borç kaydı ve ödeme/tahsilat bakiyeyi değiştirir; kayda bağlı olmayan bir hareket
   * (ör. peşin alışveriş) değiştirmez (0).
   */
  balanceEffectMinor: number;
  /** Tek para birimli ekstrede bu satırdan sonraki cari bakiyesi; karışık birimde null. */
  runningBalanceMinor: number | null;
  obligationId: string | null;
  transactionId: string | null;
  documentType: string | null;
  /** 'payable' | 'receivable' (kayıt/ödeme) ya da 'income' | 'expense' (hareket). */
  direction: string;
  /** Kayıt satırlarında obligation durumu (bekliyor, odendi, tahsil_edildi…); diğerlerinde null. */
  status: string | null;
  /** Kayıt satırlarında vade tarihi (yyyy-MM-dd); yoksa null. */
  dueDate: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit',
  havale: 'Havale/EFT',
  kredi_karti: 'Kredi kartı',
  online_odeme: 'Online',
  diger: 'Diğer',
};

interface StatementObligationRow {
  id: string;
  title: string;
  document_type: string;
  direction: string;
  total_amount_minor: number;
  currency_code: string;
  created_at: string;
  status: string;
  due_date: string | null;
}

// Çek ve senet: vadesindeki ödeme/tahsilat ayrı satır olarak değil, belgenin kendi satırında
// durum olarak (Bekliyor → Ödendi / Tahsil edildi) gösterilir.
const INSTRUMENT_TYPES = new Set(['cek', 'senet']);

interface StatementPaymentRow {
  id: string;
  obligation_id: string;
  amount_minor: number;
  paid_at: string;
  notes: string | null;
  settled_by_obligation_id: string | null;
  transaction_id: string | null;
  account: { name: string } | null;
  transaction: { payment_method: string | null } | null;
}

interface StatementTransactionRow {
  id: string;
  direction: string;
  amount_minor: number;
  currency_code: string;
  occurred_at: string;
  description: string | null;
  payment_method: string | null;
  source_obligation_id: string | null;
  account: { name: string } | null;
  payments: { id: string }[] | null;
}

// Cari detayındaki Hareketler sekmesi: bu cariyle ilgili her şey tek zaman çizelgesinde — fatura/
// fiş/çek/senet/avans kayıtları, bunlara yapılan ödeme ve tahsilatlar (hesaptan, çek/senetle,
// mahsup ya da ciro ile) ve kayda bağlı olmayan hareketler. Önceden yalnızca counterparty_id'li
// hareketler listeleniyordu: faturalar ve çek/senetle yapılan (hesap hareketi oluşturmayan)
// ödemeler hiç görünmüyordu.
export async function getCounterpartyStatement(
  workspaceId: string,
  counterpartyId: string
): Promise<StatementEntry[]> {
  const [obligationsResult, transactionsResult] = await Promise.all([
    supabase
      .from('obligations')
      .select('id, title, document_type, direction, total_amount_minor, currency_code, created_at, status, due_date')
      .eq('workspace_id', workspaceId)
      .eq('counterparty_id', counterpartyId)
      .neq('status', 'iptal_edildi')
      .limit(1000),
    supabase
      .from('transactions')
      .select(
        'id, direction, amount_minor, currency_code, occurred_at, description, payment_method, source_obligation_id, account:accounts!transactions_account_id_fkey(name), payments(id)'
      )
      .eq('workspace_id', workspaceId)
      .eq('counterparty_id', counterpartyId)
      .in('direction', ['income', 'expense'])
      .limit(1000),
  ]);
  if (obligationsResult.error) throw obligationsResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  const obligations = (obligationsResult.data ?? []) as StatementObligationRow[];
  const obligationById = new Map(obligations.map((o) => [o.id, o]));
  // Faturayı kapatmış çek/senet: cariyi zaten kapattığı için kendi satırı ve vadesindeki ödemesi
  // cari bakiyesini değiştirmez (bkz. getSettlingInstrumentIds) — bilgi satırı olarak görünür.
  const settlingInstrumentIds = await getSettlingInstrumentIds(workspaceId, obligations);

  let payments: StatementPaymentRow[] = [];
  if (obligations.length > 0) {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, obligation_id, amount_minor, paid_at, notes, settled_by_obligation_id, transaction_id, account:accounts(name), transaction:transactions(payment_method)'
      )
      .in(
        'obligation_id',
        obligations.map((o) => o.id)
      )
      .limit(5000);
    if (error) throw error;
    payments = (data ?? []) as unknown as StatementPaymentRow[];
  }

  const entries: StatementEntry[] = [];
  const isInstrument = (o: StatementObligationRow) => INSTRUMENT_TYPES.has(o.document_type);
  // Bir ödemenin cari bakiyesine etkisi: borca ödeme bakiyeyi artırır, alacağa tahsilat azaltır.
  const paymentEffect = (o: StatementObligationRow, amountMinor: number) =>
    o.direction === 'receivable' ? -amountMinor : amountMinor;

  // Çek/senetle kapatılan fatura ödemesi (settled_by_obligation_id) ayrı satır olmaz; etkisi çekin
  // kendi satırına yazılır ("Çek · verildi" faturayı o tarihte kapatır). Çek bu caride değilse
  // (ör. başka cariden alınıp ciro edilen çek) ödeme satırı olarak kalır.
  const settlementEffectBySettler = new Map<string, number>();
  // Çek/senedin kendi ödemeleri (vadesinde hesaptan çıkış/giriş) satır olarak gösterilmez.
  const instrumentPaymentEffect = new Map<string, number>();
  const visiblePayments: StatementPaymentRow[] = [];
  for (const p of payments) {
    const obligation = obligationById.get(p.obligation_id);
    if (!obligation) continue;
    if (p.settled_by_obligation_id && obligationById.has(p.settled_by_obligation_id)) {
      const prev = settlementEffectBySettler.get(p.settled_by_obligation_id) ?? 0;
      settlementEffectBySettler.set(p.settled_by_obligation_id, prev + paymentEffect(obligation, p.amount_minor));
      continue;
    }
    if (isInstrument(obligation)) {
      instrumentPaymentEffect.set(obligation.id, (instrumentPaymentEffect.get(obligation.id) ?? 0) + paymentEffect(obligation, p.amount_minor));
      continue;
    }
    visiblePayments.push(p);
  }

  for (const o of obligations) {
    const isReceivable = o.direction === 'receivable';
    const isSettlingInstrument = settlingInstrumentIds.has(o.id);
    const label = DOCUMENT_TYPE_LABEL[o.document_type] ?? 'Kayıt';
    let balanceEffect: number;
    let subtitle: string;
    if (isInstrument(o)) {
      // Faturayı kapatan çek: kapattığı tutar kadar; bağımsız çek: kalan (tutar − ödenen) kadar.
      const own = isSettlingInstrument ? 0 : (isReceivable ? o.total_amount_minor : -o.total_amount_minor) + (instrumentPaymentEffect.get(o.id) ?? 0);
      balanceEffect = own + (settlementEffectBySettler.get(o.id) ?? 0);
      subtitle = `${label} · ${isReceivable ? 'alındı' : 'verildi'}`;
    } else {
      balanceEffect = (isReceivable ? o.total_amount_minor : -o.total_amount_minor) + (settlementEffectBySettler.get(o.id) ?? 0);
      subtitle = `${label} · ${isReceivable ? 'Alacak' : 'Borç'}`;
    }
    entries.push({
      key: `o:${o.id}`,
      kind: 'document',
      date: o.created_at,
      title: o.title,
      subtitle,
      amountMinor: o.total_amount_minor,
      currencyCode: o.currency_code,
      balanceEffectMinor: balanceEffect,
      runningBalanceMinor: null,
      obligationId: o.id,
      transactionId: null,
      documentType: o.document_type,
      direction: o.direction,
      status: o.status,
      dueDate: o.due_date,
    });
  }

  for (const p of visiblePayments) {
    const obligation = obligationById.get(p.obligation_id);
    if (!obligation) continue;
    const isReceivable = obligation.direction === 'receivable';
    const verb = isReceivable ? 'Tahsilat' : 'Ödeme';
    const method = p.transaction?.payment_method ? METHOD_LABEL[p.transaction.payment_method] : null;
    const title = p.settled_by_obligation_id
      ? (p.notes ?? `${verb} (para hareketi yok)`)
      : p.transaction_id
        ? `${verb}${method ? ` — ${method}` : ''}`
        : `${verb} (hesapsız işaretlendi)`;
    entries.push({
      key: `p:${p.id}`,
      kind: 'payment',
      date: p.paid_at,
      title,
      subtitle: [obligation.title, p.account?.name].filter(Boolean).join(' · ') || null,
      amountMinor: p.amount_minor,
      currencyCode: obligation.currency_code,
      balanceEffectMinor: settlingInstrumentIds.has(obligation.id) ? 0 : paymentEffect(obligation, p.amount_minor),
      runningBalanceMinor: null,
      obligationId: obligation.id,
      transactionId: p.transaction_id,
      documentType: obligation.document_type,
      direction: obligation.direction,
      status: null,
      dueDate: null,
    });
  }

  // Kayda bağlı olmayan hareketler (peşin alış/satış vb.) bakiyeyi değiştirmez. Ödemeden doğan
  // hareketler (yukarıda ödeme satırı olarak var) ve bir kaydın parçası olan hareketler (avansın
  // parası — avans kaydıyla birlikte gösterilir) tekrar listelenmez.
  for (const t of (transactionsResult.data ?? []) as unknown as StatementTransactionRow[]) {
    if ((t.payments?.length ?? 0) > 0) continue;
    if (t.source_obligation_id && obligationById.has(t.source_obligation_id)) continue;
    const method = t.payment_method ? METHOD_LABEL[t.payment_method] : null;
    entries.push({
      key: `t:${t.id}`,
      kind: 'transaction',
      date: t.occurred_at,
      title: t.description?.trim() || (t.direction === 'income' ? 'Gelir' : 'Gider'),
      subtitle: [t.account?.name, method].filter(Boolean).join(' · ') || null,
      amountMinor: t.amount_minor,
      currencyCode: t.currency_code,
      balanceEffectMinor: 0,
      runningBalanceMinor: null,
      obligationId: null,
      transactionId: t.id,
      documentType: null,
      direction: t.direction,
      status: null,
      dueDate: null,
    });
  }

  // Yürüyen bakiye eskiden yeniye hesaplanır; aynı anda oluşan kayıt ödemesinden önce gelir.
  const kindOrder: Record<StatementEntryKind, number> = { document: 0, payment: 1, transaction: 2 };
  entries.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind]);
  const singleCurrency = new Set(entries.map((e) => e.currencyCode)).size <= 1;
  let running = 0;
  for (const entry of entries) {
    running += entry.balanceEffectMinor;
    entry.runningBalanceMinor = singleCurrency ? running : null;
  }
  return entries.reverse();
}

// Kişi/firma işlem/borç kayıtlarında kullanılıyorsa FK NO ACTION nedeniyle silme başarısız olur;
// çağıran taraf bu durumu kullanıcıya "kullanımda" mesajıyla iletir.
export async function deleteCounterparty(id: string): Promise<void> {
  const { error } = await supabase.from('counterparties').delete().eq('id', id);
  if (error) throw error;
}
