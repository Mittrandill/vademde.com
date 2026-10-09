import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';
import { createInstallmentPlan, createObligation, type Obligation } from '@/features/obligations/api';
import { getValueUnit } from '@/features/valueUnits/units';
import { formatValueUnitAmount } from '@/utils/money';

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


// Kalan borcu aşan ödeme reddedilir: fazlası eskiden son taksite eklenip kalan 0'a kırpıldığı için
// kayıt "ödendi" görünürken fazla tutar hiçbir yerde görünmeden kayboluyordu. Fazla tutar için
// Ödeme Yap/Tahsilat Al akışı (avans) kullanılır. `releaseMinor`: düzenlenen ödemenin mevcut tutarı.
async function assertWithinRemaining(
  obligationId: string,
  installmentId: string | null | undefined,
  amountMinor: number,
  releaseMinor = 0
): Promise<void> {
  if (amountMinor <= 0) throw new Error('Tutar sıfırdan büyük olmalı');
  const { data: obligation, error } = await supabase
    .from('obligations')
    .select('remaining_amount_minor, currency_code')
    .eq('id', obligationId)
    .single();
  if (error) throw error;
  let remainingMinor = obligation.remaining_amount_minor;
  if (installmentId) {
    const { data: installment, error: installmentError } = await supabase
      .from('installments')
      .select('remaining_amount_minor')
      .eq('id', installmentId)
      .single();
    if (installmentError) throw installmentError;
    remainingMinor = installment.remaining_amount_minor;
  }
  const allowedMinor = remainingMinor + releaseMinor;
  if (amountMinor > allowedMinor) {
    throw new Error(
      `Tutar kalan borcu aşıyor (en fazla ${formatValueUnitAmount(allowedMinor, obligation.currency_code)}). Fazla tutar için Ödeme yap / Tahsilat al ekranını kullanın.`
    );
  }
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
  /** Döviz/altın ödemede işlem kuru (kuruş/birim); boşsa DB trigger'ı güncel kuru yazar. */
  fx_rate_try_minor?: number | null;
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
async function buildPaymentItems(input: RecordPaymentInput) {
  await assertWithinRemaining(input.obligation_id, input.installment_id, input.amount_minor);
  const slices: InstallmentSlice[] = input.installment_id
    ? [{ installmentId: input.installment_id, amountMinor: input.amount_minor }]
    : await planInstallmentSlices(input.obligation_id, input.amount_minor);

  return Promise.all(
    slices.map(async (slice, index) => ({
      transaction: input.account_id
        ? {
            workspace_id: input.workspace_id,
            account_id: input.account_id,
            direction: input.obligationDirection === 'payable' ? 'expense' : 'income',
            category_id: input.obligationCategoryId ?? null,
            counterparty_id: input.obligationCounterpartyId ?? null,
            amount_minor: slice.amountMinor,
            financing_minor: await computeFinancingMinor(input.obligation_id, slice.installmentId, slice.amountMinor),
            currency_code: input.obligationCurrencyCode,
            fx_rate_try_minor: input.fx_rate_try_minor ?? null,
            payment_method: input.paymentMethod ?? null,
            description: input.obligationTitle,
            // payments.paid_at ile aynı tarih — verilmezse DB varsayılanı (şimdi) kullanılır.
            occurred_at: input.paid_at ?? null,
          }
        : null,
      payment: {
        workspace_id: input.workspace_id,
        obligation_id: input.obligation_id,
        installment_id: slice.installmentId,
        account_id: input.account_id ?? null,
        amount_minor: slice.amountMinor,
        paid_at: input.paid_at ?? null,
        notes: input.notes ?? null,
        // Dekont (receipt_document_id) yalnızca ilk dilime bağlanır.
        receipt_document_id: index === 0 ? (input.receipt_document_id ?? null) : null,
        fx_rate_try_minor: input.fx_rate_try_minor ?? null,
      },
    }))
  );
}

// Tüm kayıtların tüm dilimleri (ödeme + varsa hesap hareketi) tek veritabanı işleminde yazılır
// (record_payments): bir adım düşerse hiçbiri kalmaz — yetim hareket ya da yarım dağıtılmış ödeme
// oluşmaz. Birden çok kayda dağıtılan ödemede de kayıtlar arası bütünlük bu sayede korunur.
async function recordPaymentsBatch(inputs: RecordPaymentInput[]): Promise<Payment[]> {
  const items = (await Promise.all(inputs.map(buildPaymentItems))).flat();
  if (items.length === 0) return [];
  const { data, error } = await supabase.rpc('record_payments_v2' as never, { p_items: items } as never);
  if (error) throw error;
  return (data ?? []) as unknown as Payment[];
}

export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const created = await recordPaymentsBatch([input]);
  if (created.length === 0) throw new Error('Ödeme kaydedilemedi');
  return created[0];
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
  if (payment.settled_by_obligation_id) throw new Error('Mahsup/ciro/çek ile kapanış tek ödeme olarak düzenlenemez; bağlı işlem üzerinden yönetilmeli');
  if (payment.obligation_id) {
    await assertWithinRemaining(payment.obligation_id, payment.installment_id, input.amount_minor, payment.amount_minor);
  }
  const transactionFields = input.account_id
    ? {
      account_id: input.account_id,
      direction: input.obligationDirection === 'payable' ? 'expense' : 'income',
      category_id: input.obligationCategoryId ?? null,
      counterparty_id: input.obligationCounterpartyId ?? null,
      amount_minor: input.amount_minor,
      financing_minor: payment.obligation_id
        ? await computeFinancingMinor(payment.obligation_id, payment.installment_id, input.amount_minor)
        : 0,
      currency_code: input.obligationCurrencyCode,
      fx_rate_try_minor: payment.fx_rate_try_minor,
      occurred_at: input.paid_at,
      description: input.obligationTitle,
      }
    : null;

  // Do not fall back to separate writes if the migration is not deployed yet.
  // A missing RPC is safer than leaving a half-updated financial transaction.
  const { data, error } = await supabase.rpc('update_payment_atomic' as never, {
    p_payment_id: payment.id,
    p_expected_amount_minor: payment.amount_minor,
    p_expected_paid_at: payment.paid_at,
    p_patch: {
      amount_minor: input.amount_minor,
      paid_at: input.paid_at,
      notes: input.notes ?? null,
      account_id: input.account_id ?? null,
      ...(input.receipt_document_id !== undefined ? { receipt_document_id: input.receipt_document_id } : {}),
    },
    p_transaction: transactionFields,
  } as never).single();
  if (error) throw error;
  return data as unknown as Payment;
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
  /** Kuyruk sahibi; sunucu mevcut oturumla aynı kullanıcı olduğunu doğrular. */
  actorId: string;
  /** Aynı gönderimin yeniden denemelerinde korunur; farklı işlem için yeni UUID gerekir. */
  requestId: string;
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
export async function recordCardPayment(input: RecordCardPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('record_card_payment_owned' as never, {
    p_expected_actor: input.actorId,
    p_request_id: input.requestId,
    p_workspace_id: input.workspaceId,
    p_card_account_id: input.cardAccountId,
    p_source_account_id: input.sourceAccountId,
    p_amount_minor: input.amountMinor,
    p_currency_code: input.currencyCode,
    p_paid_at: input.paidAt,
  } as never);
  if (error) throw error;
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
  if (payment.settled_by_obligation_id) throw new Error('Mahsup/ciro/çek ile kapanış tek ödeme olarak silinemez; bağlı işlem üzerinden geri alınmalı');
  const { error } = await supabase.rpc('delete_payment_atomic' as never, {
    p_payment_id: payment.id,
    p_expected_amount_minor: payment.amount_minor,
    p_expected_paid_at: payment.paid_at,
  } as never);
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
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error('Dağıtılacak tutar geçersiz');
  }
  const ids = new Set<string>();
  // Validate the entire selection, including rows beyond the amount's allocation boundary.
  // A negative balance would otherwise increase the remaining amount and inflate the advance.
  for (const obligation of targets) {
    if (ids.has(obligation.id)) throw new Error('Aynı kayıt birden fazla seçilemez');
    ids.add(obligation.id);
    if (!Number.isSafeInteger(obligation.remaining_amount_minor) || obligation.remaining_amount_minor < 0) {
      throw new Error('Kayıt kalan tutarı geçersiz; kayıtları yenileyin');
    }
  }
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
  /** Durable cash queue only: preserve original payment slices across retries. */
  cashPayload?: PreparedCashSettlement;
  /** Mahsup ve anlık ödemede zorunlu; özgün içerikle birlikte kalıcı kuyrukta korunur. */
  requestId?: string;
  actorId?: string;
  workspaceId: string;
  direction: 'payable' | 'receivable';
  counterpartyId: string;
  counterpartyName: string | null;
  currencyCode: string;
  amountMinor: number;
  paidAt: string;
  /** Döviz/altın ödemede işlem kuru (kuruş/birim). Boşsa veritabanı trigger'ı güncel kuru yazar. */
  fxRateTryMinor?: number | null;
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
  /** Ciro fazlası birden çok çekten geldiyse her kaynağın ayrı avansı. */
  advanceObligations?: Obligation[];
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
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Ödeme/tahsilat tutarı pozitif ve geçerli olmalı');
  }
  // Preview permits zero; committing does not. All methods share the same preflight,
  // including endorsements which calculate their actual amount from the selected sources.
  allocateAcrossObligations(0, input.targets);
  allocateAcrossObligations(0, input.sources ?? []);
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

  if (!input.requestId || !input.actorId || !input.cashPayload) throw new Error('Ödeme kalıcı işlem kuyruğundan gönderilmeli');
  validatePreparedCash(input);
  const payload = input.cashPayload;
  const { data, error } = await supabase.rpc('settle_cash_atomic' as never, {
    p_expected_actor: input.actorId, p_request_id: input.requestId, p_workspace_id: input.workspaceId,
    p_header: payload.header, p_items: payload.items, p_expected: payload.expected,
  } as never);
  if (error) throw error;
  const receipt = data as unknown as { payments?: Payment[]; leftover_minor?: number; advance_obligation?: Obligation | null; transaction_ids?: string[] } | null;
  const advance = receipt?.advance_obligation;
  if (!Array.isArray(receipt?.payments) || receipt.payments.length !== payload.items.length
    || receipt.payments.some((p, index) => typeof p.id !== 'string' || !p.id || p.workspace_id !== input.workspaceId
      || p.transaction_id !== receipt.transaction_ids?.[index] || p.obligation_id !== payload.items[index].payment.obligation_id
      || (p.installment_id ?? null) !== payload.items[index].payment.installment_id || p.amount_minor !== payload.items[index].payment.amount_minor)
    || receipt.leftover_minor !== leftoverMinor || !Array.isArray(receipt.transaction_ids)
    || receipt.transaction_ids.length !== payload.items.length + (leftoverMinor > 0 ? 1 : 0)
    || receipt.transaction_ids.some((id) => typeof id !== 'string' || !id)
    || (leftoverMinor === 0 ? advance !== null : !advance || !advance.id || advance.document_type !== 'avans'
      || advance.workspace_id !== input.workspaceId || advance.counterparty_id !== input.counterpartyId
      || advance.currency_code !== input.currencyCode || advance.total_amount_minor !== leftoverMinor
      || advance.direction !== (input.direction === 'payable' ? 'receivable' : 'payable'))) {
    throw new Error('Ödeme makbuzu doğrulanamadı; aynı işlem kimliğiyle tekrar kontrol edin');
  }
  return { allocations, leftoverMinor, instrumentObligation: null, advanceObligation: advance ?? null, transactionIds: receipt.transaction_ids };
}

export interface PreparedCashSettlement {
  header: ReturnType<typeof cashHeader>;
  items: Awaited<ReturnType<typeof buildPaymentItems>>;
  expected: { id: string; remaining_amount_minor: number }[];
}
function cashHeader(input: SettleObligationsInput) {
  return { account_id: input.accountId!, counterparty_id: input.counterpartyId, currency_code: input.currencyCode,
    value_unit_type: getValueUnit(input.currencyCode).unitType, amount_minor: input.amountMinor,
    direction: input.direction, method: input.method, paid_at: input.paidAt,
    fx_rate_try_minor: input.fxRateTryMinor ?? null, category_id: input.categoryId ?? null, description: input.description?.trim() || null };
}
export function validateCashDraft(input: SettleObligationsInput) {
  if (!input || !['nakit', 'havale', 'kredi_karti', 'online_odeme'].includes(input.method)
    || !['payable', 'receivable'].includes(input.direction) || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
    || [input.workspaceId, input.counterpartyId, input.accountId, input.currencyCode].some((x) => typeof x !== 'string' || !x)
    || typeof input.paidAt !== 'string' || !Number.isFinite(Date.parse(input.paidAt)) || !Array.isArray(input.targets)
    || (input.fxRateTryMinor != null && (!Number.isSafeInteger(input.fxRateTryMinor) || input.fxRateTryMinor <= 0))) {
    throw new Error('Ödeme hesabı, tutarı, birimi veya tarihi geçersiz');
  }
  allocateAcrossObligations(0, input.targets);
  if (input.targets.some((o) => o.direction !== input.direction || o.currency_code !== input.currencyCode
    || o.counterparty_id !== input.counterpartyId || o.document_type === 'kredi_karti_ekstresi')) {
    throw new Error('Ödeme seçimlerinin cari, yön veya birimi uyuşmuyor');
  }
}
export async function prepareCashSettlement(input: SettleObligationsInput): Promise<PreparedCashSettlement> {
  validateCashDraft(input);
  const { allocations } = allocateAcrossObligations(input.amountMinor, input.targets);
  const items = (await Promise.all(allocations.map((a) => buildPaymentItems({
    workspace_id: input.workspaceId, obligation_id: a.obligation.id, account_id: input.accountId!,
    amount_minor: a.amountMinor, paid_at: input.paidAt, obligationDirection: input.direction,
    obligationTitle: a.obligation.title, obligationCategoryId: a.obligation.category_id,
    obligationCounterpartyId: input.counterpartyId, obligationCurrencyCode: input.currencyCode,
    paymentMethod: input.method, fx_rate_try_minor: input.fxRateTryMinor ?? null,
  })))).flat();
  return { header: cashHeader(input), items, expected: allocations.map((a) => ({ id: a.obligation.id, remaining_amount_minor: a.obligation.remaining_amount_minor })) };
}
export function validatePreparedCash(input: SettleObligationsInput) {
  validateCashDraft(input);
  const payload = input.cashPayload;
  const { allocations } = allocateAcrossObligations(input.amountMinor, input.targets);
  if (!payload || JSON.stringify(payload.header) !== JSON.stringify(cashHeader(input)) || !Array.isArray(payload.items)
    || JSON.stringify(payload.expected) !== JSON.stringify(allocations.map((a) => ({ id: a.obligation.id, remaining_amount_minor: a.obligation.remaining_amount_minor })))) {
    throw new Error('Saklanan ödeme dağılımı geçersiz');
  }
  const sums = new Map<string, number>();
  for (const { payment: p, transaction: t } of payload.items) {
    if (!p || !t || !Number.isSafeInteger(p.amount_minor) || p.amount_minor <= 0 || !p.obligation_id
      || !allocations.some((a) => a.obligation.id === p.obligation_id) || p.workspace_id !== input.workspaceId
      || t.workspace_id !== input.workspaceId || p.account_id !== input.accountId || t.account_id !== input.accountId
      || t.counterparty_id !== input.counterpartyId || t.currency_code !== input.currencyCode || t.payment_method !== input.method
      || p.paid_at !== input.paidAt || t.direction !== (input.direction === 'payable' ? 'expense' : 'income')
      || t.amount_minor !== p.amount_minor || p.fx_rate_try_minor !== (input.fxRateTryMinor ?? null)
      || t.fx_rate_try_minor !== (input.fxRateTryMinor ?? null)) throw new Error('Saklanan ödeme dilimi geçersiz');
    sums.set(p.obligation_id, (sums.get(p.obligation_id) ?? 0) + p.amount_minor);
  }
  if (allocations.some((a) => sums.get(a.obligation.id) !== a.amountMinor)) throw new Error('Saklanan ödeme toplamı uyuşmuyor');
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

// Mahsup: aynı carinin ters yöndeki açık kayıtları (ör. ön ödeme/avans ↔ yeni fatura, ya da hem
// müşteri hem tedarikçi olan bir firmanın alacağı ↔ borcu) tutar kadar karşılıklı kapanır.
async function settleByOffset(input: SettleObligationsInput): Promise<SettleObligationsResult> {
  if (!input.requestId || !input.actorId) throw new Error('Mahsup işlem kimliği ve kullanıcı bilgisi eksik');
  const sources = input.sources ?? [];
  const sourceTotal = sources.reduce((sum, s) => sum + s.remaining_amount_minor, 0);
  const targetTotal = input.targets.reduce((sum, t) => sum + t.remaining_amount_minor, 0);
  const amountMinor = Math.min(input.amountMinor, sourceTotal, targetTotal);
  if (amountMinor <= 0) throw new Error('Mahsup edilecek kayıt seçin');

  const { allocations } = allocateAcrossObligations(amountMinor, input.targets);
  const { allocations: sourceAllocations } = allocateAcrossObligations(amountMinor, sources);
  const pairs = pairAllocations(sourceAllocations, allocations);
  const involved = new Map(pairs.flatMap((pair) => [[pair.source.id, pair.source], [pair.target.id, pair.target]] as const));
  const { data, error } = await supabase.rpc('settle_offset_atomic' as never, {
    p_expected_actor: input.actorId, p_request_id: input.requestId,
    p_workspace_id: input.workspaceId, p_counterparty_id: input.counterpartyId,
    p_direction: input.direction, p_currency_code: input.currencyCode,
    p_amount_minor: amountMinor, p_paid_at: input.paidAt, p_fx_rate_try_minor: input.fxRateTryMinor ?? null,
    p_pairs: pairs.map((pair) => ({ source_id: pair.source.id, target_id: pair.target.id, amount_minor: pair.amountMinor })),
    p_expected: [...involved.values()].map((o) => ({ id: o.id, remaining_amount_minor: o.remaining_amount_minor })),
  } as never);
  if (error) throw error;
  const receipt = data as unknown as { allocations?: { obligation_id: string; amount_minor: number }[] } | null;
  if (!Array.isArray(receipt?.allocations) || receipt.allocations.length !== allocations.length
    || receipt.allocations.some((a, index) => a.obligation_id !== allocations[index].obligation.id || a.amount_minor !== allocations[index].amountMinor)) {
    throw new Error('Mahsup sonucu doğrulanamadı; aynı işlem kimliğiyle tekrar kontrol edin');
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
  if (!input.actorId || !input.requestId) throw new Error('Kalıcı ciro işlem kimliği ve sahibi eksik');
  const sources = input.sources ?? [];
  const chequeTotal = sources.reduce((sum, s) => sum + s.remaining_amount_minor, 0);
  if (chequeTotal <= 0) throw new Error('Ciro edilecek çek/senet seçin');

  const { allocations, leftoverMinor } = allocateAcrossObligations(chequeTotal, input.targets);
  if (!Number.isSafeInteger(chequeTotal) || sources.some((o) => o.direction !== 'receivable'
    || !['cek', 'senet'].includes(o.document_type ?? '') || o.currency_code !== input.currencyCode)
    || input.targets.some((o) => o.direction !== 'payable' || o.currency_code !== input.currencyCode
      || o.counterparty_id !== input.counterpartyId || ['cek', 'senet', 'kredi_karti_ekstresi'].includes(o.document_type ?? ''))) {
    throw new Error('Ciro kaynağı veya hedef kapsamı geçersiz');
  }
  const { data, error } = await supabase.rpc('settle_endorsement_atomic' as never, {
    p_expected_actor: input.actorId, p_request_id: input.requestId, p_workspace_id: input.workspaceId,
    p_counterparty_id: input.counterpartyId, p_currency_code: input.currencyCode, p_paid_at: input.paidAt,
    p_fx_rate_try_minor: input.fxRateTryMinor ?? null,
    p_sources: sources.map((o) => ({ id: o.id, remaining_amount_minor: o.remaining_amount_minor })),
    p_targets: input.targets.map((o) => ({ id: o.id, remaining_amount_minor: o.remaining_amount_minor })),
  } as never);
  if (error) throw error;
  const receipt = data as unknown as { allocations?: { obligation_id: string; amount_minor: number }[]; leftover_minor?: number; advances?: Obligation[] } | null;
  if (!Array.isArray(receipt?.allocations) || receipt.allocations.length !== allocations.length
    || receipt.allocations.some((o, i) => o.obligation_id !== allocations[i].obligation.id || o.amount_minor !== allocations[i].amountMinor)
    || receipt.leftover_minor !== leftoverMinor || !Array.isArray(receipt.advances)
    || receipt.advances.some((o) => !o.id || o.workspace_id !== input.workspaceId || o.counterparty_id !== input.counterpartyId
      || o.currency_code !== input.currencyCode || o.direction !== 'receivable' || o.document_type !== 'avans'
      || !sources.some((s) => s.id === o.parent_obligation_id) || !Number.isSafeInteger(o.total_amount_minor) || o.total_amount_minor <= 0)
    || new Set(receipt.advances.map((o) => o.parent_obligation_id)).size !== receipt.advances.length
    || receipt.advances.reduce((sum, o) => sum + o.total_amount_minor, 0) !== leftoverMinor) {
    throw new Error('Ciro sonucu doğrulanamadı; aynı işlem kimliğiyle tekrar kontrol edin');
  }
  return { allocations, leftoverMinor, instrumentObligation: null, advanceObligation: receipt.advances[0] ?? null,
    advanceObligations: receipt.advances, transactionIds: [] };
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
