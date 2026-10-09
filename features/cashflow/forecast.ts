// Nakit uyarısı (design NakitUyari.html, PLANLAR.md §5.6): hesap bazlı tahmini bakiye =
// güncel bakiye − o hesaptan planlanan ödemeler + o hesaba planlanan tahsilatlar, gün gün.
// "Hangi hesaptan" bilgisi mevcut obligations.account_id alanıdır (ödeme/tahsilat hesabı); yeni
// kolon gerekmedi. Yalnızca TL hesaplar ve TL kayıtlar hesaplanır (kur çevrimi tahmini bulanıklaştırır).
export interface ForecastItem {
  /** YYYY-MM-DD */
  dueDate: string;
  amountMinor: number;
  direction: 'payable' | 'receivable';
  title: string;
  obligationId: string;
}

export interface ForecastPoint {
  /** YYYY-MM-DD */
  date: string;
  balanceMinor: number;
}

export interface CashForecast {
  points: ForecastPoint[];
  /** İlk negatif gün; yoksa null. */
  firstNegative: ForecastPoint | null;
  /** Dönem içindeki en düşük bakiye. */
  lowestMinor: number;
  outgoing: ForecastItem[];
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function projectBalance(
  currentBalanceMinor: number,
  items: ForecastItem[],
  days: number,
  from: Date = new Date()
): CashForecast {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const byDay = new Map<string, number>();
  const outgoing: ForecastItem[] = [];

  for (const item of items) {
    // Vadesi geçmiş ve henüz ödenmemiş borçlar bugün çıkıyor sayılır (temkinli). Vadesi geçmiş alacak
    // ise tahsil edileceği belli olmadığından tahmine girmez — bugün gelirmiş gibi saymak, eksiye
    // düşecek bir hesabı olduğundan rahat gösterirdi.
    const overdue = item.dueDate < isoDay(start);
    if (overdue && item.direction === 'receivable') continue;
    const key = overdue ? isoDay(start) : item.dueDate;
    const delta = item.direction === 'payable' ? -item.amountMinor : item.amountMinor;
    byDay.set(key, (byDay.get(key) ?? 0) + delta);
    if (item.direction === 'payable') outgoing.push(item);
  }

  const points: ForecastPoint[] = [];
  let balance = currentBalanceMinor;
  let firstNegative: ForecastPoint | null = null;
  let lowest = currentBalanceMinor;
  for (let i = 0; i <= days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const key = isoDay(day);
    balance += byDay.get(key) ?? 0;
    const point = { date: key, balanceMinor: balance };
    points.push(point);
    if (balance < lowest) lowest = balance;
    if (balance < 0 && !firstNegative) firstNegative = point;
  }

  outgoing.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { points, firstNegative, lowestMinor: lowest, outgoing };
}
