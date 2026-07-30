// docs/10-abonelik-gelir-modeli.md — RevenueCat, App Store makbuzunu kendi
// sunucularında doğrular ve buradaki webhook'u çağırır; biz yalnızca event'i
// subscriptions tablosuna yansıtırız. Diğer Edge Function'ların aksine burada
// çağıranın bir kullanıcı JWT'si yoktur — RevenueCat sunucusu doğrudan çağırır,
// bu yüzden authedClient/adminClient ikilisi yerine paylaşılan bir webhook
// secret'ı doğrulanır.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!;

const ISLETME_ENTITLEMENT = 'isletme';

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  store?: string;
}

interface RevenueCatWebhookBody {
  event: RevenueCatEvent;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolvePlan(entitlementIds: string[] | undefined): 'plus' | 'isletme' {
  if (entitlementIds?.includes(ISLETME_ENTITLEMENT)) return 'isletme';
  return 'plus';
}

function mapStore(store: string | undefined): string | null {
  if (store === 'APP_STORE') return 'app_store';
  if (store === 'PLAY_STORE') return 'play_store';
  if (store === 'PROMOTIONAL') return 'promotional';
  return null;
}

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
  const ownerId = event.app_user_id;

  try {
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION': {
        await adminClient.from('subscriptions').upsert(
          {
            owner_id: ownerId,
            plan: resolvePlan(event.entitlement_ids),
            status: 'active',
            store: mapStore(event.store),
            revenuecat_app_user_id: ownerId,
            current_period_end: event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            will_renew: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id' }
        );
        break;
      }
      case 'CANCELLATION': {
        // Dönem sonuna kadar erişim devam eder; plan düşürülmez, sadece yenilenmeyecek.
        await adminClient
          .from('subscriptions')
          .update({ will_renew: false, updated_at: new Date().toISOString() })
          .eq('owner_id', ownerId);
        break;
      }
      case 'EXPIRATION': {
        await adminClient.from('subscriptions').upsert(
          {
            owner_id: ownerId,
            plan: 'free',
            status: 'expired',
            will_renew: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id' }
        );
        break;
      }
      case 'BILLING_ISSUE': {
        await adminClient
          .from('subscriptions')
          .update({ status: 'grace_period', updated_at: new Date().toISOString() })
          .eq('owner_id', ownerId);
        break;
      }
      default:
        // Diğer event tipleri (TRANSFER, TEST vb.) v1'de yok sayılır.
        break;
    }

    return new Response(JSON.stringify({ success: true }), {
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
