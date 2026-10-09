// Nakit uyarısı bildirimi (design/vademde-redesign/PLANLAR.md §5.6). pg_cron günde bir kez (06:00 UTC =
// 09:00 TR) çağırır; verify_jwt=true, send-reminders ile aynı yetkilendirme desenidir. Mevcut
// send-reminders fonksiyonuna dokunmamak için ayrı bir fonksiyondur.
// Mantık features/cashflow/forecast.ts + useCashForecasts.ts ile aynıdır: TL hesapların güncel bakiyesi
// − o hesaba bağlı (obligations.account_id) ödemeler + tahsilatlar; 14 gün içinde sıfırın altına inen
// hesap için push. Hesabı atanmamış TL kayıt varsa ayrıca "tüm TL hesaplar" toplamı da izlenir (hiçbir
// hesabın tahminine girmeyen vadeler yüzünden eksiye düşme kaçmasın). Vadesi geçmiş alacak tahsil
// edilmiş sayılmaz; vadesi geçmiş borç bugün çıkar. Tüm sorgular sayfalıdır (Supabase 1.000 satır sınırı).
// Aynı hesap (toplam için sabit kimlik) için en fazla 7 günde bir bildirim (cash_alert_log).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHANNEL_ID = 'obligation-reminders';
const WINDOW_DAYS = 14;
const MIN_DAYS_BETWEEN_ALERTS = 7;
// Toplam uyarının cash_alert_log.account_id değeri (sütun uuid, hesaba FK yok).
const TOTAL_ALERT_ID = '00000000-0000-0000-0000-000000000000';
const ACTIVE_STATUSES = ['taslak', 'inceleme_gerekli', 'bekliyor', 'kismen_odendi', 'gecikti', 'kismen_tahsil_edildi'];

const tl = (minor: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(minor / 100);
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Db = ReturnType<typeof createClient>;

// Supabase tek istekte en fazla 1.000 satır döndürür; sayfa sayfa okunur (kararlı sıralama için id).
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

type DueItem = { accountId: string | null; direction: string; dueDate: string; amountMinor: number };

// Pencere içindeki vade kalemleri: taksitli kayıtlar taksit vadelerinden, diğerleri kaydın kendi vadesinden.
async function loadDueItems(db: Db, workspaceId: string, todayIso: string, limitIso: string): Promise<DueItem[]> {
  const obligations = await fetchAll<{
    id: string;
    direction: string;
    account_id: string | null;
    due_date: string | null;
    remaining_amount_minor: number;
  }>((from, to) =>
    db
      .from('obligations')
      .select('id, direction, account_id, due_date, remaining_amount_minor')
      .eq('workspace_id', workspaceId)
      .in('status', ACTIVE_STATUSES)
      .eq('currency_code', 'TRY')
      .order('id')
      .range(from, to)
  );
  if (obligations.length === 0) return [];

  const installmentsByObligation = new Map<string, { due_date: string; remaining_amount_minor: number }[]>();
  for (let i = 0; i < obligations.length; i += 100) {
    const chunk = obligations.slice(i, i + 100).map((o) => o.id);
    const installments = await fetchAll<{ obligation_id: string; due_date: string; remaining_amount_minor: number }>(
      (from, to) =>
        db
          .from('installments')
          .select('obligation_id, due_date, remaining_amount_minor')
          .in('obligation_id', chunk)
          .neq('status', 'iptal_edildi')
          .order('id')
          .range(from, to)
    );
    for (const row of installments) {
      installmentsByObligation.set(row.obligation_id, [...(installmentsByObligation.get(row.obligation_id) ?? []), row]);
    }
  }

  const items: DueItem[] = [];
  for (const o of obligations) {
    // Taksit planı varsa vadeler taksitlerden gelir (kaydın kendi vadesi ilk taksit tarihidir).
    const rows = installmentsByObligation.get(o.id) ?? (o.due_date ? [{ due_date: o.due_date, remaining_amount_minor: o.remaining_amount_minor }] : []);
    for (const row of rows) {
      if (row.remaining_amount_minor <= 0 || row.due_date > limitIso) continue;
      const overdue = row.due_date < todayIso;
      // Vadesi geçmiş alacağın tahsil edileceği belli değildir: tahmine girmez. Vadesi geçmiş borç bugün çıkar.
      if (overdue && o.direction === 'receivable') continue;
      items.push({
        accountId: o.account_id,
        direction: o.direction,
        dueDate: overdue ? todayIso : row.due_date,
        amountMinor: row.remaining_amount_minor,
      });
    }
  }
  return items;
}

// Başlangıç bakiyesinden gün gün ilerler; ilk eksi gün ve pencere içindeki en düşük bakiye.
function project(startBalance: number, items: DueItem[]): { firstNegativeDate: string | null; lowest: number } {
  const events = new Map<string, number>();
  for (const item of items) {
    events.set(item.dueDate, (events.get(item.dueDate) ?? 0) + (item.direction === 'payable' ? -item.amountMinor : item.amountMinor));
  }
  let balance = startBalance;
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
  return { firstNegativeDate, lowest };
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

    const transactions = await fetchAll<{
      account_id: string;
      transfer_to_account_id: string | null;
      direction: string;
      amount_minor: number;
    }>((from, to) =>
      db
        .from('transactions')
        .select('account_id, transfer_to_account_id, direction, amount_minor')
        .eq('workspace_id', workspaceId)
        .order('id')
        .range(from, to)
    );
    const deltas = new Map<string, number>();
    const add = (id: string, v: number) => deltas.set(id, (deltas.get(id) ?? 0) + v);
    for (const tx of transactions) {
      if (tx.direction === 'income') add(tx.account_id, tx.amount_minor);
      else if (tx.direction === 'expense') add(tx.account_id, -tx.amount_minor);
      else if (tx.direction === 'transfer') {
        add(tx.account_id, -tx.amount_minor);
        if (tx.transfer_to_account_id) add(tx.transfer_to_account_id, tx.amount_minor);
      }
    }

    const items = await loadDueItems(db, workspaceId, todayIso, limitIso);
    if (items.length === 0) continue;

    const { data: recent } = await db
      .from('cash_alert_log')
      .select('account_id')
      .eq('workspace_id', workspaceId)
      .gte('sent_at', new Date(Date.now() - MIN_DAYS_BETWEEN_ALERTS * 86_400_000).toISOString());
    const recentlyAlerted = new Set((recent ?? []).map((r: { account_id: string }) => r.account_id));

    const notify = (title: string, body: string, accountKey: string, logId: string) => {
      for (const userId of userIds) {
        for (const token of tokensByUser.get(userId) ?? []) {
          messages.push({
            to: token,
            title,
            body,
            data: { accountId: accountKey, type: 'cash_alert' },
            sound: 'default',
            channelId: CHANNEL_ID,
          });
        }
      }
      logRows.push({ workspace_id: workspaceId, account_id: logId });
    };

    let accountAlerts = 0;
    for (const account of accounts) {
      if (recentlyAlerted.has(account.id)) continue;
      const accountItems = items.filter((x) => x.accountId === account.id);
      if (accountItems.length === 0) continue;
      const start = account.opening_balance_minor + (deltas.get(account.id) ?? 0);
      const { firstNegativeDate, lowest } = project(start, accountItems);
      if (!firstNegativeDate) continue;
      notify(
        'Nakit uyarısı',
        `${account.name} ${dayMonth.format(new Date(firstNegativeDate))} tarihinde eksiye düşebilir (en düşük ${tl(lowest)}).`,
        account.id,
        account.id
      );
      accountAlerts += 1;
    }

    // Hesabı atanmamış TL kayıt varsa hiçbir hesabın tahminine girmemiştir: tüm TL hesapların toplam
    // bakiyesine tüm kayıtlar uygulanır. Hesap bazlı uyarı zaten gittiyse aynı sorun için ikinci
    // bildirim gönderilmez.
    const accountAlertedRecently = accounts.some((a: { id: string }) => recentlyAlerted.has(a.id));
    if (accountAlerts === 0 && !accountAlertedRecently && !recentlyAlerted.has(TOTAL_ALERT_ID) && items.some((x) => !x.accountId)) {
      const startTotal = accounts.reduce(
        (sum: number, a: { id: string; opening_balance_minor: number }) => sum + a.opening_balance_minor + (deltas.get(a.id) ?? 0),
        0
      );
      const { firstNegativeDate, lowest } = project(startTotal, items);
      if (firstNegativeDate) {
        notify(
          'Nakit uyarısı',
          `Hesabı atanmamış ödemeler dahil, toplam TL bakiyen ${dayMonth.format(new Date(firstNegativeDate))} tarihinde eksiye düşebilir (en düşük ${tl(lowest)}).`,
          'toplam',
          TOTAL_ALERT_ID
        );
      }
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
