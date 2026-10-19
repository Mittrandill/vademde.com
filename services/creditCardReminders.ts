import { supabase } from '@/services/supabase';
import { getCardPaymentDueReminders, getStatementUploadReminders, upsertAccountReminder } from '@/features/reminders/api';
import { reconcileReminders, type ReminderTarget } from '@/services/reminderSync';
import { periodKeyForDueDate, type CreditCardPeriodAccount } from '@/utils/creditCardPeriod';
import type { Account } from '@/features/accounts/api';

// notifications.ts'teki reconcileReminders ile aynı paylaşılan mekanizma: hedef hatırlatma
// kümesi hesaplanır, mevcutla aynıysa OS/DB'ye hiç dokunulmaz. Buradaki fark, hatırlatmanın
// bir obligation'a değil bir hesaba ve döneme (period_key) bağlı olması — çünkü o dönemin
// ekstresi henüz oluşturulmamış olabilir; hatırlatmanın amacı zaten onu oluşturmak.
const CYCLES_AHEAD = 3;

type CreditCardAccount = Pick<Account, 'id' | 'name' | 'statement_day' | 'payment_due_day'>;

function clampToMonthDay(year: number, monthIndex: number, day: number, hour: number): Date {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDayOfMonth), hour, 0, 0);
}

function periodKeyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// docs/01-finansal-kayit-modeli.md §3.2 — kredi kartı ekstresi bir obligation'dır;
// bu dönem için zaten bir tane varsa hatırlatmaya gerek yok.
// ÖNEMLİ: dönem burada obligation'ın due_date'inin kendi ayı DEĞİL, o due_date'in
// hangi KESİM ayına ait olduğu (periodKeyForDueDate) ile belirlenir — son ödeme tarihi
// sıklıkla bir sonraki aya sarktığı için (ör. kesim 15, ödeme ayın 5'i) ham due_date
// ayına bakmak "Ağustos kesimi"ni yanlışlıkla Eylül'e sayardı ve o dönem hiç
// karşılanmamış görünüp gereksiz hatırlatmalar planlanırdı (bkz. utils/creditCardPeriod.ts).
async function getFulfilledPeriods(account: CreditCardPeriodAccount & { id: string }): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('obligations')
    .select('due_date')
    .eq('account_id', account.id)
    .eq('document_type', 'kredi_karti_ekstresi');
  if (error) throw error;

  const periods = new Set<string>();
  for (const row of data ?? []) {
    if (row.due_date) periods.add(periodKeyForDueDate(account, row.due_date));
  }
  return periods;
}

export async function syncCreditCardStatementReminder(
  workspaceId: string,
  account: CreditCardAccount
): Promise<void> {
  if (!account.statement_day) return;

  const [existingReminders, fulfilledPeriods] = await Promise.all([
    getStatementUploadReminders(account.id),
    getFulfilledPeriods(account),
  ]);

  const now = new Date();
  const dueDay = account.payment_due_day ?? account.statement_day;
  const targets: ReminderTarget[] = [];

  for (let i = -1; i < CYCLES_AHEAD; i++) {
    const cycleDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const statementDate = clampToMonthDay(cycleDate.getFullYear(), cycleDate.getMonth(), account.statement_day, 10);
    const dueDate = clampToMonthDay(cycleDate.getFullYear(), cycleDate.getMonth(), dueDay, 10);
    // Son ödeme günü kesim gününden önce hesaplanmışsa (ör. kesim 28, ödeme 5) bir
    // sonraki aya sarkar — dönem penceresi hep kesimden ödemeye doğru ileri gitmeli.
    const effectiveDueDate = dueDate.getTime() > statementDate.getTime() ? dueDate : new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, dueDate.getDate(), 10, 0, 0);
    const midDate = new Date((statementDate.getTime() + effectiveDueDate.getTime()) / 2);
    const periodKey = periodKeyFor(statementDate);
    const isFulfilled = fulfilledPeriods.has(periodKey);

    for (const stage of ['statement_day', 'mid_period'] as const) {
      const remindAt = stage === 'statement_day' ? statementDate : midDate;
      const shouldSchedule = !isFulfilled && remindAt.getTime() > now.getTime();

      targets.push({
        key: `${periodKey}|${stage}`,
        remindAt: shouldSchedule ? remindAt : null,
        extra: { account_id: account.id, kind: 'statement_upload', period_key: periodKey, stage },
      });
    }
  }

  await reconcileReminders({
    workspaceId,
    existing: existingReminders,
    keyOf: (r) => `${r.period_key}|${r.stage}`,
    targets,
    upsert: upsertAccountReminder,
  });
}

// Kartın son ödeme günü hatırlatması — kullanıcı takvime ya da kayıt olarak hiçbir şey eklemeden,
// kartın ayarlarındaki son ödeme gününden. Hedef dönem, features/accounts/cardDues.ts'in ürettiği
// sıradaki son ödemedir (ekstresi girilmemiş, borcu olan ilk dönem). Ekstre girilmiş dönemin
// hatırlatması o ekstre kaydının kendi vade hatırlatmasıyla gelir; burada tekrar planlanmaz.
// nextDue null ise (borç yok / ekstre karşılıyor / ödeme günü yok) açık hatırlatmalar iptal edilir.
const CARD_DUE_STAGES = [
  { stage: '3_days_before', daysBefore: 3 },
  { stage: 'due_day', daysBefore: 0 },
] as const;

export async function syncCardPaymentDueReminders(
  workspaceId: string,
  accountId: string,
  nextDue: { dueDate: string; periodKey: string } | null
): Promise<void> {
  const existing = await getCardPaymentDueReminders(accountId);
  const now = Date.now();
  const extraFor = (periodKey: string, stage: string) => ({
    account_id: accountId,
    kind: 'card_payment_due',
    period_key: periodKey,
    stage,
  });

  const targets: ReminderTarget[] = [];
  if (nextDue) {
    const [y, m, d] = nextDue.dueDate.split('-').map(Number);
    for (const { stage, daysBefore } of CARD_DUE_STAGES) {
      const remindAt = new Date(y, m - 1, d - daysBefore, 10, 0, 0);
      targets.push({
        key: `${nextDue.periodKey}|${stage}`,
        remindAt: remindAt.getTime() > now ? remindAt : null,
        extra: extraFor(nextDue.periodKey, stage),
      });
    }
  }
  // Artık hedef olmayan dönemlerin (ödendi, ekstre girildi, ayar değişti) bekleyen hatırlatmaları iptal.
  const targetKeys = new Set(targets.map((t) => t.key));
  for (const row of existing) {
    const key = `${row.period_key}|${row.stage}`;
    if (targetKeys.has(key) || row.status !== 'scheduled') continue;
    targets.push({ key, remindAt: null, extra: extraFor(row.period_key as string, row.stage) });
  }

  await reconcileReminders({
    workspaceId,
    existing,
    keyOf: (r) => `${r.period_key}|${r.stage}`,
    targets,
    upsert: upsertAccountReminder,
  });
}
