import type { Reminder } from '@/features/reminders/api';
import type { TablesInsert } from '@/db/database.types';

// notifications.ts (obligation vade hatırlatmaları) ve creditCardReminders.ts (kredi
// kartı ekstre hatırlatmaları) aynı kalıba sahipti: hangi hatırlatma kademelerinin gerekli
// olduğunu hesaplayıp reminders tablosuna yazarlar. supabase/functions/send-reminders (pg_cron
// ile 15 dakikada bir tetiklenir) zamanı gelen satırları okuyup gerçek push bildirimini
// gönderir — cihaz üzerinde ayrıca bir OS bildirimi PLANLANMAZ (önceki expo-notifications
// scheduleNotificationAsync yaklaşımı, bildirimlerin kendi gününde değil güvenilmez şekilde
// tetiklenmesine yol açıyordu). Bu modül tek bir yerde "hedefi hesapla, sadece farkı uygula"
// mantığını uygular; iki servis de kendi hedef listesini kurup buraya devreder.
export interface ReminderTarget {
  /** existing satırıyla eşlemek için anahtar: obligation için stage, kredi kartı için `${periodKey}|${stage}` */
  key: string;
  /** null ise bu kademe iptal edilmeli (geçmişte kaldı / terminal / dönem karşılandı) */
  remindAt: Date | null;
  /** upsert'e workspace_id/remind_at/status DIŞINDA eklenecek kolonlar
   *  (obligation_id+stage ya da account_id+kind+period_key+stage) */
  extra: Record<string, unknown>;
}

export interface ReconcileParams {
  workspaceId: string;
  existing: Reminder[];
  keyOf: (r: Reminder) => string;
  targets: ReminderTarget[];
  upsert: (input: TablesInsert<'reminders'>) => Promise<unknown>;
}

export async function reconcileReminders(params: ReconcileParams): Promise<void> {
  const { workspaceId, existing, keyOf, targets, upsert } = params;
  const byKey = new Map(existing.map((r) => [keyOf(r), r]));

  for (const target of targets) {
    const existingRow = byKey.get(target.key);

    if (target.remindAt) {
      const unchanged =
        !!existingRow &&
        existingRow.status === 'scheduled' &&
        new Date(existingRow.remind_at).getTime() === target.remindAt.getTime();

      if (unchanged) continue; // hedef zaten karşılanıyor: DB'ye hiç dokunma

      await upsert({
        workspace_id: workspaceId,
        ...target.extra,
        remind_at: target.remindAt.toISOString(),
        status: 'scheduled',
      } as TablesInsert<'reminders'>);
      continue;
    }

    // Hedef: bu kademe iptal olmalı
    if (!existingRow || existingRow.status === 'cancelled') continue; // zaten yok/iptal — dokunma
    await upsert({
      workspace_id: workspaceId,
      ...target.extra,
      remind_at: existingRow.remind_at,
      status: 'cancelled',
    } as TablesInsert<'reminders'>);
  }
}
