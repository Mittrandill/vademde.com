// Destek kutusundan (vademde.app admin konsolu) kullanıcıya cevap. Cevabı admin_support_reply
// RPC'si yazar — çağıranın JWT'siyle çalıştığı için admin + MFA (aal2) kontrolü veritabanında
// yapılır (admin_private.require_admin). Ardından talep sahibinin cihazlarına "Destek talebi
// hakkında" push'u gönderilir; dokunulunca uygulama ilgili destek sohbetini açar
// (bkz. services/notificationRouting.ts — { type: 'support', messageId }).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveLocale } from '../_shared/locale.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHANNEL_ID = 'obligation-reminders';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TITLES = { tr: 'Destek talebi hakkında', en: 'About your support request' } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Bildirim gövdesi kısa tutulur; cevabın tamamı uygulamadaki sohbette okunur.
function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const payload = await req.json().catch(() => null);
  const messageId = typeof payload?.messageId === 'string' ? payload.messageId : '';
  const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
  if (!UUID_PATTERN.test(messageId) || body.length === 0 || body.length > 5000) {
    return json({ error: 'invalid_input' }, 400);
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: reply, error: replyError } = await authedClient.rpc('admin_support_reply', {
    p_id: messageId,
    p_body: body,
  });
  if (replyError) {
    const forbidden = replyError.code === '42501';
    return json({ error: forbidden ? 'forbidden' : 'reply_failed' }, forbidden ? 403 : 400);
  }

  const userId: string | null = reply?.user_id ?? null;
  if (!userId) return json({ replyId: reply?.reply_id, pushed: 0 });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: tokenRows }, { data: profile }] = await Promise.all([
    adminClient.from('push_tokens').select('token').eq('user_id', userId),
    adminClient.from('profiles').select('locale').eq('id', userId).maybeSingle(),
  ]);
  const tokens = (tokenRows ?? []).map((row: { token: string }) => row.token);
  if (tokens.length === 0) return json({ replyId: reply?.reply_id, pushed: 0 });

  const locale = resolveLocale(profile?.locale);
  const messages = tokens.map((token: string) => ({
    to: token,
    title: TITLES[locale],
    body: preview(body),
    data: { type: 'support', messageId },
    sound: 'default',
    channelId: CHANNEL_ID,
  }));

  let pushed = 0;
  const staleTokens: string[] = [];
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json().catch(() => null);
    const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data ?? [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') pushed += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') staleTokens.push(messages[index].to);
    });
  } catch (error) {
    console.error('[support-reply] Expo push isteği başarısız', error);
  }
  if (staleTokens.length > 0) await adminClient.from('push_tokens').delete().in('token', staleTokens);

  return json({ replyId: reply?.reply_id, pushed });
});
