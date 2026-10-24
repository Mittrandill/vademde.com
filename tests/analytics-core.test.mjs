// Kullanım analitiği çekirdeği (services/analyticsCore.ts). Node 22.18+ gerekir. Ağ yok, sahte gönderici.
import assert from 'node:assert/strict';
import { createTracker, sanitizeProps } from '../services/analyticsCore.ts';

let checks = 0;
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
  console.log(`PASS ${message}`);
};

function setup(over = {}) {
  const state = { consent: true, signedIn: true, deliver: true, sent: [], n: 0 };
  const tracker = createTracker({
    platform: 'ios',
    appVersion: '1.0.7',
    sessionId: 'session-1',
    uuid: () => `evt-${++state.n}`,
    now: () => new Date('2026-10-24T10:00:00Z'),
    isConsented: () => state.consent,
    isSignedIn: () => state.signedIn,
    send: async (batch) => {
      if (!state.deliver) return false;
      state.sent.push(batch);
      return true;
    },
    ...over,
  });
  return { tracker, state };
}

// --- onay kapısı
let { tracker, state } = setup();
state.consent = false;
tracker.track('app_opened');
eq(tracker.size(), 0, 'izin yokken olay kuyruğa bile alınmaz');

({ tracker, state } = setup());
tracker.track('paywall_viewed', { screen: 'paywall' });
state.consent = false;
await tracker.flush();
eq([tracker.size(), state.sent.length], [0, 0], 'izin geri alınınca kuyruk silinir ve hiçbir şey gönderilmez');

// --- giriş şartı
({ tracker, state } = setup());
state.signedIn = false;
tracker.track('app_opened');
await tracker.flush();
eq([tracker.size(), state.sent.length], [1, 0], 'giriş yokken olay bekler, gönderilmez');
state.signedIn = true;
await tracker.flush();
eq([tracker.size(), state.sent.length], [0, 1], 'giriş yapılınca bekleyen olay gönderilir');

// --- olay biçimi
const event = state.sent[0][0];
eq(
  event,
  {
    event_id: 'evt-1',
    event_name: 'app_opened',
    platform: 'ios',
    session_id: 'session-1',
    app_version: '1.0.7',
    event_timestamp: '2026-10-24T10:00:00.000Z',
    properties: {},
  },
  'olay yalnızca sözleşmedeki alanları taşır (kullanıcı kimliği istemciden gitmez)'
);
eq('user_id' in event || 'anonymous_id' in event, false, 'user_id ve anonymous_id gönderilmez');

// --- izinli olay ve özellik listesi
({ tracker, state } = setup());
tracker.track('purchase_completed');
tracker.track('trial_started');
tracker.track('subscription_renewed');
tracker.track('bilinmeyen');
eq(tracker.size(), 0, 'ödeme sonucu ve bilinmeyen olaylar istemciden kabul edilmez');

eq(
  sanitizeProps({
    plan: 'plus',
    billing_period: 'yearly',
    email: 'a@b.c',
    amount: '1250',
    note: 'Ahmet',
    screen: 'x'.repeat(65),
    step: 3,
    feature: '',
  }),
  { plan: 'plus', billing_period: 'yearly' },
  'yalnızca izinli, kısa, dolu metin özellikleri kalır; e-posta, tutar, serbest metin, uzun ve sayısal değerler atılır'
);

// --- toplu gönderim ve yeniden deneme
({ tracker, state } = setup());
for (let i = 0; i < 120; i++) tracker.track('app_opened');
await tracker.flush();
eq(state.sent.map((b) => b.length), [50, 50, 20], 'olaylar en fazla 50\'lik partilerle gönderilir');

({ tracker, state } = setup());
tracker.track('plan_selected', { plan: 'isletme' });
state.deliver = false;
await tracker.flush();
eq(tracker.size(), 1, 'gönderim başarısızsa olay kaybolmaz');
state.deliver = true;
await tracker.flush();
eq([state.sent.length, state.sent[0][0].event_id], [1, 'evt-1'], 'yeniden denemede aynı event_id gider (sunucu tekrarı yok sayar)');

({ tracker, state } = setup({ maxQueue: 5 }));
state.deliver = false;
for (let i = 0; i < 9; i++) tracker.track('app_opened');
eq(tracker.size(), 5, 'kuyruk sınırı aşılınca en eski olaylar atılır (bellek şişmez)');

({ tracker, state } = setup({
  send: async () => {
    throw new Error('ağ');
  },
}));
tracker.track('app_opened');
await tracker.flush();
eq(tracker.size(), 1, 'gönderici hata fırlatsa bile takip uygulamayı bozmaz ve olay korunur');

({ tracker } = setup({
  isConsented: () => {
    throw new Error('okunamadı');
  },
}));
tracker.track('app_opened');
eq(tracker.size(), 0, 'izin okunamazsa olay atılır, hata dışarı sızmaz');

console.log(`\n${checks} checks passed`);
