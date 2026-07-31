import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';

export type Transaction = Tables<'transactions'>;

export type TransactionWithRelations = Transaction & {
  category: { name: string } | null;
  counterparty: { name: string } | null;
  account: { name: string; bank_code: string | null } | null;
};

// docs/06-teknik-mimari.md §10.6.2 — sayfa boyutu 30, .range() ile ofset tabanlı sayfalama.
export const TRANSACTIONS_PAGE_SIZE = 30;

export interface ListTransactionsFilter {
  workspaceId: string;
  accountId?: string;
  counterpartyId?: string;
  direction?: Transaction['direction'];
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions({
  workspaceId,
  accountId,
  counterpartyId,
  direction,
  search,
  page = 0,
  pageSize = TRANSACTIONS_PAGE_SIZE,
}: ListTransactionsFilter): Promise<TransactionWithRelations[]> {
  let query = supabase
    .from('transactions')
    .select(
      '*, category:categories(name), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name, bank_code)'
    )
    .eq('workspace_id', workspaceId)
    .order('occurred_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (accountId) query = query.eq('account_id', accountId);
  if (counterpartyId) query = query.eq('counterparty_id', counterpartyId);
  if (direction) query = query.eq('direction', direction);
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query = query.ilike('description', `%${trimmedSearch}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as TransactionWithRelations[];
}

export async function getTransaction(id: string): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createTransaction(
  input: TablesInsert<'transactions'>
): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(
  id: string,
  input: TablesUpdate<'transactions'>
): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export interface CreateTransferInput {
  workspaceId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  currencyCode?: string;
  occurredAt?: string;
  description?: string;
}

// docs/01-finansal-kayit-modeli.md §8 — transfer toplam varlığı değiştirmez,
// yalnızca kaynak ve hedef hesabı etkiler.
export async function createTransfer(input: CreateTransferInput): Promise<Transaction> {
  return createTransaction({
    workspace_id: input.workspaceId,
    account_id: input.fromAccountId,
    transfer_to_account_id: input.toAccountId,
    direction: 'transfer',
    amount_minor: input.amountMinor,
    currency_code: input.currencyCode,
    occurred_at: input.occurredAt,
    description: input.description,
  });
}
