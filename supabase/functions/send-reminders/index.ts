// docs/06-teknik-mimari.md §10.2 — "Zamanlanmış bildirim ve iş görevleri". pg_cron her
// 15 dakikada bir bu fonksiyonu çağırır (bkz. migration: cron.schedule('send-due-reminders')),
// Authorization header'ında projenin anon JWT'sini taşıyarak — bu fonksiyon verify_jwt=true
// ile deploy edildi, platform gateway'i JWT'yi burada koda hiç girmeden doğruluyor; içeride
// ayrıca bir secret kontrolüne gerek yok (istek gövdesi/parametresi güvenilmez şekilde
// kullanılmıyor, yalnızca DB'deki zamanı gelmiş satırlar işleniyor). Önceden cihaz üzerinde
// expo-notifications ile zamanlanan yerel bildirimler (services/notifications.ts) kaldırıldı —
// hatırlatmalar artık yalnızca burada, tam zamanı geldiğinde (remind_at <= now()) Expo Push
// API üzerinden gönderilir.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;
const CHANNEL_ID = 'obligation-reminders';

// obligations tablosundaki terminal durumlar — docs/01-finansal-kayit-modeli.md §3.4
const TERMINAL_OBLIGATION_STATUSES = new Set(['odendi', 'tahsil_edildi', 'iptal_edildi']);

// services/notifications.ts REMINDER_STAGES ile birebir aynı önek/etiketler.
const STAGE_PREFIX: Record<string, string> = {
  '7_days_before': '7 gün kaldı — ',
  '3_days_before': '3 gün kaldı — ',
  due_day: '',
  overdue_1_day: 'Gecikti — ',
};

interface ReminderRow {
  id: string;
  workspace_id: string;
  obligation_id: string | null;
  account_id: string | null;
  kind: 'obligation_due' | 'statement_upload';
  stage: string;
  remind_at: string;
  obligation: {
    id: string;
    title: string;
    direction: 'payable' | 'receivable';
    status: string;
    remaining_amount_minor: number;
    currency_code: string;
  } | null;
  account: { id: string; name: string } | null;
}

function formatMinorAmount(amountMinor: number, currencyCode: string): string {
  const value = (Number.isFinite(amountMinor) ? amountMinor : 0) / 100;
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

function contentFor(
  reminder: ReminderRow,
  nextInstallmentAmountMinor: number | undefined
): { title: string; body: string; data: Record<string, unknown> } | null {
  if (reminder.kind === 'statement_upload' && reminder.account) {
    return {
      title: 'Ekstre yüklemeyi unutmayın',
      body: `${reminder.account.name} — bu ayki ekstrenizi tarayın veya kart borcunu elle girin.`,
      data: { accountId: reminder.account.id, stage: reminder.stage },
    };
  }
  if (reminder.obligation) {
    const label = reminder.obligation.direction === 'payable' ? 'Ödeme vadesi' : 'Tahsilat vadesi';
    const prefix = STAGE_PREFIX[reminder.stage] ?? '';
    // Taksitli borçlarda (kredi vb.) gösterilecek tutar bir sonraki bekleyen taksidin
    // kendi tutarıdır, obligation'ın toplam bakiyesi değil — services/notifications.ts'teki
    // getNextPendingInstallment ile aynı mantık (bkz. o dosyadaki yorum).
    const amountMinor = nextInstallmentAmountMinor ?? reminder.obligation.remaining_amount_minor;
    return {
      title: `${prefix}${label}`,
      body: `${reminder.obligation.title} — ${formatMinorAmount(amountMinor, reminder.obligation.currency_code)}`,
      data: { obligationId: reminder.obligation.id, stage: reminder.stage },
    };
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

Deno.serve(async (_req: Request) => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: dueReminders, error: fetchError } = await adminClient
    .from('reminders')
    .select(
      '*, obligation:obligations(id, title, direction, status, remaining_amount_minor, currency_code), account:accounts(id, name)'
    )
    .eq('status', 'scheduled')
    .is('dismissed_at', null)
    .lte('remind_at', new Date().toISOString())
    .gt('remind_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());

  if (fetchError) {
    return new Response(JSON.stringify({ success: false, error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const reminders = (dueReminders ?? []) as unknown as ReminderRow[];

  // Vadesi geldiğinde obligation zaten terminal duruma geçmiş olabilir (client mutation'ı
  // syncObligationReminder'ı tetikleyip iptal etmeden önce bir kayıt işlenmiş olabilir) —
  // burada son bir güvenlik ağı: terminal olanları push göndermeden iptal et.
  const toCancel: string[] = [];
  const toSend = reminders.filter((r) => {
    if (r.kind !== 'obligation_due' || !r.obligation) return true;
    const isTerminal =
      TERMINAL_OBLIGATION_STATUSES.has(r.obligation.status) || r.obligation.remaining_amount_minor <= 0;
    if (isTerminal) toCancel.push(r.id);
    return !isTerminal;
  });

  if (toCancel.length > 0) {
    await adminClient.from('reminders').update({ status: 'cancelled' }).in('id', toCancel);
  }

  if (toSend.length === 0) {
    return new Response(JSON.stringify({ success: true, sent: 0, cancelled: toCancel.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Taksitli borçlarda bildirimde gösterilecek tutar, obligation'ın toplam bakiyesi değil
  // bir sonraki bekleyen taksidin kendi tutarıdır (bkz. contentFor). Tüm obligation_id'ler
  // için tek seferde en yakın vadeli, ödenmemiş taksidi çek.
  const obligationIds = [...new Set(toSend.map((r) => r.obligation_id).filter((id): id is string => !!id))];
  const nextInstallmentByObligation = new Map<string, number>();
  if (obligationIds.length > 0) {
    const { data: installmentRows } = await adminClient
      .from('installments')
      .select('obligation_id, due_date, remaining_amount_minor')
      .in('obligation_id', obligationIds)
      .gt('remaining_amount_minor', 0)
      .neq('status', 'iptal_edildi')
      .order('due_date', { ascending: true });
    for (const row of installmentRows ?? []) {
      if (!nextInstallmentByObligation.has(row.obligation_id)) {
        nextInstallmentByObligation.set(row.obligation_id, row.remaining_amount_minor);
      }
    }
  }

  const workspaceIds = [...new Set(toSend.map((r) => r.workspace_id))];
  const { data: members, error: membersError } = await adminClient
    .from('workspace_members')
    .select('workspace_id, user_id')
    .in('workspace_id', workspaceIds);

  if (membersError) {
    return new Response(JSON.stringify({ success: false, error: membersError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userIdsByWorkspace = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = userIdsByWorkspace.get(m.workspace_id) ?? [];
    list.push(m.user_id);
    userIdsByWorkspace.set(m.workspace_id, list);
  }

  const allUserIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: tokenRows, error: tokensError } = await adminClient
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', allUserIds.length > 0 ? allUserIds : ['00000000-0000-0000-0000-000000000000']);

  if (tokensError) {
    return new Response(JSON.stringify({ success: false, error: tokensError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  interface PushMessage {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
    channelId: string;
  }

  const messages: PushMessage[] = [];
  const deliveredReminderIds: string[] = [];

  for (const reminder of toSend) {
    const content = contentFor(
      reminder,
      reminder.obligation_id ? nextInstallmentByObligation.get(reminder.obligation_id) : undefined
    );
    if (!content) continue;

    const userIds = userIdsByWorkspace.get(reminder.workspace_id) ?? [];
    const tokens = userIds.flatMap((uid) => tokensByUser.get(uid) ?? []);

    if (tokens.length === 0) {
      // Kayıtlı push token yok (izin verilmemiş/hiç giriş yapılmamış cihaz) — push
      // gönderilecek bir şey yok ama satır yine de 'delivered' işaretlenir, aksi halde
      // her 15 dakikada bir tekrar işlenmeye çalışılırdı.
      deliveredReminderIds.push(reminder.id);
      continue;
    }

    for (const token of tokens) {
      messages.push({
        to: token,
        title: content.title,
        body: content.body,
        data: content.data,
        sound: 'default',
        channelId: CHANNEL_ID,
      });
    }
    deliveredReminderIds.push(reminder.id);
  }

  const staleTokens = new Set<string>();
  for (const batch of chunk(messages, EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const result = await response.json().catch(() => null);
      const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          staleTokens.add(batch[index].to);
        }
      });
    } catch (error) {
      console.error('[send-reminders] Expo push isteği başarısız', error);
    }
  }

  if (staleTokens.size > 0) {
    await adminClient.from('push_tokens').delete().in('token', [...staleTokens]);
  }

  if (deliveredReminderIds.length > 0) {
    await adminClient.from('reminders').update({ status: 'delivered' }).in('id', deliveredReminderIds);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent: deliveredReminderIds.length,
      pushMessages: messages.length,
      cancelled: toCancel.length,
      staleTokensRemoved: staleTokens.size,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
