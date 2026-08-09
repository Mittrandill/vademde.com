// Kredi kartı "dönem"i (hangi aya ait ekstre) her zaman KESİM ayı olarak tanımlanır —
// son ödeme tarihi değil. Türkiye'de tipik düzende (ör. kesim 15, son ödeme ayın 5'i)
// son ödeme tarihi bir SONRAKİ aya sarkar; dönem due_date'in ayına göre bucket'lanırsa
// "Ağustos ekstresi" hep due_date'i Eylül'e düşen bir kayıt olarak görünmez ve Ağustos
// satırı gerçekte yüklenmiş olsa bile sürekli "Yüklenmedi" kalır. Bu modül, ekstre
// tablosu (app/accounts/[id].tsx), kredi kartları listesi (app/accounts/credit-cards.tsx)
// ve ekstre yükleme hatırlatmaları (services/creditCardReminders.ts) arasında tek bir
// tutarlı dönem tanımı sağlar.

export interface CreditCardPeriodAccount {
  statement_day: number | null;
  payment_due_day: number | null;
}

export interface StatementPeriod {
  periodKey: string;
  statementDate: Date;
  dueDate: Date;
}

function clampToMonthDay(year: number, monthIndex: number, day: number, hour = 12): Date {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDayOfMonth), hour, 0, 0);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function periodKeyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Bir hesabın belirli bir ay için kesim ve son ödeme tarihini hesaplar — services/
// creditCardReminders.ts'teki bildirim planlama mantığıyla aynı "son ödeme kesimden
// önceyse bir ay ileri sarkar" kuralı kullanılır.
export function computeStatementPeriod(account: CreditCardPeriodAccount, monthDate: Date): StatementPeriod | null {
  if (!account.statement_day) return null;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const statementDate = clampToMonthDay(year, month, account.statement_day);
  const dueDay = account.payment_due_day ?? account.statement_day;
  const rawDueDate = clampToMonthDay(year, month, dueDay);
  const dueDate =
    rawDueDate.getTime() > statementDate.getTime() ? rawDueDate : clampToMonthDay(year, month + 1, dueDay);
  return { periodKey: periodKeyFor(statementDate), statementDate, dueDate };
}

// Ters yön: bir obligation'ın due_date'inden geriye doğru hangi KESİM ayına ait
// olduğunu bulur. due_date iki adaydan birine denk gelebilir — kendi ayının kesimi
// (sarkma yoksa) ya da bir önceki ayın kesimi (sarkma varsa); computeStatementPeriod'un
// ürettiği dueDate ile (gün bazında) eşleşen aday seçilir. Hesabın kesim/ödeme günü
// ayarları geçmişte değiştiyse eski kayıtların hangi aya düştüğü de değişebilir — ayrı
// bir period sütunu olmadan kabul edilen bilinen bir sınır.
export function periodKeyForDueDate(account: CreditCardPeriodAccount, dueDateStr: string): string {
  const due = new Date(dueDateStr);

  const sameMonth = computeStatementPeriod(account, due);
  if (sameMonth && sameCalendarDay(sameMonth.dueDate, due)) return sameMonth.periodKey;

  const prevMonthDate = new Date(due.getFullYear(), due.getMonth() - 1, 1);
  const prevMonth = computeStatementPeriod(account, prevMonthDate);
  if (prevMonth && sameCalendarDay(prevMonth.dueDate, due)) return prevMonth.periodKey;

  // Hiçbir aday eşleşmezse (ör. statement_day sonradan değişti) en güvenli varsayım
  // yine de due_date'in kendi ayıdır.
  return periodKeyFor(due);
}
