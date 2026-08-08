import * as Notifications from 'expo-notifications';

import { getRemindersForObligation, upsertReminder } from '@/features/reminders/api';
import { getNextPendingInstallment, type Obligation } from '@/features/obligations/api';
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

// Vade öncesi 7 gün / 3 gün / vade günü olmak üzere üç kademeli hatırlatma; bu tüm
// obligation türleri (kredi, çek, senet, fatura vb.) için ortak, kredi'ye özel değildir.
const REMINDER_STAGES: { stage: string; daysBefore: number; hour: number; label: string }[] = [
  { stage: '7_days_before', daysBefore: 7, hour: 10, label: '7 gün kaldı — ' },
  { stage: '3_days_before', daysBefore: 3, hour: 18, label: '3 gün kaldı — ' },
  { stage: 'due_day', daysBefore: 0, hour: 9, label: '' },
];

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function buildRemindAt(dueDate: string, daysBefore: number, hour: number): Date | null {
  const [year, month, day] = dueDate.split('-').map(Number);
  const remindAt = new Date(year, month - 1, day - daysBefore, hour, 0, 0);
  return remindAt.getTime() > Date.now() ? remindAt : null;
}

export type ReminderObligation = Pick<
  Obligation,
  'id' | 'title' | 'due_date' | 'status' | 'direction' | 'remaining_amount_minor' | 'currency_code'
>;

// docs/12-mvp-kabul-kriterleri.md — vade değişince bildirim yeniden planlanır, tamamlanınca iptal edilir.
// Bu fonksiyon obligation her oluşturulduğunda/güncellendiğinde çağrılır; mevcut planlı
// bildirimleri iptal edip gerekiyorsa üç kademeyi de yeniden planlar.
// Dışa açık sarmalayıcı: hatırlatma senkronu bir kayıt (borç/alacak) oluşturulduktan/güncellendikten
// SONRA save mutation'ının içinde await edilir. İçerideki ilk okumalar (getRemindersForObligation,
// getNextPendingInstallment) ya da terminal-iptal upsert'i throw ederse, kayıt zaten yazılmışken
// tüm save hataya düşüp kullanıcıya çökme/yanlış hata gösterirdi. Hatırlatma en iyi çaba bir yan
// etkidir; bu dış katman onu tamamen yutar (kademe bazlı ince yalıtım için içerideki try/catch korunur).
export async function syncObligationReminder(workspaceId: string, obligation: ReminderObligation): Promise<void> {
  try {
    await runSyncObligationReminder(workspaceId, obligation);
  } catch (error) {
    console.warn('[notifications] hatırlatma senkronu başarısız (kayıt etkilenmedi)', error);
  }
}

async function runSyncObligationReminder(workspaceId: string, obligation: ReminderObligation): Promise<void> {
  const existingReminders = await getRemindersForObligation(obligation.id);
  const isTerminal = TERMINAL_STATUSES.has(obligation.status) || obligation.remaining_amount_minor <= 0;

  // Taksitli borçlarda vade, sabit obligation.due_date değil bir sonraki bekleyen
  // taksitin tarihidir; taksitsiz kayıtlarda (çek/senet/fatura) null döner ve obligation.due_date kullanılır.
  // Bildirimde gösterilen tutar da aynı mantıkla o taksidin kendi tutarıdır — kredinin
  // toplam bakiyesi değil (o yalnızca /obligations/[id] detay sayfasında gösterilir).
  const nextInstallment = isTerminal ? null : await getNextPendingInstallment(obligation.id);
  const effectiveDueDate = nextInstallment?.dueDate ?? obligation.due_date;
  const effectiveAmountMinor = nextInstallment?.remainingAmountMinor ?? obligation.remaining_amount_minor;

  for (const existing of existingReminders) {
    if (existing.notification_identifier) {
      await Notifications.cancelScheduledNotificationAsync(existing.notification_identifier).catch(() => {});
    }
  }

  if (isTerminal || !effectiveDueDate) {
    for (const existing of existingReminders) {
      if (existing.status !== 'cancelled') {
        await upsertReminder({
          workspace_id: workspaceId,
          obligation_id: obligation.id,
          stage: existing.stage,
          remind_at: existing.remind_at,
          notification_identifier: null,
          status: 'cancelled',
        });
      }
    }
    return;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const label = obligation.direction === 'payable' ? 'Ödeme vadesi' : 'Tahsilat vadesi';

  for (const { stage, daysBefore, hour, label: stagePrefix } of REMINDER_STAGES) {
    const remindAt = buildRemindAt(effectiveDueDate, daysBefore, hour);
    if (!remindAt) continue;

    // Bu fonksiyon kayıt insert edildikten SONRA, save mutation'ının içinde await edilir.
    // Bildirim planlama (izin/OS) veya reminders upsert'i (ağ/RLS) burada throw ederse,
    // kayıt zaten oluşmuşken save mutation hataya düşer ve kullanıcı çökme/yanlış hata
    // görürdü. Hatırlatma en iyi çaba bir yan etkidir: her kademe kendi içinde yalıtılır,
    // biri patlasa da kayıt akışı bozulmaz (iptal çağrıları zaten .catch ile korunuyordu).
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${stagePrefix}${label}`,
          body: `${obligation.title} — ${formatMinorAmount(effectiveAmountMinor, obligation.currency_code)}`,
          data: { obligationId: obligation.id, stage },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
      });

      await upsertReminder({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        stage,
        remind_at: remindAt.toISOString(),
        notification_identifier: identifier,
        status: 'scheduled',
      });
    } catch (error) {
      console.warn('[notifications] hatırlatma planlanamadı', stage, error);
    }
  }
}

// obligations tablosunda ON DELETE CASCADE reminders satırlarını siler; bu fonksiyon
// yalnızca cihazda zaten planlanmış OS bildirimlerini iptal etmek için obligation
// silinmeden önce çağrılır.
export async function cancelObligationReminder(obligationId: string): Promise<void> {
  const existingReminders = await getRemindersForObligation(obligationId);
  for (const existing of existingReminders) {
    if (existing.notification_identifier) {
      await Notifications.cancelScheduledNotificationAsync(existing.notification_identifier).catch(() => {});
    }
  }
}
