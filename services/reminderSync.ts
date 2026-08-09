import * as Notifications from 'expo-notifications';

import type { Reminder } from '@/features/reminders/api';
import type { TablesInsert } from '@/db/database.types';

// notifications.ts (obligation vade hatırlatmaları) ve creditCardReminders.ts (kredi
// kartı ekstre hatırlatmaları) aynı kalıba sahipti: her senkron çağrısında mevcut TÜM
// planlı bildirimler koşulsuz iptal edilip yeniden planlanıyordu — hedef hiç değişmemiş
// olsa bile. Bu hem gereksiz OS/ağ trafiği yaratıyordu hem de "bildirimler kendi kafasına
// göre oluşuyor" hissini güçlendiriyordu (bkz. kullanıcı geri bildirimi). Bu modül tek bir
// yerde "hedefi hesapla, sadece farkı uygula" mantığını uygular; iki servis de kendi hedef
// listesini kurup buraya devreder.
export interface ReminderTarget {
  /** existing satırıyla eşlemek için anahtar: obligation için stage, kredi kartı için `${periodKey}|${stage}` */
  key: string;
  /** null ise bu kademe iptal edilmeli (geçmişte kaldı / terminal / dönem karşılandı) */
  remindAt: Date | null;
  /** remindAt dolu olduğunda zorunlu */
  content?: { title: string; body: string; data: Record<string, unknown> };
  /** upsert'e workspace_id/remind_at/notification_identifier/status DIŞINDA eklenecek kolonlar
   *  (obligation_id+stage ya da account_id+kind+period_key+stage) */
  extra: Record<string, unknown>;
}

export interface ReconcileParams {
  workspaceId: string;
  existing: Reminder[];
  keyOf: (r: Reminder) => string;
  targets: ReminderTarget[];
  ensurePermission: () => Promise<boolean>;
  upsert: (input: TablesInsert<'reminders'>) => Promise<unknown>;
  /** Android bildirim kanalı (bkz. notifications.ts'teki setNotificationChannelAsync). iOS'ta yok sayılır. */
  channelId?: string;
}

export async function reconcileReminders(params: ReconcileParams): Promise<void> {
  const { workspaceId, existing, keyOf, targets, ensurePermission, upsert, channelId } = params;
  const byKey = new Map(existing.map((r) => [keyOf(r), r]));

  // Tek seferlik OS sorgusu: DB'nin "scheduled" dediği identifier'ın hâlâ gerçekten
  // planlı olduğunu doğrular (reinstall/izin geri alma gibi durumlarda DB ile OS
  // birbirinden kopabilir — bu kontrol olmadan idempotency yanlış pozitif verir).
  const liveIdentifiers = new Set(
    (await Notifications.getAllScheduledNotificationsAsync().catch(() => [])).map((n) => n.identifier)
  );

  for (const target of targets) {
    const existingRow = byKey.get(target.key);

    if (target.remindAt) {
      const unchanged =
        !!existingRow &&
        existingRow.status === 'scheduled' &&
        !!existingRow.notification_identifier &&
        liveIdentifiers.has(existingRow.notification_identifier) &&
        // ISO STRING KARŞILAŞTIRMASI YAPMA: Postgres timestamptz "+00:00" ile,
        // Date#toISOString() ise ".000Z" ile döner — string eşitliği hep false
        // olur ve idempotency hiç tutmaz. Epoch milisaniye karşılaştır.
        new Date(existingRow.remind_at).getTime() === target.remindAt.getTime();

      if (unchanged) continue; // hedef zaten karşılanıyor: OS'e ve DB'ye HİÇ dokunma

      if (existingRow?.notification_identifier) {
        await Notifications.cancelScheduledNotificationAsync(existingRow.notification_identifier).catch(() => {});
      }

      const granted = await ensurePermission();
      if (!granted) continue;

      try {
        const identifier = await Notifications.scheduleNotificationAsync({
          content: target.content!,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target.remindAt, channelId },
        });
        await upsert({
          workspace_id: workspaceId,
          ...target.extra,
          remind_at: target.remindAt.toISOString(),
          notification_identifier: identifier,
          status: 'scheduled',
        } as TablesInsert<'reminders'>);
      } catch (error) {
        console.warn('[notifications] hatırlatma planlanamadı', target.key, error);
      }
      continue;
    }

    // Hedef: bu kademe iptal olmalı
    if (!existingRow || existingRow.status === 'cancelled') continue; // zaten yok/iptal — dokunma
    if (existingRow.notification_identifier) {
      await Notifications.cancelScheduledNotificationAsync(existingRow.notification_identifier).catch(() => {});
    }
    await upsert({
      workspace_id: workspaceId,
      ...target.extra,
      remind_at: existingRow.remind_at,
      notification_identifier: null,
      status: 'cancelled',
    } as TablesInsert<'reminders'>);
  }
}
