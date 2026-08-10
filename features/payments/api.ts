import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Payment = Tables<'payments'>;

export async function listPaymentsForObligation(obligationId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('obligation_id', obligationId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return data;
}

export interface RecordPaymentInput {
  workspace_id: string;
  obligation_id: string;
  installment_id?: string | null;
  account_id?: string | null;
  amount_minor: number;
  notes?: string | null;
  // Geçmiş tarihli taksitleri OCR sırasında otomatik "ödendi" işaretlerken (bkz.
  // review.tsx) gerçek vade tarihiyle kaydetmek için; verilmezse DB varsayılanı (şimdi) kullanılır.
  paid_at?: string;
  // Hesap seçildiyse hesabın bakiyesine yansısın diye ilişkili bir transaction
  // oluşturmak için gereken bağlam (bkz. accounts bakiyesi transactions'tan hesaplanır).
  obligationDirection: 'payable' | 'receivable';
  obligationTitle: string;
  obligationCategoryId?: string | null;
  obligationCounterpartyId?: string | null;
  obligationCurrencyCode: string;
}

// docs/01-finansal-kayit-modeli.md §8 — kalan tutar ve durum, veritabanı trigger'larıyla
// (recompute_obligation_progress / recompute_installment_progress) otomatik güncellenir.
// Hesap bakiyeleri ise (bkz. features/reports/api.ts getAccountBalances, app/(tabs)/index.tsx)
// transactions tablosundan hesaplanır; bu yüzden bir hesap seçildiğinde ödemeyle birlikte
// payments.transaction_id üzerinden ilişkili bir transaction da oluşturulur — aksi halde
// taksit "ödendi" görünür ama seçilen hesabın bakiyesi hiç değişmez.
export async function recordPayment({
  obligationDirection,
  obligationTitle,
  obligationCategoryId,
  obligationCounterpartyId,
  obligationCurrencyCode,
  ...input
}: RecordPaymentInput): Promise<Payment> {
  let transactionId: string | null = null;

  if (input.account_id) {
    const transactionInput: TablesInsert<'transactions'> = {
      workspace_id: input.workspace_id,
      account_id: input.account_id,
      direction: obligationDirection === 'payable' ? 'expense' : 'income',
      category_id: obligationCategoryId ?? null,
      counterparty_id: obligationCounterpartyId ?? null,
      amount_minor: input.amount_minor,
      currency_code: obligationCurrencyCode,
      description: obligationTitle,
      // payments.paid_at ile aynı tarih — verilmezse (ör. OCR'ın geçmiş taksitleri otomatik
      // "ödendi" işaretlemesi) DB varsayılanı (şimdi) kullanılır. Bu satır eksikti: transaction
      // her zaman "şimdi" tarihiyle oluşuyordu, payments.paid_at ise seçilen tarihi taşıyordu —
      // ikisi birbirinden sapıyor, Son Hareketler (occurred_at okur) yanlış tarih gösteriyordu.
      ...(input.paid_at ? { occurred_at: input.paid_at } : {}),
    };
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert(transactionInput)
      .select('id')
      .single();
    if (transactionError) throw transactionError;
    transactionId = transaction.id;
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({ ...input, transaction_id: transactionId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface RecordPastInstallmentPaymentInput {
  workspace_id: string;
  obligation_id: string;
  installment_id: string;
  amount_minor: number;
  paid_at: string;
  notes?: string | null;
}

// Belge onayında vadesi geçmiş taksitleri toplu "ödendi" işaretlemek için (bkz.
// app/documents/[id]/review.tsx). Bu yolda kasıtlı olarak hesap seçilmez — ödeme geçmiş
// tarihlidir ve mevcut hesap bakiyelerini etkilememelidir — bu yüzden recordPayment'ın
// transaction oluşturan dalına hiç girilmez ve tüm taksitler tek insert'te yazılabilir.
// Taksit başına ayrı çağrı, uzun kredi planlarında onay ekranını kilitliyordu.
export interface UpdatePaymentInput {
  amount_minor: number;
  paid_at: string;
  notes?: string | null;
  account_id?: string | null;
  obligationDirection: 'payable' | 'receivable';
  obligationTitle: string;
  obligationCategoryId?: string | null;
  obligationCounterpartyId?: string | null;
  obligationCurrencyCode: string;
}

// Bir ödeme düzenlendiğinde (tutar/tarih/hesap değişebilir) recordPayment'la aynı hesap
// bakiyesi tutarlılığı korunur: hesap seçiliyse ilişkili transaction da güncellenir,
// hesap kaldırılırsa eski transaction silinir, hesap yeni eklenirse yeni bir transaction
// oluşturulur — aksi halde ödeme kaydı ile hesap bakiyesi birbirinden sapar.
export async function updatePayment(payment: Payment, input: UpdatePaymentInput): Promise<Payment> {
  let transactionId = payment.transaction_id;

  if (input.account_id) {
    const transactionFields = {
      account_id: input.account_id,
      direction: input.obligationDirection === 'payable' ? 'expense' : 'income',
      category_id: input.obligationCategoryId ?? null,
      counterparty_id: input.obligationCounterpartyId ?? null,
      amount_minor: input.amount_minor,
      currency_code: input.obligationCurrencyCode,
      occurred_at: input.paid_at,
      description: input.obligationTitle,
    };

    if (transactionId) {
      const { error } = await supabase.from('transactions').update(transactionFields).eq('id', transactionId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ workspace_id: payment.workspace_id, ...transactionFields })
        .select('id')
        .single();
      if (error) throw error;
      transactionId = data.id;
    }
  } else if (transactionId) {
    const { error } = await supabase.from('transactions').delete().eq('id', transactionId);
    if (error) throw error;
    transactionId = null;
  }

  const { data, error } = await supabase
    .from('payments')
    .update({
      amount_minor: input.amount_minor,
      paid_at: input.paid_at,
      notes: input.notes ?? null,
      account_id: input.account_id ?? null,
      transaction_id: transactionId,
    })
    .eq('id', payment.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function recordPastInstallmentPayments(
  rows: RecordPastInstallmentPaymentInput[]
): Promise<Payment[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('payments')
    .insert(rows.map((row) => ({ ...row, account_id: null, transaction_id: null })))
    .select('*');
  if (error) throw error;
  return data;
}

// payments.transaction_id → transactions ON DELETE SET NULL'dır (cascade değil), yani
// yalnızca ödeme satırı silinirse ilişkili transaction öksüz kalır ve hesap bakiyesini
// etkilemeye devam eder. Bu yüzden hesap bağlantılı bir ödeme silinirken transaction da
// birlikte silinir.
export async function deletePayment(payment: Payment): Promise<void> {
  if (payment.transaction_id) {
    const { error: transactionError } = await supabase.from('transactions').delete().eq('id', payment.transaction_id);
    if (transactionError) throw transactionError;
  }
  const { error } = await supabase.from('payments').delete().eq('id', payment.id);
  if (error) throw error;
}
