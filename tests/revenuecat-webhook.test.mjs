// RevenueCat webhook mantığı (supabase/functions/revenuecat-webhook/logic.ts) sahte bir
// istemciyle sınanır. Gerçek veritabanına bağlanmaz. Gerekli: Node 22.18+ (TypeScript'i doğrudan okur).
import assert from 'node:assert/strict';
import { processEvent, inferBillingPeriod } from '../supabase/functions/revenuecat-webhook/logic.ts';

let checks = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
  console.log(`PASS ${message}`);
};

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = Date.now();
const DAY = 86_400_000;

// Defter sözleşmesini taklit eder: aynı id'li uygulanmış olay "duplicate", daha yeni uygulanmış
// olay varsa "stale". (Gerçek davranış tests/admin-analytics-database.mjs içinde SQL ile sınanır.)
function fakeClient({ ledger = 'ok', failWrites = false } = {}) {
  const log = { upserts: [], updates: [], rpcs: [] };
  const state = { failWrites };
  const store = new Map(); // event_id -> { ts, result }
  const client = {
    log,
    state,
    rpc: async (fn, args) => {
      log.rpcs.push({ fn, args });
      if (ledger === 'throws') throw new Error('network');
      if (ledger === 'error') return { data: null, error: { message: 'function does not exist' } };
      if (fn === 'analytics_record_rc_event') {
        const e = args.p_event;
        const existing = store.get(e.id);
        if (!existing) store.set(e.id, { ts: e.event_timestamp_ms, result: null });
        const row = store.get(e.id);
        const stale = [...store.entries()].some(
          ([id, v]) => id !== e.id && v.result === 'applied' && v.ts > row.ts
        );
        return { data: { recorded: true, duplicate: row.result !== null, stale }, error: null };
      }
      if (fn === 'analytics_mark_rc_event') {
        const row = store.get(args.p_event_id);
        if (row) row.result = args.p_result;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      upsert: (row, options) => ({
        throwOnError: async () => {
          if (state.failWrites) throw new Error('db down');
          log.upserts.push({ row, options });
        },
      }),
      update: (row) => ({
        eq: (column, value) => ({
          throwOnError: async () => {
            if (state.failWrites) throw new Error('db down');
            log.updates.push({ row, column, value });
          },
        }),
      }),
    }),
  };
  return client;
}
const ev = (over = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  type: 'INITIAL_PURCHASE',
  app_user_id: USER,
  entitlement_ids: ['plus'],
  product_id: 'vademde_plus_monthly',
  period_type: 'NORMAL',
  store: 'APP_STORE',
  environment: 'PRODUCTION',
  event_timestamp_ms: NOW,
  purchased_at_ms: NOW,
  expiration_at_ms: NOW + 30 * DAY,
  ...over,
});

// --- billing period inference
eq(inferBillingPeriod(ev({ product_id: 'x_yearly' })), 'yearly', 'product id with "yearly" -> yearly');
eq(inferBillingPeriod(ev({ product_id: 'x_annual' })), 'yearly', 'product id with "annual" -> yearly');
eq(inferBillingPeriod(ev({ product_id: 'x_aylik' })), 'monthly', 'product id with "aylik" -> monthly');
eq(inferBillingPeriod(ev({ product_id: 'p1', expiration_at_ms: NOW + 365 * DAY })), 'yearly', '365-day period -> yearly');
eq(inferBillingPeriod(ev({ product_id: 'p1', expiration_at_ms: NOW + 31 * DAY })), 'monthly', '31-day period -> monthly');
eq(inferBillingPeriod(ev({ product_id: 'p1', expiration_at_ms: NOW + 90 * DAY })), null, 'ambiguous 90-day period -> unknown');
eq(inferBillingPeriod(ev({ product_id: 'p1', period_type: 'TRIAL', expiration_at_ms: NOW + 30 * DAY })), null, 'a trial length is never read as the billing period');

// --- state writes keep today's behaviour
let c = fakeClient();
eq(await processEvent(c, ev()), 'applied', 'purchase is applied');
let row = c.log.upserts[0].row;
eq([row.plan, row.status, row.store, row.will_renew, row.billing_period], ['plus', 'active', 'app_store', true, 'monthly'], 'purchase writes plan/status/store/will_renew and the inferred billing period');
eq(c.log.upserts[0].options, { onConflict: 'owner_id' }, 'upsert key is unchanged');

c = fakeClient();
await processEvent(c, ev({ entitlement_ids: ['isletme'] }));
eq(c.log.upserts[0].row.plan, 'isletme', 'isletme entitlement -> isletme plan');

c = fakeClient();
await processEvent(c, ev({ period_type: 'TRIAL', product_id: 'vademde_plus_yearly', expiration_at_ms: NOW + 7 * DAY }));
eq([c.log.upserts[0].row.status, c.log.upserts[0].row.billing_period], ['trialing', 'yearly'], 'a trial is stored as trialing with the product billing period');

c = fakeClient();
await processEvent(c, ev({ product_id: 'p1', period_type: 'TRIAL', expiration_at_ms: NOW + 7 * DAY }));
ok(!('billing_period' in c.log.upserts[0].row), 'unknown billing period is omitted so an existing value is never overwritten');

c = fakeClient();
await processEvent(c, ev({ type: 'RENEWAL', is_trial_conversion: true }));
eq(c.log.upserts[0].row.status, 'active', 'trial conversion renewal is active');

c = fakeClient();
await processEvent(c, ev({ type: 'CANCELLATION' }));
eq(c.log.updates[0], { row: { will_renew: false, updated_at: c.log.updates[0].row.updated_at }, column: 'owner_id', value: USER }, 'cancellation only stops renewal; plan is untouched');
eq(c.log.upserts.length, 0, 'cancellation does not downgrade the plan');

c = fakeClient();
await processEvent(c, ev({ type: 'EXPIRATION' }));
row = c.log.upserts[0].row;
eq([row.plan, row.status, row.will_renew], ['free', 'expired', false], 'expiration returns the member to free');

c = fakeClient();
await processEvent(c, ev({ type: 'BILLING_ISSUE' }));
eq(c.log.updates[0].row.status, 'grace_period', 'billing issue -> grace_period');

c = fakeClient();
eq(await processEvent(c, ev({ type: 'TEST' })), 'ignored', 'TEST events do not change subscriptions');
eq(c.log.upserts.length + c.log.updates.length, 0, 'ignored events write nothing');
ok(c.log.rpcs.some((r) => r.fn === 'analytics_record_rc_event'), 'ignored events are still recorded in the ledger');

// --- idempotency and ordering
c = fakeClient();
const first = ev({ id: 'same', event_timestamp_ms: NOW });
await processEvent(c, first);
eq(await processEvent(c, first), 'duplicate', 'an event already applied is a duplicate');
eq(c.log.upserts.length, 1, 'a duplicate delivery does not write again');

c = fakeClient();
await processEvent(c, ev({ id: 'renew', type: 'RENEWAL', event_timestamp_ms: NOW }));
eq(await processEvent(c, ev({ id: 'late-cancel', type: 'CANCELLATION', event_timestamp_ms: NOW - 60_000 })), 'stale_skipped', 'a late, older event is skipped');
eq(c.log.updates.length, 0, 'a stale cancellation does not overwrite newer state');
eq(await processEvent(c, ev({ id: 'late-test', type: 'TEST', event_timestamp_ms: NOW - 60_000 })), 'ignored', 'non-state events are never reported as stale');

// --- the ledger must never block subscription writes
for (const mode of ['throws', 'error']) {
  c = fakeClient({ ledger: mode });
  eq(await processEvent(c, ev()), 'applied', `ledger ${mode}: the purchase is still applied`);
  eq(c.log.upserts.length, 1, `ledger ${mode}: the subscription is still written`);
}
c = fakeClient();
await processEvent(c, ev({ id: undefined }));
eq(c.log.upserts.length, 1, 'an event without an id is still applied');

// --- a failed write must surface (webhook returns 500, RevenueCat retries) and must not be marked applied
c = fakeClient({ failWrites: true });
const retried = ev({ id: 'w1' });
await assert.rejects(processEvent(c, retried), /db down/);
checks++;
console.log('PASS a failed subscription write rejects so RevenueCat retries');
ok(!c.log.rpcs.some((r) => r.fn === 'analytics_mark_rc_event'), 'a failed write is never marked as applied');
c.state.failWrites = false;
eq(await processEvent(c, retried), 'applied', 'the retry of a failed event is applied (recorded-but-unapplied is not a duplicate)');
eq(c.log.upserts.length, 1, 'the retry writes the subscription exactly once');

console.log(`\n${checks} checks passed`);
