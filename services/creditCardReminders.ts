import * as Notifications from 'expo-notifications';

import { supabase } from '@/services/supabase';
import { getStatementUploadReminders, upsertAccountReminder } from '@/features/reminders/api';
import { ensureNotificationPermission } from '@/services/notifications';
import type { Account } from '@/features/accounts/api';

// notifications.ts'teki syncObligationReminder ile aynı desen: mevcut planlı bildirimler
// iptal edilip her senkronizasyonda yeniden planlanır. Buradaki fark, hatırlatmanın bir
// obligation'a değil bir hesaba ve döneme (period_key) bağlı olması — çünkü o dönemin
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
async function getFulfilledPeriods(accountId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('obligations')
    .select('due_date')
    .eq('account_id', accountId)
    .eq('document_type', 'kredi_karti_ekstresi');
  if (error) throw error;

  const periods = new Set<string>();
  for (const row of data ?? []) {
    if (row.due_date) periods.add(periodKeyFor(new Date(row.due_date)));
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
    getFulfilledPeriods(account.id),
  ]);
  const remindersByKey = new Map(existingReminders.map((r) => [`${r.period_key}|${r.stage}`, r]));

  const now = new Date();
  const dueDay = account.payment_due_day ?? account.statement_day;

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
      const key = `${periodKey}|${stage}`;
      const existing = remindersByKey.get(key);

      if (existing?.notification_identifier) {
        await Notifications.cancelScheduledNotificationAsync(existing.notification_identifier).catch(() => {});
      }

      if (isFulfilled || remindAt.getTime() <= now.getTime()) {
        if (existing && existing.status !== 'cancelled') {
          await upsertAccountReminder({
            workspace_id: workspaceId,
            account_id: account.id,
            kind: 'statement_upload',
            period_key: periodKey,
            stage,
            remind_at: existing.remind_at,
            notification_identifier: null,
            status: 'cancelled',
          });
        }
        continue;
      }

      const granted = await ensureNotificationPermission();
      if (!granted) continue;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Ekstre yüklemeyi unutmayın',
          body: `${account.name} — bu ayki ekstrenizi tarayın veya kart borcunu elle girin.`,
          data: { accountId: account.id, periodKey, stage },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
      });

      await upsertAccountReminder({
        workspace_id: workspaceId,
        account_id: account.id,
        kind: 'statement_upload',
        period_key: periodKey,
        stage,
        remind_at: remindAt.toISOString(),
        notification_identifier: identifier,
        status: 'scheduled',
      });
    }
  }
}
