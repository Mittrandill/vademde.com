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

export interface ListObligationsFilter {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  statuses?: Obligation['status'][];
  dueFrom?: string;
  dueTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listObligations({
  workspaceId,
  direction,
  statuses,
  dueFrom,
  dueTo,
  search,
  page = 0,
  pageSize = OBLIGATIONS_PAGE_SIZE,
}: ListObligationsFilter): Promise<ObligationWithRelations[]> {
  let query = supabase
    .from('obligations')
    .select('*, category:categories(name), counterparty:counterparties(name), account:accounts(name)')
    .eq('workspace_id', workspaceId);
  if (direction) query = query.eq('direction', direction);
  if (statuses?.length) query = query.in('status', statuses);
  if (dueFrom) query = query.gte('due_date', dueFrom);
  if (dueTo) query = query.lte('due_date', dueTo);
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query = query.ilike('title', `%${trimmedSearch}%`);

  const { data, error } = await query
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return data as unknown as ObligationWithRelations[];
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
export async function getNextPendingInstallmentDueDate(obligationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('installments')
    .select('due_date')
    .eq('obligation_id', obligationId)
    .gt('remaining_amount_minor', 0)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.due_date ?? null;
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
  installments: Array<{ installmentNumber: number; dueDate: string; amountMinor: number }>;
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
  }));

  const { data, error } = await supabase.from('installments').insert(rows).select('*');
  if (error) throw error;
  return data;
}
