import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Transaction = Tables<'transactions'>;

export type TransactionWithRelations = Transaction & {
  category: { name: string } | null;
  counterparty: { name: string } | null;
  account: { name: string } | null;
};

// docs/06-teknik-mimari.md §10.6.2 — sayfa boyutu 30, .range() ile ofset tabanlı sayfalama.
export const TRANSACTIONS_PAGE_SIZE = 30;

export interface ListTransactionsFilter {
  workspaceId: string;
  accountId?: string;
  direction?: Transaction['direction'];
  page?: number;
  pageSize?: number;
}

export async function listTransactions({
  workspaceId,
  accountId,
  direction,
  page = 0,
  pageSize = TRANSACTIONS_PAGE_SIZE,
}: ListTransactionsFilter): Promise<TransactionWithRelations[]> {
  let query = supabase
    .from('transactions')
    .select(
      '*, category:categories(name), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name)'
    )
    .eq('workspace_id', workspaceId)
    .order('occurred_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (accountId) query = query.eq('account_id', accountId);
  if (direction) query = query.eq('direction', direction);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as TransactionWithRelations[];
}

export async function createTransaction(
  input: TablesInsert<'transactions'>
): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').insert(input).select('*').single();
  if (error) throw error;
  return data;
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
