import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getRemindersForObligation, upsertReminder } from '@/features/reminders/api';
import { getNextPendingInstallment, type Obligation } from '@/features/obligations/api';
import { reconcileReminders, type ReminderTarget } from '@/services/reminderSync';

// docs/08-tasarim-sistemi.md ile ilgisiz, salt platform notu: Android 8+ açık bir kanal
// olmadan varsayılan önem/ses davranışı kullanır — bu, cihazlar arası tutarsız görünüme
// yol açabilir. app.json'da hiç kanal tanımı yoktu; burada bir kere, uygulama açılışında kurulur.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('obligation-reminders', {
    name: 'Borç/alacak hatırlatmaları',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {});
}

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

// Vade öncesi 7 gün / 3 gün / vade günü / (hâlâ ödenmemişse) vadeden 1 gün sonra olmak
// üzere dört sabit kademeli hatırlatma — başka hiçbir tetikleyici yok. Bu tüm obligation
// türleri (kredi, çek, senet, fatura vb.) için ortak, kredi'ye özel değildir. Bildirim
// başlığı/gövdesi burada değil supabase/functions/send-reminders'ta (STAGE_PREFIX) ve
// app/notifications.tsx'te (uygulama içi liste) üretilir — aynı stage değerini kullanırlar.
const REMINDER_STAGES: { stage: string; daysBefore: number; hour: number }[] = [
  { stage: '7_days_before', daysBefore: 7, hour: 10 },
  { stage: '3_days_before', daysBefore: 3, hour: 18 },
  { stage: 'due_day', daysBefore: 0, hour: 9 },
  // daysBefore negatif: buildRemindAt "day - daysBefore" hesapladığı için day+1 çıkar —
  // ay sonu taşması JS Date tarafından otomatik normalize edilir, ayrı tarih matematiği gerekmez.
  { stage: 'overdue_1_day', daysBefore: -1, hour: 9 },
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
  const nextInstallment = isTerminal ? null : await getNextPendingInstallment(obligation.id);
  const effectiveDueDate = nextInstallment?.dueDate ?? obligation.due_date;

  const buildTarget = (stage: string, remindAt: Date | null): ReminderTarget => ({
    key: stage,
    remindAt,
    extra: { obligation_id: obligation.id, stage },
  });

  if (isTerminal || !effectiveDueDate) {
    await reconcileReminders({
      workspaceId,
      existing: existingReminders,
      keyOf: (r) => r.stage,
      targets: REMINDER_STAGES.map(({ stage }) => buildTarget(stage, null)),
      upsert: upsertReminder,
    });
    return;
  }

  const targets = REMINDER_STAGES.map(({ stage, daysBefore, hour }) =>
    buildTarget(stage, buildRemindAt(effectiveDueDate, daysBefore, hour))
  );

  await reconcileReminders({
    workspaceId,
    existing: existingReminders,
    keyOf: (r) => r.stage,
    targets,
    upsert: upsertReminder,
  });
}
