import { markEndorsed } from '@/features/instruments/api';
import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';
import { createTransaction, createTransfer } from '@/features/transactions/api';
import { createInstallmentPlan, createObligation, type Obligation } from '@/features/obligations/api';
import { getValueUnit } from '@/features/valueUnits/units';

export type Payment = Tables<'payments'>;

// Hareket formundaki "ödeme yöntemi" etiketleriyle aynı değerler (transactions.payment_method)
// + çek/senet. Çek/senet anlık bir para hareketi değil, vadeli bir ödeme aracıdır — bkz.
// settleObligations.
export type SettlementMethod =
  | 'nakit'
  | 'havale'
  | 'kredi_karti'
  | 'online_odeme'
  | 'cek'
  | 'senet'
  | 'ciro'
  | 'mahsup';
export type InstrumentMethod = Extract<SettlementMethod, 'cek' | 'senet'>;

export function isInstrumentMethod(method: SettlementMethod): method is InstrumentMethod {
  return method === 'cek' || method === 'senet';
}

// Para hareketi olmadan kayıt kapatan yöntemler: çek/senet (para vadede hareket eder), ciro (alınmış
// çek verilir) ve mahsup (karşılıklı kayıtlar kapanır).
export function isCashlessMethod(method: SettlementMethod): boolean {
  return isInstrumentMethod(method) || method === 'ciro' || method === 'mahsup';
}

export const ADVANCE_DOCUMENT_TYPE = 'avans';

interface InstallmentSlice {
  installmentId: string | null;
  amountMinor: number;
}

// Taksitli bir kayda (senet, kredi, maaş, kira, taksitli fatura...) taksit belirtilmeden yapılan
// ödeme en eski açık taksitten başlayarak taksitlere dağıtılır. Önceden installment_id: null ile
// yazılıyordu: kaydın toplam kalanı düşüyor ama taksitler "ödenmedi" kalıyordu — takvim, "bu ay
// ödenecek" ve hatırlatmalar taksitten okuduğu için ödenmiş para hâlâ borç görünüyordu.
// Taksit planı yoksa (ya da hepsi kapanmışsa) ödeme kaydın kendisine yazılır. Açık taksitlerin
// toplamını aşan kısım son dilime eklenir (kalan tutar veritabanında 0'ın altına inmez).
async function planInstallmentSlices(obligationId: string, amountMinor: number): Promise<InstallmentSlice[]> {
  const { data, error } = await supabase
    .from('installments')
    .select('id, remaining_amount_minor')
    .eq('obligation_id', obligationId)
    .gt('remaining_amount_minor', 0)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true })
    .order('installment_number', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [{ installmentId: null, amountMinor }];

  const slices: InstallmentSlice[] = [];
  let unallocated = amountMinor;
  for (const installment of data) {
    if (unallocated <= 0) break;
    const applied = Math.min(unallocated, installment.remaining_amount_minor);
    slices.push({ installmentId: installment.id, amountMinor: applied });
    unallocated -= applied;
  }
  if (unallocated > 0) slices[slices.length - 1]!.amountMinor += unallocated;
  return slices;
}

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
  // Ödemeye bağlı dekont (financial_documents.id) — Plus'a özeldir, bkz. features/receipts/api.ts.
  receipt_document_id?: string | null;
  // Hesap seçildiyse hesabın bakiyesine yansısın diye ilişkili bir transaction
  // oluşturmak için gereken bağlam (bkz. accounts bakiyesi transactions'tan hesaplanır).
  obligationDirection: 'payable' | 'receivable';
  obligationTitle: string;
  obligationCategoryId?: string | null;
  obligationCounterpartyId?: string | null;
  obligationCurrencyCode: string;
  /** Oluşan hareketin ödeme yöntemi etiketi (transactions.payment_method). */
  paymentMethod?: string | null;
}

// docs/01-finansal-kayit-modeli.md §8 — kalan tutar ve durum, veritabanı trigger'larıyla
// (recompute_obligation_progress / recompute_installment_progress) otomatik güncellenir.
// Hesap bakiyeleri ise (bkz. features/reports/api.ts getAccountBalances, app/(tabs)/index.tsx)
// transactions tablosundan hesaplanır; bu yüzden bir hesap seçildiğinde ödemeyle birlikte
// payments.transaction_id üzerinden ilişkili bir transaction da oluşturulur — aksi halde
// taksit "ödendi" görünür ama seçilen hesabın bakiyesi hiç değişmez.
//
// installment_id verilmezse ödeme kaydın açık taksitlerine dağıtılır (bkz.
// planInstallmentSlices). Her dilim kendi payments + transaction çiftini alır — ödeme ile
// hareket arasındaki 1:1 ilişki korunur ki updatePayment/deletePayment tek satır üzerinden
// tutarlı çalışsın. Dönen değer ilk dilimdir; dekont (receipt_document_id) yalnızca ona bağlanır.
export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const slices: InstallmentSlice[] = input.installment_id
    ? [{ installmentId: input.installment_id, amountMinor: input.amount_minor }]
    : await planInstallmentSlices(input.obligation_id, input.amount_minor);

  let first: Payment | null = null;
  for (const [index, slice] of slices.entries()) {
    const payment = await insertPaymentWithTransaction({
      ...input,
      installment_id: slice.installmentId,
      amount_minor: slice.amountMinor,
      receipt_document_id: index === 0 ? (input.receipt_document_id ?? null) : null,
    });
    first ??= payment;
  }
  return first as Payment;
}

// Borçlanma/borç verme türleri: ödemelerinin anapara kısmı gelir ya da gider değildir
// (transactions.financing_minor, bkz. features/reports/api.ts profitAndLossMinor).
const FINANCING_DOCUMENT_TYPES = new Set(['kredi', 'nakit_avans', 'borc_verme']);

// Ödemenin anapara payı: taksitte anapara/faiz kırılımı varsa orantılı, yoksa tamamı (faiz
// bilinmiyorsa geri ödeme borç kapatma sayılır). Diğer türlerde 0 — tamamı gelir/giderdir.
async function computeFinancingMinor(
  obligationId: string,
  installmentId: string | null | undefined,
  amountMinor: number
): Promise<number> {
  const { data: obligation, error } = await supabase
    .from('obligations')
    .select('document_type')
    .eq('id', obligationId)
    .single();
  if (error) throw error;
  if (!FINANCING_DOCUMENT_TYPES.has(obligation.document_type)) return 0;
  if (installmentId) {
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('principal_minor, interest_minor')
      .eq('id', installmentId)
      .maybeSingle();
    if (installmentError) throw installmentError;
    const principal = installment?.principal_minor;
    const interest = installment?.interest_minor;
    if (principal != null && interest != null && principal + interest > 0) {
      return Math.min(amountMinor, Math.round((amountMinor * principal) / (principal + interest)));
    }
  }
  return amountMinor;
}

async function insertPaymentWithTransaction({
  obligationDirection,
  obligationTitle,
  obligationCategoryId,
  obligationCounterpartyId,
  obligationCurrencyCode,
  paymentMethod,
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
      financing_minor: await computeFinancingMinor(input.obligation_id, input.installment_id, input.amount_minor),
      currency_code: obligationCurrencyCode,
      payment_method: paymentMethod ?? null,
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
  /** undefined = mevcut dekont bağlantısı değişmez; null = dekontu ödemeden ayırır. */
  receipt_document_id?: string | null;
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
      financing_minor: payment.obligation_id
        ? await computeFinancingMinor(payment.obligation_id, payment.installment_id, input.amount_minor)
        : 0,
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
      ...(input.receipt_document_id !== undefined ? { receipt_document_id: input.receipt_document_id } : {}),
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

export interface RecordCardPaymentInput {
  workspaceId: string;
  cardAccountId: string;
  /** Ödemenin çıktığı kasa/banka/cüzdan hesabı — kredi kartı ve POS olamaz (bkz.
   * app/obligations/[id].tsx isCardStatementPayment ve components/finance/CardPaymentForm.tsx). */
  sourceAccountId: string;
  amountMinor: number;
  currencyCode: string;
  paidAt: string;
}

// Klasik kredi kartı mantığı: ödeme kaynak hesaptan karta TEK bir transferdir (limit hemen
// açılır, bkz. features/reports/api.ts getAccountBalances — kart borcu artık bu transferi
// gider gibi değil ödeme gibi okur). Kartın açık ekstireleri varsa (kredi_karti_ekstresi,
// en eski vadeden başlayarak) aynı tutar bunlara da payments satırı olarak dağıtılır —
// account_id/transaction bilgisi transferin kendisine işaret eder (account_id: null), böylece
// tek para hareketi kaydedilmiş olur ve ekstre "Kısmen/Tamamen Ödendi" durumuna otomatik
// (recompute_obligation_progress trigger'ı) geçer. Ekstre şartı yoktur — ödeme her zaman
// yapılabilir, fazlası yalnızca kart borcunu düşürür (avans ödeme).
export async function recordCardPayment({
  workspaceId,
  cardAccountId,
  sourceAccountId,
  amountMinor,
  currencyCode,
  paidAt,
}: RecordCardPaymentInput): Promise<void> {
  const transfer = await createTransfer({
    workspaceId,
    fromAccountId: sourceAccountId,
    toAccountId: cardAccountId,
    amountMinor,
    currencyCode,
    occurredAt: paidAt,
    description: 'Kredi kartı ödemesi',
  });

  const { data: openStatements, error } = await supabase
    .from('obligations')
    .select('id, remaining_amount_minor')
    .eq('workspace_id', workspaceId)
    .eq('account_id', cardAccountId)
    .eq('document_type', 'kredi_karti_ekstresi')
    .gt('remaining_amount_minor', 0)
    .order('due_date', { ascending: true });
  if (error) throw error;

  let unallocated = amountMinor;
  const rows: TablesInsert<'payments'>[] = [];
  for (const statement of openStatements ?? []) {
    if (unallocated <= 0) break;
    const applied = Math.min(unallocated, statement.remaining_amount_minor);
    rows.push({
      workspace_id: workspaceId,
      obligation_id: statement.id,
      amount_minor: applied,
      account_id: null,
      transaction_id: transfer.id,
      paid_at: paidAt,
    });
    unallocated -= applied;
  }

  if (rows.length > 0) {
    const { error: paymentsError } = await supabase.from('payments').insert(rows);
    if (paymentsError) throw paymentsError;
  }
}

// payments.transaction_id → transactions ON DELETE SET NULL'dır (cascade değil), yani
// yalnızca ödeme satırı silinirse ilişkili transaction öksüz kalır ve hesap bakiyesini
// etkilemeye devam eder. Bu yüzden hesap bağlantılı bir ödeme silinirken transaction da
// birlikte silinir.
//
// Kredi kartı ödemesinde tek bir transfer birden çok ekstreye dağıtılır (bkz. recordCardPayment) —
// aynı transaction'ı paylaşan tüm ödeme satırları birlikte silinir; aksi halde transfer silinir
// ama diğer ekstreler "ödendi" kalırdı.
export async function deletePayment(payment: Payment): Promise<void> {
  if (payment.transaction_id) {
    const { error: siblingsError } = await supabase
      .from('payments')
      .delete()
      .eq('transaction_id', payment.transaction_id);
    if (siblingsError) throw siblingsError;
    const { error: transactionError } = await supabase.from('transactions').delete().eq('id', payment.transaction_id);
    if (transactionError) throw transactionError;
  }
  const { error } = await supabase.from('payments').delete().eq('id', payment.id);
  if (error) throw error;
}

// --- Ödeme Yap / Tahsilat Al (bkz. app/payments/new.tsx) --------------------------------------

export interface SettlementTarget {
  id: string;
  title: string;
  direction: string;
  document_type?: string;
  category_id: string | null;
  counterparty_id: string | null;
  currency_code: string;
  remaining_amount_minor: number;
  counterparty?: { name: string } | null;
}

export interface SettlementAllocation<T extends SettlementTarget = SettlementTarget> {
  obligation: T;
  amountMinor: number;
}

// Tutar, kullanıcının seçtiği kayıtlara verilen sırayla (varsayılan: en eski vade önce) dağıtılır.
// Son kayıt kısmen kapanabilir; tutar hepsini kapatırsa artan kısım leftoverMinor olarak döner.
export function allocateAcrossObligations<T extends SettlementTarget>(
  amountMinor: number,
  targets: T[]
): { allocations: SettlementAllocation<T>[]; leftoverMinor: number } {
  let remainingMinor = amountMinor;
  const allocations: SettlementAllocation<T>[] = [];
  for (const obligation of targets) {
    if (remainingMinor <= 0) break;
    const take = Math.min(remainingMinor, obligation.remaining_amount_minor);
    if (take > 0) allocations.push({ obligation, amountMinor: take });
    remainingMinor -= take;
  }
  return { allocations, leftoverMinor: Math.max(remainingMinor, 0) };
}

export interface InstrumentDetails {
  title: string;
  /** Çekin bankası (yalnızca çekte). */
  bankCode: string | null;
  /** Çek/senet numarası. */
  documentNo: string | null;
  /** Vadede paranın çıkacağı/gireceği varsayılan hesap (isteğe bağlı). */
  accountId: string | null;
  /** En az bir vade; toplamı tutara eşit olmalı. Senette birden çok vade olabilir. */
  dueDates: { dueDate: string; amountMinor: number }[];
}

export interface SettleObligationsInput {
  workspaceId: string;
  direction: 'payable' | 'receivable';
  counterpartyId: string;
  counterpartyName: string | null;
  currencyCode: string;
  amountMinor: number;
  paidAt: string;
  method: SettlementMethod;
  targets: SettlementTarget[];
  /**
   * Mahsupta: bu cariyle ters yöndeki açık kayıtlar (ör. tedarikçiye yapılmış ön ödeme/avans).
   * Ciroda: portföydeki alınmış çek/senetler (başka carilerden olabilir); tamamı ciro edilir.
   */
  sources?: SettlementTarget[];
  /** Nakit/havale/kart/online yöntemlerinde zorunlu: paranın çıktığı/girdiği hesap. */
  accountId?: string | null;
  /** Artan tutar (ön ödeme/avans) hareketinin kategorisi. */
  categoryId?: string | null;
  description?: string | null;
  instrument?: InstrumentDetails | null;
}

export interface SettleObligationsResult {
  allocations: SettlementAllocation[];
  leftoverMinor: number;
  instrumentObligation: Obligation | null;
  /** Artan tutardan doğan avans kaydı (varsa). */
  advanceObligation: Obligation | null;
  /** Oluşan hareketler (dekont ilkine bağlanır). Çek/senet, mahsup ve ciroda boştur. */
  transactionIds: string[];
}

const INSTRUMENT_LABEL: Record<InstrumentMethod, string> = { cek: 'Çek', senet: 'Senet' };

// Ödeme Yap / Tahsilat Al. Yönteme göre:
//
// - Nakit / havale / kart / online: seçilen kayıtlar tutar kadar (kısmen de olabilir) kapanır ve
//   para seçilen hesaptan hemen çıkar/hesaba hemen girer (recordPayment → ilişkili transaction).
// - Çek / senet: para henüz hareket etmez. Seçilen kayıtlar tutar kadar kapanır (hesapsız payments
//   satırları, settled_by_obligation_id ile çek/senede bağlı) ve aynı tutarda vadeli bir çek/senet
//   kaydı açılır; para vadede o kayıt ödendiğinde/tahsil edildiğinde hareket eder. 30.000 fatura +
//   20.000 çek artık 50.000 değil, 10.000 fatura + 20.000 çek = 30.000 borç görünür.
// - Ciro: müşteriden alınmış çek/senet tedarikçiye verilir. Çek portföyden çıkar (alacak kapanır),
//   tedarikçinin faturası kapanır; hiçbir hesaptan para hareket etmez.
// - Mahsup: aynı cariyle ters yöndeki kayıtlar (ör. önceden yapılmış ön ödeme/avans) karşılıklı
//   kapatılır; para hareket etmez.
//
// Her yöntemde tutar seçilen kayıtları aşarsa artan kısım kaybolmaz: cariye ters yönde bir avans
// kaydı olarak yazılır (ödemede "tedarikçiden alacak", tahsilatta "müşteriye borç") ve cari
// bakiyesine girer; sonraki faturadan Mahsup ile düşülür.
export async function settleObligations(input: SettleObligationsInput): Promise<SettleObligationsResult> {
  if (input.method === 'ciro') return settleByEndorsement(input);
  if (input.method === 'mahsup') return settleByOffset(input);

  const { allocations, leftoverMinor } = allocateAcrossObligations(input.amountMinor, input.targets);

  if (isInstrumentMethod(input.method)) {
    const instrumentObligation = await createInstrumentObligation({
      workspaceId: input.workspaceId,
      direction: input.direction,
      method: input.method,
      counterpartyId: input.counterpartyId,
      currencyCode: input.currencyCode,
      amountMinor: input.amountMinor,
      categoryId: input.categoryId ?? null,
      instrument: input.instrument ?? null,
    });
    let advanceObligation: Obligation | null = null;
    try {
      await settleWithInstrument({
        workspaceId: input.workspaceId,
        instrumentObligationId: instrumentObligation.id,
        method: input.method,
        direction: input.direction,
        documentNo: input.instrument?.documentNo ?? null,
        paidAt: input.paidAt,
        allocations,
      });
      // Çek/senet seçilen kayıtlardan büyükse karşı taraf aradaki fark kadar bize borçlanır
      // (ödemede) ya da biz ona (tahsilatta). Para çek vadesinde hareket edeceği için avansın
      // hareketi yoktur; çek/senet silinirse avans da silinir (parent_obligation_id).
      if (leftoverMinor > 0) {
        advanceObligation = await createAdvanceObligation({
          workspaceId: input.workspaceId,
          settlementDirection: input.direction,
          counterpartyId: input.counterpartyId,
          counterpartyName: input.counterpartyName,
          currencyCode: input.currencyCode,
          amountMinor: leftoverMinor,
          parentObligationId: instrumentObligation.id,
          note: `${INSTRUMENT_LABEL[input.method]} fazlası`,
        });
      }
    } catch (error) {
      // Fatura kapatılamadıysa yarım kalmış bir çek/senet bırakılmaz (aksi halde borç yine
      // ikiye katlanırdı) — kayıt geri alınır ve hata kullanıcıya iletilir.
      await supabase.from('obligations').delete().eq('id', instrumentObligation.id);
      throw error;
    }
    return { allocations, leftoverMinor, instrumentObligation, advanceObligation, transactionIds: [] };
  }

  if (!input.accountId) throw new Error('Hesap seçin');
  const transactionIds: string[] = [];
  for (const allocation of allocations) {
    const payment = await recordPayment({
      workspace_id: input.workspaceId,
      obligation_id: allocation.obligation.id,
      installment_id: null,
      account_id: input.accountId,
      amount_minor: allocation.amountMinor,
      paid_at: input.paidAt,
      obligationDirection: input.direction,
      obligationTitle: allocation.obligation.title,
      obligationCategoryId: allocation.obligation.category_id,
      obligationCounterpartyId: allocation.obligation.counterparty_id ?? input.counterpartyId,
      obligationCurrencyCode: allocation.obligation.currency_code,
      paymentMethod: input.method,
    });
    if (payment.transaction_id) transactionIds.push(payment.transaction_id);
  }

  let advanceObligation: Obligation | null = null;
  if (leftoverMinor > 0) {
    // Artan para gerçekten hesaptan çıktı/hesaba girdi: hareket yazılır ve avans kaydına bağlanır
    // (source_obligation_id — avans silinirse hareket de silinir, bkz. transactions FK).
    advanceObligation = await createAdvanceObligation({
      workspaceId: input.workspaceId,
      settlementDirection: input.direction,
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      currencyCode: input.currencyCode,
      amountMinor: leftoverMinor,
      parentObligationId: null,
      note: input.description?.trim() || null,
    });
    const created = await createTransaction({
      workspace_id: input.workspaceId,
      account_id: input.accountId,
      direction: input.direction === 'payable' ? 'expense' : 'income',
      category_id: input.categoryId ?? null,
      counterparty_id: input.counterpartyId,
      payment_method: input.method,
      amount_minor: leftoverMinor,
      currency_code: input.currencyCode,
      occurred_at: input.paidAt,
      description: advanceObligation.title,
      source_obligation_id: advanceObligation.id,
    });
    transactionIds.push(created.id);
  }

  return { allocations, leftoverMinor, instrumentObligation: null, advanceObligation, transactionIds };
}

interface CreateAdvanceObligationInput {
  workspaceId: string;
  /** Ödemenin yönü: ödemede fazlası tedarikçiden alacak, tahsilatta fazlası müşteriye borçtur. */
  settlementDirection: 'payable' | 'receivable';
  counterpartyId: string;
  counterpartyName: string | null;
  currencyCode: string;
  amountMinor: number;
  parentObligationId: string | null;
  note: string | null;
}

// Ön ödeme / alınan avans kaydı (document_type 'avans'). Vadesi yoktur — gecikmiş/bu ay ödenecek
// hesaplarına ve hatırlatmalara girmez (bkz. features/obligations/api.ts getDueBreakdown), yalnızca
// cari bakiyesine girer ve sonraki faturadan Mahsup ile düşülür.
async function createAdvanceObligation({
  workspaceId,
  settlementDirection,
  counterpartyId,
  counterpartyName,
  currencyCode,
  amountMinor,
  parentObligationId,
  note,
}: CreateAdvanceObligationInput): Promise<Obligation> {
  const isPrepayment = settlementDirection === 'payable';
  const label = isPrepayment ? 'Ön ödeme' : 'Alınan avans';
  return createObligation({
    workspace_id: workspaceId,
    direction: isPrepayment ? 'receivable' : 'payable',
    document_type: ADVANCE_DOCUMENT_TYPE,
    title: counterpartyName ? `${label} — ${counterpartyName}` : label,
    total_amount_minor: amountMinor,
    currency_code: currencyCode,
    value_unit_type: getValueUnit(currencyCode).unitType,
    due_date: null,
    counterparty_id: counterpartyId,
    notes: note,
    parent_obligation_id: parentObligationId,
  });
}

interface OffsetPair {
  source: SettlementTarget;
  target: SettlementTarget;
  amountMinor: number;
}

// Kaynak ve hedef dağılımlarını sırayla eşleştirir (iki işaretçi): her çift, kaynaktan ne kadarın
// hangi hedefi kapattığını söyler.
function pairAllocations(
  sources: SettlementAllocation[],
  targets: SettlementAllocation[]
): OffsetPair[] {
  const pairs: OffsetPair[] = [];
  const sourceLeft = sources.map((s) => s.amountMinor);
  const targetLeft = targets.map((t) => t.amountMinor);
  let si = 0;
  let ti = 0;
  while (si < sources.length && ti < targets.length) {
    const take = Math.min(sourceLeft[si]!, targetLeft[ti]!);
    if (take > 0) pairs.push({ source: sources[si]!.obligation, target: targets[ti]!.obligation, amountMinor: take });
    sourceLeft[si]! -= take;
    targetLeft[ti]! -= take;
    if (sourceLeft[si]! <= 0) si += 1;
    if (targetLeft[ti]! <= 0) ti += 1;
  }
  return pairs;
}

// Bir çiftin iki kaydını karşılıklı kapatır: her iki tarafa hesapsız/transaction'sız birer ödeme
// satırı, settled_by_obligation_id ile birbirine bağlı. Kayıtlardan biri silinirse karşı taraftaki
// satır da silinir ve o kayıt yeniden açılır (obligations_delete_settlement_payments). Aynı kayda
// düşen çiftlerin taksit dağılımı güncel kalana göre hesaplansın diye çift çift yazılır.
async function writeOffsetPair(
  workspaceId: string,
  pair: OffsetPair,
  paidAt: string,
  notes: { onSource: string; onTarget: string }
): Promise<void> {
  const rows: TablesInsert<'payments'>[] = [];
  for (const [obligation, counter, note] of [
    [pair.target, pair.source, notes.onTarget],
    [pair.source, pair.target, notes.onSource],
  ] as const) {
    const slices = await planInstallmentSlices(obligation.id, pair.amountMinor);
    for (const slice of slices) {
      rows.push({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        installment_id: slice.installmentId,
        amount_minor: slice.amountMinor,
        paid_at: paidAt,
        account_id: null,
        transaction_id: null,
        settled_by_obligation_id: counter.id,
        notes: note,
      });
    }
  }
  const { error } = await supabase.from('payments').insert(rows);
  if (error) throw error;
}

// Mahsup: aynı carinin ters yöndeki açık kayıtları (ör. ön ödeme/avans ↔ yeni fatura, ya da hem
// müşteri hem tedarikçi olan bir firmanın alacağı ↔ borcu) tutar kadar karşılıklı kapanır.
async function settleByOffset(input: SettleObligationsInput): Promise<SettleObligationsResult> {
  const sources = input.sources ?? [];
  const sourceTotal = sources.reduce((sum, s) => sum + s.remaining_amount_minor, 0);
  const targetTotal = input.targets.reduce((sum, t) => sum + t.remaining_amount_minor, 0);
  const amountMinor = Math.min(input.amountMinor, sourceTotal, targetTotal);
  if (amountMinor <= 0) throw new Error('Mahsup edilecek kayıt seçin');

  const { allocations } = allocateAcrossObligations(amountMinor, input.targets);
  const { allocations: sourceAllocations } = allocateAcrossObligations(amountMinor, sources);
  for (const pair of pairAllocations(sourceAllocations, allocations)) {
    await writeOffsetPair(input.workspaceId, pair, input.paidAt, {
      onSource: `Mahsup edildi: ${pair.target.title}`,
      onTarget: `Mahsup edildi: ${pair.source.title}`,
    });
  }
  return {
    allocations,
    leftoverMinor: 0,
    instrumentObligation: null,
    advanceObligation: null,
    transactionIds: [],
  };
}

// Ciro: portföydeki alınmış çek/senetler (müşteri A'dan) tedarikçi B'ye verilir. Çekler tam tutarıyla
// ciro edilir: seçilen faturalar kapanır, çeklerin alacağı kapanır (A'nın borcu tahsil edilmiş sayılır),
// hiçbir hesaptan para hareket etmez. Çek toplamı faturaları aşarsa fark B'den alacak (avans) olur.
async function settleByEndorsement(input: SettleObligationsInput): Promise<SettleObligationsResult> {
  if (input.direction !== 'payable') throw new Error('Çek ciro yalnızca ödemede kullanılır');
  const sources = input.sources ?? [];
  const chequeTotal = sources.reduce((sum, s) => sum + s.remaining_amount_minor, 0);
  if (chequeTotal <= 0) throw new Error('Ciro edilecek çek/senet seçin');

  const { allocations, leftoverMinor } = allocateAcrossObligations(chequeTotal, input.targets);
  const sourceAllocations: SettlementAllocation[] = sources.map((s) => ({
    obligation: s,
    amountMinor: s.remaining_amount_minor,
  }));

  const targetName = input.counterpartyName ?? 'cari';
  const pairs = pairAllocations(sourceAllocations, allocations);
  for (const pair of pairs) {
    await writeOffsetPair(input.workspaceId, pair, input.paidAt, {
      onSource: `Ciro edildi → ${targetName} (${pair.target.title})`,
      onTarget: `Ciro ile ödendi: ${pair.source.title}${pair.source.counterparty?.name ? ` (${pair.source.counterparty.name})` : ''}`,
    });
  }

  let advanceObligation: Obligation | null = null;
  if (leftoverMinor > 0) {
    // Faturaları aşan çek tutarı: B'den alacak. Çeklerin kalan kısmı bu avansla kapanır ki çekler
    // portföyde yarım kalmasın; avans silinirse o kısım portföye geri döner.
    advanceObligation = await createAdvanceObligation({
      workspaceId: input.workspaceId,
      settlementDirection: 'payable',
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      currencyCode: input.currencyCode,
      amountMinor: leftoverMinor,
      parentObligationId: null,
      note: 'Ciro edilen çek/senet fazlası',
    });
    const usedBySource = new Map<string, number>();
    for (const pair of pairs) usedBySource.set(pair.source.id, (usedBySource.get(pair.source.id) ?? 0) + pair.amountMinor);
    for (const source of sources) {
      const rest = source.remaining_amount_minor - (usedBySource.get(source.id) ?? 0);
      if (rest <= 0) continue;
      const slices = await planInstallmentSlices(source.id, rest);
      const { error } = await supabase.from('payments').insert(
        slices.map((slice) => ({
          workspace_id: input.workspaceId,
          obligation_id: source.id,
          installment_id: slice.installmentId,
          amount_minor: slice.amountMinor,
          paid_at: input.paidAt,
          account_id: null,
          transaction_id: null,
          settled_by_obligation_id: advanceObligation!.id,
          notes: `Ciro edildi → ${targetName} (fazlası alacak)`,
        }))
      );
      if (error) throw error;
    }
  }

  // Çek/senetler portföyden çıktı: yaşam döngüsü durumu ciro edildi (tetikleyici kapanış durumunu ezmez).
  await markEndorsed(sources.map((s) => s.id));

  return { allocations, leftoverMinor, instrumentObligation: null, advanceObligation, transactionIds: [] };
}

interface CreateInstrumentObligationInput {
  workspaceId: string;
  direction: 'payable' | 'receivable';
  method: InstrumentMethod;
  counterpartyId: string | null;
  currencyCode: string;
  amountMinor: number;
  categoryId: string | null;
  instrument: InstrumentDetails | null;
}

async function createInstrumentObligation({
  workspaceId,
  direction,
  method,
  counterpartyId,
  currencyCode,
  amountMinor,
  categoryId,
  instrument,
}: CreateInstrumentObligationInput): Promise<Obligation> {
  if (!instrument || instrument.dueDates.length === 0) throw new Error('Vade tarihi girin');
  const dueSum = instrument.dueDates.reduce((sum, row) => sum + row.amountMinor, 0);
  if (dueSum !== amountMinor) throw new Error('Vade tutarlarının toplamı, toplam tutara eşit olmalı');

  const label = INSTRUMENT_LABEL[method];
  const sortedDueDates = [...instrument.dueDates].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const documentNo = instrument.documentNo?.trim() || null;
  const obligation = await createObligation({
    workspace_id: workspaceId,
    direction,
    document_type: method,
    title: instrument.title.trim() || label,
    total_amount_minor: amountMinor,
    currency_code: currencyCode,
    value_unit_type: getValueUnit(currencyCode).unitType,
    due_date: sortedDueDates[0]!.dueDate,
    counterparty_id: counterpartyId,
    account_id: instrument.accountId,
    category_id: categoryId,
    bank_code: method === 'cek' ? instrument.bankCode : null,
    notes: documentNo ? `${label} no: ${documentNo}` : null,
  });

  if (sortedDueDates.length > 1) {
    try {
      await createInstallmentPlan({
        workspaceId,
        obligationId: obligation.id,
        totalAmountMinor: amountMinor,
        installments: sortedDueDates.map((row, index) => ({
          installmentNumber: index + 1,
          dueDate: row.dueDate,
          amountMinor: row.amountMinor,
        })),
      });
    } catch (error) {
      await supabase.from('obligations').delete().eq('id', obligation.id);
      throw error;
    }
  }
  return obligation;
}

export interface SettleWithInstrumentInput {
  workspaceId: string;
  instrumentObligationId: string;
  method: InstrumentMethod;
  direction: 'payable' | 'receivable';
  documentNo: string | null;
  paidAt: string;
  allocations: SettlementAllocation[];
}

// Mevcut bir çek/senet kaydıyla seçilen kayıtları kapatır — hesapsız, transaction'sız ödeme
// satırları; para çek/senet vadesinde hareket eder. settleObligations'ın yanı sıra OCR onayında
// ("bu çek hangi faturanın karşılığı?", bkz. app/documents/[id]/review.tsx) da kullanılır.
export async function settleWithInstrument({
  workspaceId,
  instrumentObligationId,
  method,
  direction,
  documentNo,
  paidAt,
  allocations,
}: SettleWithInstrumentInput): Promise<void> {
  const label = INSTRUMENT_LABEL[method];
  const verb = direction === 'payable' ? 'ödendi' : 'tahsil edildi';
  const trimmedNo = documentNo?.trim() || null;
  const note = `${label} ile ${verb}${trimmedNo ? ` (No: ${trimmedNo})` : ''}`;

  const rows: TablesInsert<'payments'>[] = [];
  for (const allocation of allocations) {
    const slices = await planInstallmentSlices(allocation.obligation.id, allocation.amountMinor);
    for (const slice of slices) {
      rows.push({
        workspace_id: workspaceId,
        obligation_id: allocation.obligation.id,
        installment_id: slice.installmentId,
        amount_minor: slice.amountMinor,
        paid_at: paidAt,
        account_id: null,
        transaction_id: null,
        settled_by_obligation_id: instrumentObligationId,
        notes: note,
      });
    }
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from('payments').insert(rows);
  if (error) throw error;
}

export interface SettledObligationRef {
  obligationId: string;
  title: string;
  amountMinor: number;
}

// Bir çek/senedin (ya da mahsup/ciro edilen bir kaydın) hangi kayıtları kapattığı — detay
// ekranında "Karşılığı" satırı için.
export async function listObligationsSettledBy(instrumentObligationId: string): Promise<SettledObligationRef[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount_minor, obligation:obligations(id, title)')
    .eq('settled_by_obligation_id', instrumentObligationId);
  if (error) throw error;
  const byObligation = new Map<string, SettledObligationRef>();
  for (const row of (data ?? []) as unknown as { amount_minor: number; obligation: { id: string; title: string } | null }[]) {
    if (!row.obligation) continue;
    const current = byObligation.get(row.obligation.id) ?? {
      obligationId: row.obligation.id,
      title: row.obligation.title,
      amountMinor: 0,
    };
    current.amountMinor += row.amount_minor;
    byObligation.set(row.obligation.id, current);
  }
  return Array.from(byObligation.values());
}
