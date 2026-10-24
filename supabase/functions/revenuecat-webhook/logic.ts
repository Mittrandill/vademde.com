// RevenueCat olaylarını subscriptions tablosuna yansıtan saf mantık. Deno'ya özgü hiçbir şey
// içermez; tests/revenuecat-webhook.test.mjs bunu Node ile sahte bir istemciyle sınar.
//
// Davranış değişmez: plan/durum yazımı eskisiyle aynı event tiplerinde aynı şekilde yapılır
// (erişim yalnızca `plan` sütununa bağlıdır — bkz. plan_for_owner). Eklenenler:
//  1. Her olay admin_private.rc_events defterine bir kez yazılır (idempotent). Defter hata verirse
//     webhook eskisi gibi çalışmaya devam eder; defter asla abonelik yazımını engellemez.
//  2. Zaten uygulanmış olay tekrar gelirse yeniden uygulanmaz.
//  3. Daha yeni bir olay uygulanmışsa eski/gecikmiş olay durumu ezmez.
//  4. Deneme (period_type=TRIAL) 'trialing' olarak, aylık/yıllık dönem billing_period olarak yazılır.

export interface RevenueCatEvent {
  id?: string;
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
  product_id?: string;
  period_type?: string;
  store?: string;
  environment?: string;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  is_trial_conversion?: boolean;
  cancel_reason?: string;
  price_in_purchased_currency?: number | null;
  currency?: string;
}

type DbResult = { data: unknown; error: { message: string } | null };
export interface DbClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult>;
  from(table: 'subscriptions'): {
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string }
    ): { throwOnError(): PromiseLike<unknown> };
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): { throwOnError(): PromiseLike<unknown> };
    };
  };
}

export type Outcome = 'applied' | 'ignored' | 'duplicate' | 'stale_skipped';

const ISLETME_ENTITLEMENT = 'isletme';
const STATE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
]);
const DAY_MS = 86_400_000;

export function resolvePlan(entitlementIds: string[] | undefined): 'plus' | 'isletme' {
  if (entitlementIds?.includes(ISLETME_ENTITLEMENT)) return 'isletme';
  return 'plus';
}

export function mapStore(store: string | undefined): string | null {
  if (store === 'APP_STORE') return 'app_store';
  if (store === 'PLAY_STORE') return 'play_store';
  if (store === 'PROMOTIONAL') return 'promotional';
  return null;
}

// Ürün kimliğinden, o yoksa dönem uzunluğundan çıkarılır. Deneme süresi dönem sayılmaz; emin
// olunamıyorsa null döner ve mevcut billing_period'a dokunulmaz.
export function inferBillingPeriod(event: RevenueCatEvent): 'monthly' | 'yearly' | null {
  const product = (event.product_id ?? '').toLowerCase();
  if (/(year|annual|yillik|yıllık)/.test(product)) return 'yearly';
  if (/(month|aylik|aylık)/.test(product)) return 'monthly';
  if (event.period_type === 'TRIAL') return null;
  const { purchased_at_ms: from, expiration_at_ms: to } = event;
  if (typeof from === 'number' && typeof to === 'number' && to > from) {
    const days = (to - from) / DAY_MS;
    if (days >= 330 && days <= 400) return 'yearly';
    if (days >= 25 && days <= 35) return 'monthly';
  }
  return null;
}

export function subscriptionStatus(event: RevenueCatEvent): 'trialing' | 'active' {
  return event.period_type === 'TRIAL' ? 'trialing' : 'active';
}

function ledgerPayload(event: RevenueCatEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    app_user_id: event.app_user_id,
    product_id: event.product_id,
    period_type: event.period_type,
    is_trial_conversion: event.is_trial_conversion,
    store: event.store,
    environment: event.environment,
    price_in_purchased_currency:
      typeof event.price_in_purchased_currency === 'number'
        ? String(event.price_in_purchased_currency)
        : undefined,
    currency: event.currency,
    cancel_reason: event.cancel_reason,
    event_timestamp_ms: event.event_timestamp_ms,
    purchased_at_ms: event.purchased_at_ms != null ? String(event.purchased_at_ms) : undefined,
    expiration_at_ms: event.expiration_at_ms != null ? String(event.expiration_at_ms) : undefined,
  };
}

// Defter hatası (ör. fonksiyon henüz yok, ağ sorunu) ASLA webhook'u düşürmez.
async function record(
  client: DbClient,
  event: RevenueCatEvent
): Promise<{ recorded: boolean; duplicate: boolean; stale: boolean }> {
  if (!event.id || typeof event.event_timestamp_ms !== 'number') {
    return { recorded: false, duplicate: false, stale: false };
  }
  try {
    const { data, error } = await client.rpc('analytics_record_rc_event', {
      p_event: ledgerPayload(event),
    });
    if (error || !data || typeof data !== 'object') {
      return { recorded: false, duplicate: false, stale: false };
    }
    const result = data as { recorded?: boolean; duplicate?: boolean; stale?: boolean };
    return {
      recorded: result.recorded === true,
      duplicate: result.duplicate === true,
      stale: result.stale === true,
    };
  } catch {
    return { recorded: false, duplicate: false, stale: false };
  }
}

async function mark(client: DbClient, event: RevenueCatEvent, result: string): Promise<void> {
  if (!event.id) return;
  try {
    await client.rpc('analytics_mark_rc_event', { p_event_id: event.id, p_result: result });
  } catch {
    // Uygulama sonucu işaretlenemezse bir sonraki tekrar teslimat olayı yeniden uygular; plan
    // yazımları idempotent olduğu için sorun olmaz.
  }
}

export async function processEvent(client: DbClient, event: RevenueCatEvent): Promise<Outcome> {
  const ledger = await record(client, event);
  if (ledger.recorded && ledger.duplicate) return 'duplicate';
  if (ledger.recorded && ledger.stale && STATE_TYPES.has(event.type)) {
    await mark(client, event, 'stale_skipped');
    return 'stale_skipped';
  }

  const ownerId = event.app_user_id;
  const now = new Date().toISOString();
  let outcome: Outcome = 'applied';
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION': {
      const billingPeriod = inferBillingPeriod(event);
      await client
        .from('subscriptions')
        .upsert(
          {
            owner_id: ownerId,
            plan: resolvePlan(event.entitlement_ids),
            status: subscriptionStatus(event),
            store: mapStore(event.store),
            revenuecat_app_user_id: ownerId,
            current_period_end: event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            will_renew: true,
            updated_at: now,
            // Çıkarılamadıysa alan hiç gönderilmez; var olan değer ezilmez.
            ...(billingPeriod ? { billing_period: billingPeriod } : {}),
          },
          { onConflict: 'owner_id' }
        )
        .throwOnError();
      break;
    }
    case 'CANCELLATION': {
      // Dönem sonuna kadar erişim devam eder; plan düşürülmez, sadece yenilenmeyecek.
      await client
        .from('subscriptions')
        .update({ will_renew: false, updated_at: now })
        .eq('owner_id', ownerId)
        .throwOnError();
      break;
    }
    case 'EXPIRATION': {
      await client
        .from('subscriptions')
        .upsert(
          { owner_id: ownerId, plan: 'free', status: 'expired', will_renew: false, updated_at: now },
          { onConflict: 'owner_id' }
        )
        .throwOnError();
      break;
    }
    case 'BILLING_ISSUE': {
      await client
        .from('subscriptions')
        .update({ status: 'grace_period', updated_at: now })
        .eq('owner_id', ownerId)
        .throwOnError();
      break;
    }
    default:
      // Diğer event tipleri (TRANSFER, TEST vb.) abonelik durumunu değiştirmez; yalnızca deftere yazılır.
      outcome = 'ignored';
  }
  if (ledger.recorded) await mark(client, event, outcome === 'applied' ? 'applied' : 'ignored');
  return outcome;
}
