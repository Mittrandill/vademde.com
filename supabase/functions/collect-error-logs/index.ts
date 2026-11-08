// Üretim hatalarını yönetim paneline taşır (vademde.app /admin → Hata kayıtları). pg_cron 5 dakikada
// bir çağırır. Loglar Supabase Management API'sinden okunur; yalnızca maskelenmiş metin ve sayılar
// saklanır, kullanıcı veya finans verisi saklanmaz. Yeni, yeniden açılan ya da ani artan hata
// yöneticinin cihazlarına push olarak gider.
// Gerekli secret: VADEMDE_LOGS_TOKEN (Supabase kişisel erişim jetonu; SUPABASE_ öneki yasaktır).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { classifyError, fingerprint, httpSummary, maskLogMessage, type ErrorSeverity } from '../_shared/errorFingerprint.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MANAGEMENT_TOKEN = Deno.env.get('VADEMDE_LOGS_TOKEN') ?? '';
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHANNEL_ID = 'obligation-reminders';
const MAX_WINDOW_MS = 23 * 60 * 60 * 1000;
const MINUTE = 60_000;

const POSTGRES_SQL = `select event_message, log_attributes['parsed.sql_state_code'] as code, log_attributes['parsed.error_severity'] as severity, count() as n, min(timestamp) as first_seen, max(timestamp) as last_seen from logs where source = 'postgres_logs' and log_attributes['parsed.error_severity'] in ('ERROR','FATAL','PANIC') group by event_message, code, severity order by n desc limit 1000`;
const HTTP_SQL = `select source, event_message, count() as n, min(timestamp) as first_seen, max(timestamp) as last_seen from logs where source in ('edge_logs','function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) >= 500 group by source, event_message order by n desc limit 1000`;
const FUNCTION_SQL = `select event_message, count() as n, min(timestamp) as first_seen, max(timestamp) as last_seen from logs where source = 'function_logs' and log_attributes['level'] = 'error' group by event_message order by n desc limit 1000`;

type LogRow = Record<string, string | number | null>;
type Group = {
  fingerprint: string;
  source: string;
  code: string;
  severity: ErrorSeverity;
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
};

async function queryLogs(sql: string, start: string, end: string): Promise<LogRow[]> {
  const url = new URL(`https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs`);
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', start);
  url.searchParams.set('iso_timestamp_end', end);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}` } });
  if (!response.ok) throw new Error(`logs_api_${response.status}`);
  const body = await response.json();
  if (body?.error) throw new Error('logs_api_query_failed');
  return (body?.result ?? []) as LogRow[];
}

function toIso(value: unknown): string {
  const text = String(value);
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`;
}

async function buildGroups(start: string, end: string): Promise<Group[]> {
  const [postgresRows, httpRows, functionRows] = await Promise.all([
    queryLogs(POSTGRES_SQL, start, end),
    queryLogs(HTTP_SQL, start, end),
    queryLogs(FUNCTION_SQL, start, end),
  ]);
  const groups = new Map<string, Group>();
  const add = async (source: string, code: string, message: string, severity: ErrorSeverity, row: LogRow) => {
    const key = await fingerprint(source, code, message);
    const count = Number(row.n) || 0;
    const firstSeen = toIso(row.first_seen);
    const lastSeen = toIso(row.last_seen);
    const current = groups.get(key);
    if (current) {
      current.count += count;
      if (firstSeen < current.first_seen) current.first_seen = firstSeen;
      if (lastSeen > current.last_seen) current.last_seen = lastSeen;
    } else {
      groups.set(key, { fingerprint: key, source, code, severity, message, count, first_seen: firstSeen, last_seen: lastSeen });
    }
  };

  for (const row of postgresRows) {
    const code = String(row.code ?? '');
    const message = maskLogMessage(String(row.event_message ?? ''));
    await add('postgres', code, message, classifyError({ code, postgresSeverity: String(row.severity ?? ''), message }), row);
  }
  for (const row of httpRows) {
    const summary = httpSummary(String(row.event_message ?? ''));
    if (!summary) continue;
    const source = row.source === 'function_edge_logs' ? 'function' : 'api';
    await add(source, summary.status, summary.message, classifyError({ code: summary.status, message: summary.message }), row);
  }
  for (const row of functionRows) {
    const message = maskLogMessage(String(row.event_message ?? ''));
    await add('function_log', 'function_error', message, classifyError({ code: 'function_error', message }), row);
  }
  return [...groups.values()];
}

async function notifyAdmins(tokens: string[], items: { message: string; count: number }[]) {
  if (!tokens.length || !items.length) return;
  const first = items[0];
  const body = items.length === 1
    ? `${first.message.slice(0, 140)} (${first.count} kez)`
    : `${items.length} hata türü. İlki: ${first.message.slice(0, 110)}`;
  const messages = tokens.map((to) => ({
    to,
    title: 'Vademde: yeni üretim hatası',
    body,
    data: { type: 'admin_error' },
    sound: 'default',
    channelId: CHANNEL_ID,
  }));
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

Deno.serve(async (_req: Request) => {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cursor, error: claimError } = await db.rpc('error_monitor_claim');
  if (claimError) {
    console.error('[collect-error-logs] claim başarısız', claimError.message);
    return Response.json({ success: false, error: 'claim_failed' }, { status: 500 });
  }
  if (!cursor) return Response.json({ success: true, skipped: 'recent_run' });

  if (!MANAGEMENT_TOKEN) {
    await db.rpc('error_monitor_fail', { p_error: 'VADEMDE_LOGS_TOKEN tanımlı değil' });
    return Response.json({ success: false, error: 'token_missing' });
  }

  try {
    const now = Math.floor(Date.now() / MINUTE) * MINUTE - MINUTE;
    const startMs = Math.max(new Date(cursor as string).getTime(), now - MAX_WINDOW_MS);
    if (startMs >= now) return Response.json({ success: true, groups: 0 });
    const start = new Date(startMs).toISOString();
    const end = new Date(now).toISOString();

    const groups = await buildGroups(start, end);
    const { data: toNotify, error: ingestError } = await db.rpc('error_monitor_ingest', {
      p_groups: groups,
      p_window_end: end,
    });
    if (ingestError) throw new Error(`ingest_failed: ${ingestError.message}`);

    const items = (toNotify ?? []) as { message: string; count: number }[];
    let notified = 0;
    if (items.length) {
      const { data: tokens, error: tokenError } = await db.rpc('error_monitor_admin_tokens');
      if (tokenError) throw new Error(`tokens_failed: ${tokenError.message}`);
      const list = ((tokens ?? []) as (string | { token: string })[]).map((t) => (typeof t === 'string' ? t : t.token));
      await notifyAdmins(list, items);
      notified = list.length;
    }
    return Response.json({ success: true, groups: groups.length, alerts: items.length, devices: notified });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[collect-error-logs] başarısız', message);
    await db.rpc('error_monitor_fail', { p_error: maskLogMessage(message) });
    return Response.json({ success: false, error: 'collect_failed' }, { status: 500 });
  }
});
