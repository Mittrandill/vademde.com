// docs/10-abonelik-gelir-modeli.md — RevenueCat, App Store makbuzunu kendi
// sunucularında doğrular ve buradaki webhook'u çağırır; biz yalnızca event'i
// subscriptions tablosuna yansıtırız. Diğer Edge Function'ların aksine burada
// çağıranın bir kullanıcı JWT'si yoktur — RevenueCat sunucusu doğrudan çağırır,
// bu yüzden authedClient/adminClient ikilisi yerine paylaşılan bir webhook
// secret'ı doğrulanır.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { processEvent, type DbClient, type RevenueCatEvent } from './logic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!;

interface RevenueCatWebhookBody {
  event: RevenueCatEvent;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== REVENUECAT_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Yetkisiz istek' }), { status: 401 });
  }

  let body: RevenueCatWebhookBody;
  try {
    body = (await req.json()) as RevenueCatWebhookBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz istek gövdesi' }), { status: 400 });
  }

  const event = body.event;
  if (!event?.app_user_id || !UUID_RE.test(event.app_user_id)) {
    return new Response(JSON.stringify({ error: 'app_user_id eksik veya geçersiz' }), { status: 400 });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Plan/durum yazımı ve olay defteri logic.ts içinde; bkz. oradaki başlık yorumu.
    const outcome = await processEvent(adminClient as unknown as DbClient, event);
    return new Response(JSON.stringify({ success: true, outcome }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
