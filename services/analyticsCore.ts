// Kullanım analitiği çekirdeği: React Native'e bağımlı değildir, tests/analytics-core.test.mjs
// bunu Node ile sınar. Gerçek bağlantılar services/analytics.ts içindedir.
//
// Kurallar (docs/analytics-mobile-sdk.md ve yönetim merkezi sözleşmesi):
//  1. Kullanıcı açıkça izin vermeden hiçbir olay kuyruğa bile alınmaz; izin geri alınınca kuyruk silinir.
//  2. Yalnızca giriş yapmış kullanıcı için gönderilir (sunucu anonim oturumu reddeder).
//  3. Yalnızca aşağıdaki olay adları ve özellik anahtarları kullanılır; tutar, ad, e-posta, belge
//     içeriği gibi hiçbir şey gönderilmez (sunucu da aynı listeyle süzer).
//  4. Ödeme sonuçları (satın alma, deneme, yenileme…) istemciden gönderilmez; RevenueCat'ten türetilir.
//  5. Hata sessizdir: takip asla uygulama akışını bozmaz.

export type AnalyticsEventName =
  | 'app_opened'
  | 'paywall_viewed'
  | 'plan_selected'
  | 'checkout_started';

const EVENT_NAMES: ReadonlySet<string> = new Set<AnalyticsEventName>([
  'app_opened',
  'paywall_viewed',
  'plan_selected',
  'checkout_started',
]);

const PROP_KEYS: ReadonlySet<string> = new Set([
  'screen',
  'feature',
  'source',
  'plan',
  'billing_period',
  'step',
]);
const MAX_PROP_LENGTH = 64;

export type AnalyticsProps = Partial<
  Record<'screen' | 'feature' | 'source' | 'plan' | 'billing_period' | 'step', string>
>;

export interface AnalyticsEvent {
  event_id: string;
  event_name: AnalyticsEventName;
  platform: 'ios' | 'android';
  session_id: string;
  app_version: string | null;
  event_timestamp: string;
  properties: Record<string, string>;
}

export function sanitizeProps(props: Record<string, unknown> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!props) return clean;
  for (const [key, value] of Object.entries(props)) {
    if (!PROP_KEYS.has(key)) continue;
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PROP_LENGTH) continue;
    clean[key] = value;
  }
  return clean;
}

export interface TrackerDeps {
  /** true dönerse parti sunucuya yazıldı sayılır. Hata fırlatmamalı. */
  send(batch: AnalyticsEvent[]): Promise<boolean>;
  isConsented(): boolean;
  isSignedIn(): boolean;
  platform: 'ios' | 'android';
  appVersion: string | null;
  sessionId: string;
  uuid(): string;
  now(): Date;
  maxQueue?: number;
  batchSize?: number;
}

export function createTracker(deps: TrackerDeps) {
  const maxQueue = deps.maxQueue ?? 200;
  const batchSize = Math.min(deps.batchSize ?? 50, 50);
  let queue: AnalyticsEvent[] = [];
  let flushing = false;

  function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
    try {
      if (!deps.isConsented() || !EVENT_NAMES.has(name)) return;
      queue.push({
        event_id: deps.uuid(),
        event_name: name,
        platform: deps.platform,
        session_id: deps.sessionId,
        app_version: deps.appVersion,
        event_timestamp: deps.now().toISOString(),
        properties: sanitizeProps(props),
      });
      if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
    } catch {
      // takip asla uygulamayı bozmaz
    }
  }

  /** Bekleyen olayları gönderir. Başarısız parti aynı event_id'lerle başa geri konur. */
  async function flush(): Promise<void> {
    if (flushing) return;
    if (!deps.isConsented()) {
      queue = [];
      return;
    }
    if (!deps.isSignedIn() || queue.length === 0) return;
    flushing = true;
    try {
      while (queue.length > 0 && deps.isConsented() && deps.isSignedIn()) {
        const batch = queue.splice(0, batchSize);
        let delivered = false;
        try {
          delivered = await deps.send(batch);
        } catch {
          delivered = false;
        }
        if (!delivered) {
          queue.unshift(...batch);
          if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
          return;
        }
      }
    } finally {
      flushing = false;
    }
  }

  return {
    track,
    flush,
    clear(): void {
      queue = [];
    },
    size(): number {
      return queue.length;
    },
  };
}
