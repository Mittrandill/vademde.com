import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';
import { installmentTotalMatches } from '@/utils/validation';

export type Obligation = Tables<'obligations'>;
export type Installment = Tables<'installments'>;

export type ObligationWithRelations = Obligation & {
  category: { name: string } | null;
  counterparty: { name: string } | null;
  account: { name: string } | null;
};

// Taksitli bir obligation'ın tek bir taksitini takvim/liste ekranlarında ObligationWithRelations
// gibi göstermek için kullanılır: due_date/total_amount_minor/remaining_amount_minor o taksite
// aittir, id ise gerçek obligation'ı gösterir (detay sayfasına gidiş için); installment_id/number
// hangi taksit olduğunu taşır (ödeme kaydında kullanılır).
export type ObligationDueItem = ObligationWithRelations & {
  installment_id?: string | null;
  installment_number?: number | null;
};

// docs/06-teknik-mimari.md §10.6.2 — sayfa boyutu 30, .range() ile ofset tabanlı sayfalama.
export const OBLIGATIONS_PAGE_SIZE = 30;

// docs/01-finansal-kayit-modeli.md §3.4 — 'odendi', 'tahsil_edildi' ve 'iptal_edildi'
// terminal durumlardır; dashboard'daki aktif borç/alacak widget'ları bunları hariç tutar.
export const ACTIVE_OBLIGATION_STATUSES: Obligation['status'][] = [
  'taslak',
  'inceleme_gerekli',
  'bekliyor',
  'kismen_odendi',
  'gecikti',
  'kismen_tahsil_edildi',
];

// docs/01-finansal-kayit-modeli.md §3.4 — terminal (kapanmış) durumlar.
export const CLOSED_OBLIGATION_STATUSES: Obligation['status'][] = ['odendi', 'tahsil_edildi', 'iptal_edildi'];

export interface ListObligationsFilter {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  /** docs/01-finansal-kayit-modeli.md §3.2 belge türü ('cek', 'senet', 'kredi'...). */
  documentType?: string;
  counterpartyId?: string;
  statuses?: Obligation['status'][];
  dueFrom?: string;
  dueTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Vade tarihine göre sıralama yönü; varsayılan artan (en yakın vade önce). */
  ascending?: boolean;
}

export async function listObligations({
  workspaceId,
  direction,
  documentType,
  counterpartyId,
  statuses,
  dueFrom,
  dueTo,
  search,
  page = 0,
  pageSize = OBLIGATIONS_PAGE_SIZE,
  ascending = true,
}: ListObligationsFilter): Promise<ObligationWithRelations[]> {
  let query = supabase
    .from('obligations')
    .select('*, category:categories(name), counterparty:counterparties(name), account:accounts(name)')
    .eq('workspace_id', workspaceId);
  if (direction) query = query.eq('direction', direction);
  if (documentType) query = query.eq('document_type', documentType);
  if (counterpartyId) query = query.eq('counterparty_id', counterpartyId);
  if (statuses?.length) query = query.in('status', statuses);
  if (dueFrom) query = query.gte('due_date', dueFrom);
  if (dueTo) query = query.lte('due_date', dueTo);
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query = query.ilike('title', `%${trimmedSearch}%`);

  const { data, error } = await query
    .order('due_date', { ascending, nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return data as unknown as ObligationWithRelations[];
}

export interface ObligationSummary {
  count: number;
  payableMinor: number;
  receivableMinor: number;
  /** Kalan değil, kaydın orijinal toplam tutarı — ilerleme oranı (ödenen pay) hesaplamak için. */
  payableTotalMinor: number;
  receivableTotalMinor: number;
  overdueCount: number;
}

// Liste sayfalandırıldığı için özet yüklenen sayfalardan hesaplanamaz (yalnızca ilk 30
// kaydı toplar, yanlış rakam gösterir). Bu yüzden aynı filtrelerle, sadece toplanacak
// kolonları çeken ayrı bir sorgu kullanılır.
export async function getObligationSummary({
  workspaceId,
  direction,
  documentType,
  statuses,
  search,
}: Omit<ListObligationsFilter, 'page' | 'pageSize' | 'dueFrom' | 'dueTo'>): Promise<ObligationSummary> {
  let query = supabase
    .from('obligations')
    .select('direction, remaining_amount_minor, total_amount_minor, status')
    .eq('workspace_id', workspaceId);
  if (direction) query = query.eq('direction', direction);
  if (documentType) query = query.eq('document_type', documentType);
  if (statuses?.length) query = query.in('status', statuses);
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query = query.ilike('title', `%${trimmedSearch}%`);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  return {
    count: rows.length,
    payableMinor: rows
      .filter((r) => r.direction === 'payable')
      .reduce((sum, r) => sum + r.remaining_amount_minor, 0),
    receivableMinor: rows
      .filter((r) => r.direction === 'receivable')
      .reduce((sum, r) => sum + r.remaining_amount_minor, 0),
    payableTotalMinor: rows
      .filter((r) => r.direction === 'payable')
      .reduce((sum, r) => sum + r.total_amount_minor, 0),
    receivableTotalMinor: rows
      .filter((r) => r.direction === 'receivable')
      .reduce((sum, r) => sum + r.total_amount_minor, 0),
    overdueCount: rows.filter((r) => r.status === 'gecikti').length,
  };
}

export interface ObligationTypeTotal {
  count: number;
  totalMinor: number;
}

// "Daha Fazla" hub'ındaki kutu sayaçları. Sayfalı listeden türetilirse sayfa boyutuyla
// sınırlı kalacağı için tür bazlı toplamlar ayrı ve dar bir sorgudan gelir.
//
// Dönüş tipi Map değil düz nesnedir: react-query cache'i AsyncStorage'a JSON olarak
// yazılıyor (services/queryClient.ts) ve Map, JSON.stringify'da "{}" olur — uygulama
// yeniden açıldığında .get() patlardı.
export async function getObligationTotalsByType(
  workspaceId: string,
  statuses: Obligation['status'][] = ACTIVE_OBLIGATION_STATUSES
): Promise<Record<string, ObligationTypeTotal>> {
  const { data, error } = await supabase
    .from('obligations')
    .select('document_type, remaining_amount_minor')
    .eq('workspace_id', workspaceId)
    .in('status', statuses);
  if (error) throw error;

  const totals: Record<string, ObligationTypeTotal> = {};
  for (const row of data ?? []) {
    if (!row.document_type) continue;
    const current = totals[row.document_type] ?? { count: 0, totalMinor: 0 };
    totals[row.document_type] = {
      count: current.count + 1,
      totalMinor: current.totalMinor + row.remaining_amount_minor,
    };
  }
  return totals;
}

export interface ListInstallmentsDueFilter {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  statuses?: Obligation['status'][];
  dueFrom?: string;
  dueTo?: string;
  page?: number;
  pageSize?: number;
}

// Taksitli bir kredi/borcun HER taksiti kendi vadesinde ayrı bir kayıt olarak görünsün
// diye (bkz. takvim ve Hareketler ekranları) — listObligations tek satır (obligation'ın
// kendi due_date'i = ilk taksit) döndürdüğünden, 2. ve sonraki taksitler bu fonksiyon
// olmadan hiçbir yerde listelenmezdi.
export async function listInstallmentsDue({
  workspaceId,
  direction,
  statuses,
  dueFrom,
  dueTo,
  page = 0,
  pageSize = OBLIGATIONS_PAGE_SIZE,
}: ListInstallmentsDueFilter): Promise<ObligationDueItem[]> {
  let query = supabase
    .from('installments')
    .select(
      'id, installment_number, due_date, amount_minor, remaining_amount_minor, status, obligation:obligations!inner(*, category:categories(name), counterparty:counterparties(name), account:accounts(name))'
    )
    .eq('workspace_id', workspaceId)
    .neq('status', 'iptal_edildi');

  if (direction) query = query.eq('obligation.direction', direction);
  if (statuses?.length) query = query.in('obligation.status', statuses);
  if (dueFrom) query = query.gte('due_date', dueFrom);
  if (dueTo) query = query.lte('due_date', dueTo);

  const { data, error } = await query
    .order('due_date', { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;

  return (data as unknown as (Installment & { obligation: ObligationWithRelations })[]).map((row) => ({
    ...row.obligation,
    due_date: row.due_date,
    total_amount_minor: row.amount_minor,
    remaining_amount_minor: row.remaining_amount_minor,
    status: row.status,
    installment_id: row.id,
    installment_number: row.installment_number,
  }));
}

export async function getObligation(id: string): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getObligationWithInstallments(
  id: string
): Promise<{ obligation: Obligation; installments: Installment[] }> {
  const [{ data: obligation, error: obligationError }, { data: installments, error: installmentsError }] =
    await Promise.all([
      supabase.from('obligations').select('*').eq('id', id).single(),
      supabase
        .from('installments')
        .select('*')
        .eq('obligation_id', id)
        .order('installment_number', { ascending: true }),
    ]);

  if (obligationError) throw obligationError;
  if (installmentsError) throw installmentsError;
  return { obligation, installments };
}

// docs/12-mvp-kabul-kriterleri.md — taksitli borçlarda bildirim, ödenmiş taksitlerin
// sabit vade tarihine değil bir sonraki bekleyen taksitin vadesine göre planlanmalıdır.
export interface NextPendingInstallment {
  dueDate: string;
  remainingAmountMinor: number;
}

// Hatırlatma bildiriminde kredinin toplam bakiyesi değil, bu bekleyen taksitin
// kendi tutarı gösterilsin diye (bkz. services/notifications.ts) — kredinin
// toplam borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
export async function getNextPendingInstallment(obligationId: string): Promise<NextPendingInstallment | null> {
  const { data, error } = await supabase
    .from('installments')
    .select('due_date, remaining_amount_minor')
    .eq('obligation_id', obligationId)
    .gt('remaining_amount_minor', 0)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { dueDate: data.due_date, remainingAmountMinor: data.remaining_amount_minor } : null;
}

export interface ObligationInstallmentSummary {
  totalCount: number;
  remainingCount: number;
  nextDueDate: string | null;
  nextAmountMinor: number | null;
  principalSumMinor: number;
  interestSumMinor: number;
  /** En az bir taksitte hem anapara hem faiz kırılımı doluysa true. */
  hasRateData: boolean;
}

// Kredilerim listesindeki kartlar için toplu taksit özeti (bkz. app/obligations/index.tsx).
// getNextPendingInstallment'ın tekil mantığının, bir sayfa kayıt için N+1 sorgu atmadan
// toplu hâli. Dönüş tipi Map değil Record'dur (bkz. getObligationTotalsByType'taki aynı
// gerekçe — react-query cache'i AsyncStorage'a JSON olarak yazılır, Map "{}" olur).
export async function getObligationInstallmentSummaries(
  workspaceId: string,
  obligationIds: string[]
): Promise<Record<string, ObligationInstallmentSummary>> {
  if (obligationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('installments')
    .select('obligation_id, due_date, remaining_amount_minor, principal_minor, interest_minor')
    .eq('workspace_id', workspaceId)
    .in('obligation_id', obligationIds)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true });
  if (error) throw error;

  const summaries: Record<string, ObligationInstallmentSummary> = {};
  for (const row of data ?? []) {
    const current = summaries[row.obligation_id] ?? {
      totalCount: 0,
      remainingCount: 0,
      nextDueDate: null,
      nextAmountMinor: null,
      principalSumMinor: 0,
      interestSumMinor: 0,
      hasRateData: false,
    };

    current.totalCount += 1;
    const isRemaining = row.remaining_amount_minor > 0;
    if (isRemaining) {
      current.remainingCount += 1;
      // Satırlar due_date artan geldiği için bir obligation_id için ilk kalan taksit
      // doğal olarak "sıradaki" olur.
      if (current.nextDueDate === null) {
        current.nextDueDate = row.due_date;
        current.nextAmountMinor = row.remaining_amount_minor;
      }
    }
    if (row.principal_minor !== null && row.interest_minor !== null) {
      current.principalSumMinor += row.principal_minor;
      current.interestSumMinor += row.interest_minor;
      current.hasRateData = true;
    }

    summaries[row.obligation_id] = current;
  }
  return summaries;
}

export async function createObligation(input: TablesInsert<'obligations'>): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

// docs/01-finansal-kayit-modeli.md §8 — total_amount_minor değişirse
// obligations_recompute_on_amount_change trigger'ı remaining_amount_minor ve status'ü otomatik günceller.
export async function updateObligation(id: string, input: TablesUpdate<'obligations'>): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// Taksit ve ödeme geçmişi veritabanında CASCADE ile birlikte silinir (bkz. installments/payments FK'leri).
export async function deleteObligation(id: string): Promise<void> {
  const { error } = await supabase.from('obligations').delete().eq('id', id);
  if (error) throw error;
}

export interface CreateInstallmentPlanInput {
  workspaceId: string;
  obligationId: string;
  totalAmountMinor: number;
  installments: {
    installmentNumber: number;
    dueDate: string;
    amountMinor: number;
    principalMinor?: number | null;
    interestMinor?: number | null;
  }[];
}

export async function createInstallmentPlan({
  workspaceId,
  obligationId,
  totalAmountMinor,
  installments,
}: CreateInstallmentPlanInput): Promise<Installment[]> {
  if (!installmentTotalMatches(totalAmountMinor, installments.map((i) => i.amountMinor))) {
    throw new Error('Taksit toplamı, ana tutarla uyuşmuyor.');
  }

  const rows: TablesInsert<'installments'>[] = installments.map((installment) => ({
    workspace_id: workspaceId,
    obligation_id: obligationId,
    installment_number: installment.installmentNumber,
    due_date: installment.dueDate,
    amount_minor: installment.amountMinor,
    principal_minor: installment.principalMinor ?? null,
    interest_minor: installment.interestMinor ?? null,
  }));

  const { data, error } = await supabase.from('installments').insert(rows).select('*');
  if (error) throw error;
  return data;
}
