// Kredi kartı güncel borcu — "ekstre çapası" modeli.
//
// Kullanıcı kartın bütün geçmiş hareketlerini girmez; bu yüzden borç yalnızca açılış bakiyesi +
// hareketlerden hesaplanınca eksik (hatta eksi) çıkıyordu. Bankanın kesin rakamı ekstredir:
// bir ekstre girildiyse kart borcu o ekstrenin tutarından başlar, kesim tarihinden SONRAKİ
// harcamalar eklenir, ödemeler düşülür; kesimden önceki hareketler zaten ekstrenin içindedir
// ve sayılmaz (kalem kalem ayrılmış ekstrelerde çift sayma da böylece önlenir).
//
// Ekstre hiç yoksa (ya da açılış bakiyesi en son ekstreden daha yeni bir bilgiyse) eski model
// geçerlidir: açılış bakiyesi + tüm hareketler.
//
// Nakit avans karta hareket yazmaz (borç kaydı olarak tutulur): kesimden sonra çekilen nakit
// avansın kalanı güncel borca eklenir; kesimden öncekiler ekstrenin içindedir.
import { computeStatementPeriod, periodKeyForDueDate, type CreditCardPeriodAccount } from '@/utils/creditCardPeriod';

export interface CardDebtAccount extends CreditCardPeriodAccount {
  id: string;
  opening_balance_minor: number;
  created_at: string;
}

export interface CardDebtTransaction {
  account_id: string;
  transfer_to_account_id: string | null;
  direction: string;
  amount_minor: number;
  occurred_at: string;
}

export interface CardDebtStatement {
  id: string;
  total_amount_minor: number;
  remaining_amount_minor: number;
  due_date: string | null;
  status: string;
  /** Ekstrenin uygulamaya girildiği an — tahmini kesim, bu günden sonra olamaz. */
  created_at: string;
  /** Ekstreye yapılan ve karta transfer olarak YANSIMAYAN ödemelerin toplamı (hesapsız
   * "ödendi" işareti ya da ekstre detayından bankadan gider olarak ödeme). Karta transferle
   * yapılan ödemeler zaten hareket olarak düşülür; burada sayılmaz. */
  off_card_paid_minor: number;
}

export interface CardDebtCashAdvance {
  remaining_amount_minor: number;
  created_at: string;
  status: string;
}

export interface CardStatementAnchor {
  statementId: string;
  /** Kesim tarihi (YYYY-MM-DD). */
  cutoffDate: string;
  /** Kesim günü girilmemiş kartta son ödeme tarihi kesim yerine kullanılır. */
  cutoffEstimated: boolean;
  dueDate: string;
  statementTotalMinor: number;
  /** Ekstreden ödenmesi gereken kalan (bankanın "ekstre borcu"). */
  statementRemainingMinor: number;
}

export interface CardDebtResult {
  debtMinor: number;
  anchor: CardStatementAnchor | null;
}

const CANCELLED = 'iptal_edildi';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Cihazın yerel takvim günü (YYYY-MM-DD) — kesim günü yerel takvime göredir.
export function localDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Türkiye'de son ödeme tarihi kesimden en az 10 gün sonradır.
const DUE_AFTER_CUTOFF_DAYS = 10;

function estimatedCutoff(dueDate: string, enteredAt: string): string {
  const [y, m, d] = localDay(dueDate).split('-').map(Number);
  const guess = localDay(new Date(y, m - 1, d - DUE_AFTER_CUTOFF_DAYS));
  const entered = localDay(enteredAt);
  return entered < guess ? entered : guess;
}

// Bir ekstrenin kesim tarihi: kartın kesim günü varsa son ödeme tarihinin ait olduğu dönemden
// hesaplanır. Yoksa tahmin edilir: son ödemeden 10 gün önce, ekstre daha önce girildiyse giriş
// günü (ekstre kesimden önce elde olamaz).
export function statementCutoff(
  account: CreditCardPeriodAccount,
  dueDate: string,
  enteredAt: string
): { date: string; estimated: boolean } {
  const estimate = { date: estimatedCutoff(dueDate, enteredAt), estimated: true };
  if (!account.statement_day) return estimate;
  const [year, month] = periodKeyForDueDate(account, dueDate).split('-').map(Number);
  const period = computeStatementPeriod(account, new Date(year, month - 1, 1));
  if (!period) return estimate;
  const cutoff = localDay(period.statementDate);
  // Ayarlar sonradan değiştiyse kesim son ödemeden sonraya düşebilir; o durumda tahmin kullanılır.
  return cutoff > localDay(dueDate) ? estimate : { date: cutoff, estimated: false };
}

// Hareketin kart borcuna etkisi: harcama ve karttan çıkan transfer borcu artırır; karta gelen
// transfer/gelir (ödeme, iade) azaltır.
export function cardDebtDelta(cardId: string, tx: CardDebtTransaction): number {
  if (tx.direction === 'transfer') {
    if (tx.account_id === cardId) return tx.amount_minor;
    if (tx.transfer_to_account_id === cardId) return -tx.amount_minor;
    return 0;
  }
  if (tx.account_id !== cardId) return 0;
  if (tx.direction === 'expense') return tx.amount_minor;
  if (tx.direction === 'income') return -tx.amount_minor;
  return 0;
}

export function computeCardDebt(
  account: CardDebtAccount,
  transactions: CardDebtTransaction[],
  statements: CardDebtStatement[],
  cashAdvances: CardDebtCashAdvance[],
  today: string = localDay(new Date())
): CardDebtResult {
  let anchor: (CardStatementAnchor & { offCardPaidMinor: number }) | null = null;
  for (const statement of statements) {
    if (statement.status === CANCELLED || !statement.due_date) continue;
    const cutoff = statementCutoff(account, statement.due_date, statement.created_at);
    if (cutoff.date > today) continue;
    if (!anchor || cutoff.date > anchor.cutoffDate) {
      anchor = {
        statementId: statement.id,
        cutoffDate: cutoff.date,
        cutoffEstimated: cutoff.estimated,
        dueDate: localDay(statement.due_date),
        statementTotalMinor: statement.total_amount_minor,
        statementRemainingMinor: statement.remaining_amount_minor,
        offCardPaidMinor: statement.off_card_paid_minor,
      };
    }
  }

  // Açılış bakiyesi ("güncel kart borcu") en son ekstreden sonra girildiyse daha yeni bilgidir.
  const openingIsNewer = account.opening_balance_minor !== 0 && localDay(account.created_at) > (anchor?.cutoffDate ?? '');
  const openAdvances = cashAdvances.filter((a) => a.status !== CANCELLED && a.remaining_amount_minor > 0);

  if (!anchor || openingIsNewer) {
    const delta = transactions.reduce((sum, tx) => sum + cardDebtDelta(account.id, tx), 0);
    const advances = openAdvances.reduce((sum, a) => sum + a.remaining_amount_minor, 0);
    return { debtMinor: account.opening_balance_minor + delta + advances, anchor: null };
  }

  const cutoffDate = anchor.cutoffDate;
  const afterCutoff = transactions
    .filter((tx) => localDay(tx.occurred_at) > cutoffDate)
    .reduce((sum, tx) => sum + cardDebtDelta(account.id, tx), 0);
  const advancesAfterCutoff = openAdvances
    .filter((a) => localDay(a.created_at) > cutoffDate)
    .reduce((sum, a) => sum + a.remaining_amount_minor, 0);
  const { offCardPaidMinor, ...publicAnchor } = anchor;
  return {
    debtMinor: anchor.statementTotalMinor - offCardPaidMinor + afterCutoff + advancesAfterCutoff,
    anchor: publicAnchor,
  };
}
