import * as Notifications from 'expo-notifications';

import { getReminderForObligation, upsertReminder } from '@/features/reminders/api';
import type { Obligation } from '@/features/obligations/api';
import { formatMinorAmount } from '@/utils/money';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// docs/01-finansal-kayit-modeli.md §3.4 — bu üç durum terminaldir; bildirim gerekmez.
const TERMINAL_STATUSES = new Set(['odendi', 'tahsil_edildi', 'iptal_edildi']);
const REMINDER_HOUR = 9;

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function buildRemindAt(dueDate: string): Date | null {
  const [year, month, day] = dueDate.split('-').map(Number);
  const remindAt = new Date(year, month - 1, day, REMINDER_HOUR, 0, 0);
  return remindAt.getTime() > Date.now() ? remindAt : null;
}

export type ReminderObligation = Pick<
  Obligation,
  'id' | 'title' | 'due_date' | 'status' | 'direction' | 'remaining_amount_minor' | 'currency_code'
>;

// docs/12-mvp-kabul-kriterleri.md — vade değişince bildirim yeniden planlanır, tamamlanınca iptal edilir.
// Bu fonksiyon obligation her oluşturulduğunda/güncellendiğinde çağrılır; mevcut planlı
// bildirimi iptal edip gerekiyorsa yeniden planlar.
export async function syncObligationReminder(workspaceId: string, obligation: ReminderObligation): Promise<void> {
  const existing = await getReminderForObligation(obligation.id);
  const isTerminal = TERMINAL_STATUSES.has(obligation.status) || obligation.remaining_amount_minor <= 0;
  const remindAt = !isTerminal && obligation.due_date ? buildRemindAt(obligation.due_date) : null;

  if (existing?.notification_identifier) {
    await Notifications.cancelScheduledNotificationAsync(existing.notification_identifier).catch(() => {});
  }

  if (!remindAt) {
    if (existing && existing.status !== 'cancelled') {
      await upsertReminder({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        remind_at: existing.remind_at,
        notification_identifier: null,
        status: 'cancelled',
      });
    }
    return;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const label = obligation.direction === 'payable' ? 'Ödeme vadesi' : 'Tahsilat vadesi';
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: label,
      body: `${obligation.title} — ${formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}`,
      data: { obligationId: obligation.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
  });

  await upsertReminder({
    workspace_id: workspaceId,
    obligation_id: obligation.id,
    remind_at: remindAt.toISOString(),
    notification_identifier: identifier,
    status: 'scheduled',
  });
}

// obligations tablosunda ON DELETE CASCADE reminders satırını siler; bu fonksiyon
// yalnızca cihazda zaten planlanmış OS bildirimini iptal etmek için obligation
// silinmeden önce çağrılır.
export async function cancelObligationReminder(obligationId: string): Promise<void> {
  const existing = await getReminderForObligation(obligationId);
  if (existing?.notification_identifier) {
    await Notifications.cancelScheduledNotificationAsync(existing.notification_identifier).catch(() => {});
  }
}
