import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';

export type Transaction = Tables<'transactions'>;

export type TransactionAccountRef = {
  name: string;
  bank_code: string | null;
  type: string;
  card_last_four: string | null;
};

// Bir ödemenin ait olduğu borcun kimliği — taksitli ödemelerde borç, `installment` üzerinden
// dolaylı gelir (bkz. PaymentRef.installment). RecentTransactionsList bunu, borç ödemesinden
// oluşan işlemlerde banka logosu yerine borcun/servisin kendi ikonunu (ör. Youtube) göstermek
// için kullanır — bkz. ObligationIcon.
export type PaymentObligationRef = {
  document_type: string;
  bank_code: string | null;
  service_code: string | null;
  title: string;
};

export type PaymentRef = {
  id: string;
  obligation_id: string | null;
  installment_id: string | null;
  obligation: PaymentObligationRef | null;
  installment: { obligation: PaymentObligationRef | null } | null;
};

export type TransactionWithRelations = Transaction & {
  category: { name: string; icon: string | null } | null;
  counterparty: { name: string } | null;
  account: TransactionAccountRef | null;
  // Boş değilse bu hareket bir borç/alacak (kredi, kredi kartı, çek, senet, fatura)
  // ödemesinden otomatik oluşturulmuştur — bu kayıtlar docs/01-finansal-kayit-modeli.md
  // gereği birer "belge türü"dür, kategori değil (bkz. RecentTransactionsList/hareketler.tsx).
  // Supabase normalde boş bir dizi döndürür ama tanımsız gelme ihtimaline karşı opsiyonel
  // işaretlenir.
  payments?: PaymentRef[];
};

// Hareket detay ekranı için: transfer hedefi hesabı da içerir.
export type TransactionDetail = TransactionWithRelations & {
  transferToAccount: { name: string; bank_code: string | null } | null;
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
      '*, category:categories(name, icon), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name, bank_code, type, card_last_four), payments(id, obligation_id, installment_id, obligation:obligations(document_type, bank_code, service_code, title), installment:installments(obligation:obligations(document_type, bank_code, service_code, title)))'
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

// Bir işlem bir borç/taksit ödemesinden otomatik oluştuysa, o borcun kimliğini döner
// (taksitliyse installment üzerinden dolaylı) — yoksa null. RecentTransactionsList bunu
// satırın ana ikonunu seçerken kullanır (bkz. ObligationIcon).
export function getPaymentObligation(t: TransactionWithRelations): PaymentObligationRef | null {
  const payment = t.payments?.[0];
  if (!payment) return null;
  return payment.obligation ?? payment.installment?.obligation ?? null;
}

export async function getTransaction(id: string): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Hareket detay ekranı (app/transactions/[id].tsx) için ilişkili tüm alanlarla birlikte.
export async function getTransactionWithRelations(id: string): Promise<TransactionDetail> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      '*, category:categories(name, icon), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name, bank_code, type, card_last_four), transferToAccount:accounts!transactions_transfer_to_account_id_fkey(name, bank_code), payments(id, obligation_id, installment_id, obligation:obligations(document_type, bank_code, service_code, title), installment:installments(obligation:obligations(document_type, bank_code, service_code, title)))'
    )
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as TransactionDetail;
}

export async function createTransaction(
  input: TablesInsert<'transactions'>
): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

// Kredi kartı ekstresini kategorilere ayırırken her harcama satırı için ayrı bir
// createTransaction çağrısı yapılıyordu (bkz. app/documents/[id]/review.tsx); 80 işlemlik
// bir ekstrede bu 80 ardışık ağ gidiş-dönüşü demek ve onay ekranı dakikalarca yanıt
// vermiyordu. Toplu insert tek çağrıda yazar; satır tetikleyicileri yine satır başına çalışır.
export async function createTransactions(
  rows: TablesInsert<'transactions'>[]
): Promise<Transaction[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from('transactions').insert(rows).select('*');
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
