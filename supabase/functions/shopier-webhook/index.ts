// docs/10-abonelik-gelir-modeli.md — Shopier, web'de aynı fiyatlarla abonelik satın
// almayı sağlar (App Store IAP'nin RevenueCat üzerinden yaptığının web karşılığı).
//
// Mimari (kreditakip.com.tr'de kanıtlanmış çalışan aynı desen): web tarafı dinamik bir
// checkout başlatmıyor, kullanıcıyı doğrudan Shopier'ın statik ürün linkine yönlendiriyor
// (bkz. src/routes/uygulama/abonelik.tsx). Bu yüzden Shopier'ın OSB bildirimindeki
// `orderid` bizim önceden oluşturduğumuz bir kimlik DEĞİL — Shopier'ın kendi sipariş
// numarası. Kullanıcı eşlemesi bildirimdeki alıcı e-postasıyla yapılır; e-posta kayıtlı
// bir Vademde hesabıyla eşleşmezse abonelik açılmaz, `shopier_processed_orders`'a
// matched=false olarak düşer (elle çözüm için).
//
// OSB kontratı Shopier'ın resmi PHP örnek kodundan doğrulandı: form-encoded POST,
// `res` (base64 JSON) + `hash` (hex) alanları. İmza: hash_hmac('sha256',
// res + OSB_kullanici_adi, OSB_sifresi) — hex çıktı. Başarı yanıtı literal "success"
// metni olmalı (JSON/200-only yetmiyor, Shopier bunu aramazsa bildirimi "başarısız"
// sayıp tekrar dener).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// SHOPIER_API_KEY = OSB Kullanıcı Adı, SHOPIER_API_SECRET = OSB Şifresi (Shopier panel
// adlandırması "Entegrasyonlar > Otomatik Sipariş Bildirimi").
const SHOPIER_API_KEY = Deno.env.get('SHOPIER_API_KEY')!;
const SHOPIER_API_SECRET = Deno.env.get('SHOPIER_API_SECRET')!;

// Shopier panelinde oluşturulan 4 statik ürün — src/routes/uygulama/abonelik.tsx'teki
// SHOPIER_PRODUCTS ile birebir aynı olmalı (tek kaynak burası + orası, App Store/
// RevenueCat'teki mobil fiyatlarla aynı, bkz. docs/10-abonelik-gelir-modeli.md).
const PRODUCT_PLAN_MAP: Record<string, { plan: string; billingPeriod: string }> = {
  '50114763': { plan: 'plus', billingPeriod: 'monthly' },
  '50114803': { plan: 'plus', billingPeriod: 'yearly' },
  '50114845': { plan: 'isletme', billingPeriod: 'monthly' },
  '50114873': { plan: 'isletme', billingPeriod: 'yearly' },
};

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function addPeriod(base: Date, billingPeriod: string): Date {
  const d = new Date(base);
  if (billingPeriod === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

interface ShopierOsbPayload {
  email?: string;
  orderid?: string;
  currency?: number; // 0..TL, 1..USD, 2..EUR
  price?: string;
  buyername?: string;
  buyersurname?: string;
  productid?: string;
  istest?: string | number; // 0..canlı, 1..test
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('missing parameter', { status: 400 });
  }

  const res = form.get('res')?.toString();
  const hash = form.get('hash')?.toString();
  if (!res || !hash) {
    return new Response('missing parameter', { status: 400 });
  }

  const expectedHash = await hmacSha256Hex(SHOPIER_API_SECRET, res + SHOPIER_API_KEY);
  if (!timingSafeEqualStr(expectedHash, hash)) {
    return new Response('invalid signature', { status: 401 });
  }

  let payload: ShopierOsbPayload;
  try {
    payload = JSON.parse(atob(res));
  } catch {
    return new Response('invalid payload', { status: 400 });
  }

  const orderId = payload.orderid;
  const email = payload.email?.trim();
  const productId = payload.productid;

  // Bildirim Testi gibi bize ait olmayan/eksik veri içeren bildirimlerde de imza
  // geçerliyse Shopier'a "success" dönülür — aksi halde Shopier'ın kendisi bildirimi
  // "başarısız" sayıp tekrar dener.
  if (!orderId || !email) {
    return new Response('success', { status: 200 });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Idempotency: Shopier aynı bildirimi birden fazla kez gönderebilir.
  const { data: existing } = await adminClient
    .from('shopier_processed_orders')
    .select('order_id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (existing) {
    return new Response('success', { status: 200 });
  }

  const planInfo = productId ? PRODUCT_PLAN_MAP[productId] : undefined;
  const priceMinor = payload.price ? Math.round(parseFloat(payload.price) * 100) : null;

  let ownerId: string | null = null;
  if (planInfo) {
    const { data: userId } = await adminClient.rpc('get_user_id_by_email', { p_email: email });
    ownerId = (userId as string | null) ?? null;
  }

  await adminClient.from('shopier_processed_orders').insert({
    order_id: orderId,
    buyer_email: email,
    product_id: productId ?? 'bilinmiyor',
    plan: planInfo?.plan ?? null,
    billing_period: planInfo?.billingPeriod ?? null,
    owner_id: ownerId,
    amount_minor: priceMinor,
    matched: !!ownerId,
    raw_payload: payload,
  });

  // planInfo yoksa (bilinmeyen ürün) veya e-posta kayıtlı bir kullanıcıyla eşleşmediyse
  // abonelik açılmaz — kayıt yukarıda matched=false olarak düştü, elle çözülür.
  if (planInfo && ownerId) {
    const currentPeriodEnd = addPeriod(new Date(), planInfo.billingPeriod).toISOString();
    await adminClient.from('subscriptions').upsert(
      {
        owner_id: ownerId,
        plan: planInfo.plan,
        status: 'active',
        billing_period: planInfo.billingPeriod,
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

  return new Response('success', { status: 200 });
});
