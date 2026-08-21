// docs/10-abonelik-gelir-modeli.md — Shopier, web'de aynı fiyatlarla abonelik satın
// almayı sağlar (App Store IAP'nin RevenueCat üzerinden yaptığının web karşılığı).
// Shopier'da native tekrarlayan ödeme yoktur: kullanıcı her dönem elle tekrar öder
// (bkz. shopier-checkout), bu webhook yalnızca "ödeme başarılı/başarısız" bildirimini
// işler ve subscriptions tablosuna revenuecat-webhook ile aynı şekilde yansıtır.
// Diğer Edge Function'ların aksine burada çağıranın bir kullanıcı JWT'si yoktur —
// Shopier sunucusu doğrudan çağırır, imza (HMAC-SHA256) doğrulaması yeterlidir.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHOPIER_API_SECRET = Deno.env.get('SHOPIER_API_SECRET')!;

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function addPeriod(base: Date, billingPeriod: string): Date {
  const d = new Date(base);
  if (billingPeriod === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Shopier callback'i form-encoded POST eder (JSON değil) — bkz. Shopier resmi PHP SDK'sı
  // (ShopierResponse::fromPostData / $_POST).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('Geçersiz istek gövdesi', { status: 400 });
  }

  const platformOrderId = form.get('platform_order_id')?.toString();
  const status = form.get('status')?.toString();
  const paymentId = form.get('payment_id')?.toString() ?? null;
  const randomNr = form.get('random_nr')?.toString();
  const signatureB64 = form.get('signature')?.toString();

  if (!platformOrderId || !status || !randomNr || !signatureB64) {
    return new Response('Eksik alan', { status: 400 });
  }

  // İmza: HMAC-SHA256(random_nr + platform_order_id, API_SECRET) — Shopier PHP SDK'sındaki
  // ShopierResponse::getExpectedSignature/hasValidSignature ile birebir aynı algoritma.
  const expected = await hmacSha256(SHOPIER_API_SECRET, randomNr + platformOrderId);
  let received: Uint8Array;
  try {
    received = base64ToBytes(signatureB64);
  } catch {
    return new Response('Geçersiz imza biçimi', { status: 401 });
  }
  if (!timingSafeEqual(expected, received)) {
    return new Response('Geçersiz imza', { status: 401 });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: order, error: orderError } = await adminClient
    .from('shopier_orders')
    .select('*')
    .eq('id', platformOrderId)
    .maybeSingle();
  if (orderError || !order) {
    return new Response('Sipariş bulunamadı', { status: 404 });
  }

  // Idempotency: Shopier aynı callback'i birden fazla kez gönderebilir (yeniden deneme).
  // Sipariş zaten işlenmişse current_period_end'i tekrar ileri atmadan sessizce 200 dön.
  if (order.status !== 'pending') {
    return new Response('OK (zaten işlenmiş)', { status: 200 });
  }

  const isSuccess = status === 'success';

  await adminClient
    .from('shopier_orders')
    .update({
      status: isSuccess ? 'success' : 'failed',
      payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (isSuccess) {
    const currentPeriodEnd = addPeriod(new Date(), order.billing_period).toISOString();
    await adminClient.from('subscriptions').upsert(
      {
        owner_id: order.owner_id,
        plan: order.plan,
        status: 'active',
        billing_period: order.billing_period,
        store: 'shopier',
        current_period_end: currentPeriodEnd,
        // Shopier'da native tekrarlayan ödeme yok — kullanıcı dönem bitmeden önce
        // manuel olarak tekrar öder (bkz. docs/10-abonelik-gelir-modeli.md).
        will_renew: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' }
    );
  }

  return new Response('OK', { status: 200 });
});
