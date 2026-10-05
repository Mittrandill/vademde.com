// Nakit uyarısı bildirimi (design/vademde-redesign/PLANLAR.md §5.6). pg_cron günde bir kez (06:00 UTC =
// 09:00 TR) çağırır; verify_jwt=true, send-reminders ile aynı yetkilendirme desenidir. Mevcut
// send-reminders fonksiyonuna dokunmamak için ayrı bir fonksiyondur.
// Mantık features/cashflow/forecast.ts ile aynıdır: TL hesapların güncel bakiyesi − o hesaba bağlı
// (obligations.account_id) ödemeler + tahsilatlar; 14 gün içinde sıfırın altına inen hesap için push.
// Aynı hesap için en fazla 7 günde bir bildirim (cash_alert_log).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHANNEL_ID = 'obligation-reminders';
const WINDOW_DAYS = 14;
const MIN_DAYS_BETWEEN_ALERTS = 7;
const ACTIVE_STATUSES = ['taslak', 'inceleme_gerekli', 'bekliyor', 'kismen_odendi', 'gecikti', 'kismen_tahsil_edildi'];

const tl = (minor: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(minor / 100);
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Deno.serve(async (_req: Request) => {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const todayIso = isoDay(new Date());
  const limit = new Date();
  limit.setDate(limit.getDate() + WINDOW_DAYS);
  const limitIso = isoDay(limit);

  // Yalnızca push token'ı olan çalışma alanları işlenir.
  const { data: tokenRows } = await db.from('push_tokens').select('user_id, token');
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows ?? []) tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
  if (tokensByUser.size === 0) return Response.json({ success: true, alerts: 0 });

  const { data: members } = await db
    .from('workspace_members')
    .select('workspace_id, user_id')
    .in('user_id', [...tokensByUser.keys()]);
  const usersByWorkspace = new Map<string, string[]>();
  for (const m of members ?? []) usersByWorkspace.set(m.workspace_id, [...(usersByWorkspace.get(m.workspace_id) ?? []), m.user_id]);

  const messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: 'default'; channelId: string }[] = [];
  const logRows: { workspace_id: string; account_id: string }[] = [];

  for (const [workspaceId, userIds] of usersByWorkspace) {
    const { data: accounts } = await db
      .from('accounts')
      .select('id, name, type, currency_code, opening_balance_minor')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .eq('currency_code', 'TRY')
      .neq('type', 'credit_card');
    if (!accounts?.length) continue;

    const { data: transactions } = await db
      .from('transactions')
      .select('account_id, transfer_to_account_id, direction, amount_minor')
      .eq('workspace_id', workspaceId);
    const deltas = new Map<string, number>();
    const add = (id: string, v: number) => deltas.set(id, (deltas.get(id) ?? 0) + v);
    for (const tx of transactions ?? []) {
      if (tx.direction === 'income') add(tx.account_id, tx.amount_minor);
      else if (tx.direction === 'expense') add(tx.account_id, -tx.amount_minor);
      else if (tx.direction === 'transfer') {
        add(tx.account_id, -tx.amount_minor);
        if (tx.transfer_to_account_id) add(tx.transfer_to_account_id, tx.amount_minor);
      }
    }

    const accountIds = accounts.map((a) => a.id);
    const { data: obligations } = await db
      .from('obligations')
      .select('id, direction, account_id, due_date, remaining_amount_minor, currency_code')
      .eq('workspace_id', workspaceId)
      .in('account_id', accountIds)
      .in('status', ACTIVE_STATUSES)
      .eq('currency_code', 'TRY');
    if (!obligations?.length) continue;

    const obligationIds = obligations.map((o) => o.id);
    const { data: installments } = await db
      .from('installments')
      .select('obligation_id, due_date, remaining_amount_minor')
      .in('obligation_id', obligationIds)
      .gt('remaining_amount_minor', 0)
      .neq('status', 'iptal_edildi');
    const installmentsByObligation = new Map<string, { due_date: string; remaining_amount_minor: number }[]>();
    for (const i of installments ?? []) {
      installmentsByObligation.set(i.obligation_id, [...(installmentsByObligation.get(i.obligation_id) ?? []), i]);
    }

    const { data: recent } = await db
      .from('cash_alert_log')
      .select('account_id')
      .eq('workspace_id', workspaceId)
      .gte('sent_at', new Date(Date.now() - MIN_DAYS_BETWEEN_ALERTS * 86_400_000).toISOString());
    const recentlyAlerted = new Set((recent ?? []).map((r) => r.account_id));

    for (const account of accounts) {
      if (recentlyAlerted.has(account.id)) continue;
      const events = new Map<string, number>();
      for (const o of obligations.filter((x) => x.account_id === account.id)) {
        const rows = installmentsByObligation.get(o.id) ?? [
          o.due_date ? { due_date: o.due_date, remaining_amount_minor: o.remaining_amount_minor } : null,
        ].filter(Boolean) as { due_date: string; remaining_amount_minor: number }[];
        for (const row of rows) {
          if (row.remaining_amount_minor <= 0 || row.due_date > limitIso) continue;
          const key = row.due_date < todayIso ? todayIso : row.due_date;
          events.set(key, (events.get(key) ?? 0) + (o.direction === 'payable' ? -row.remaining_amount_minor : row.remaining_amount_minor));
        }
      }
      if (events.size === 0) continue;

      let balance = account.opening_balance_minor + (deltas.get(account.id) ?? 0);
      let lowest = balance;
      let firstNegativeDate: string | null = null;
      for (let i = 0; i <= WINDOW_DAYS; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const key = isoDay(d);
        balance += events.get(key) ?? 0;
        if (balance < lowest) lowest = balance;
        if (balance < 0 && !firstNegativeDate) firstNegativeDate = key;
      }
      if (!firstNegativeDate) continue;

      for (const userId of userIds) {
        for (const token of tokensByUser.get(userId) ?? []) {
          messages.push({
            to: token,
            title: 'Nakit uyarısı',
            body: `${account.name} ${dayMonth.format(new Date(firstNegativeDate))} tarihinde eksiye düşebilir (en düşük ${tl(lowest)}).`,
            data: { accountId: account.id, type: 'cash_alert' },
            sound: 'default',
            channelId: CHANNEL_ID,
          });
        }
      }
      logRows.push({ workspace_id: workspaceId, account_id: account.id });
    }
  }

  const staleTokens = new Set<string>();
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const result = await response.json().catch(() => null);
      ((result?.data ?? []) as { status: string; details?: { error?: string } }[]).forEach((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') staleTokens.add(batch[index].to);
      });
    } catch (error) {
      console.error('[send-cash-alerts] Expo push isteği başarısız', error);
    }
  }
  if (staleTokens.size > 0) await db.from('push_tokens').delete().in('token', [...staleTokens]);
  if (logRows.length > 0) await db.from('cash_alert_log').insert(logRows);

  return Response.json({ success: true, alerts: logRows.length, pushMessages: messages.length });
});
