// docs/10-abonelik-gelir-modeli.md §14.1 — web'de aynı fiyatlarla Shopier üzerinden
// abonelik satın alma. Oturum açmış kullanıcı plan+dönem seçer, burada bir shopier_orders
// satırı (pending) oluşturulur ve imzalı Shopier ödeme formu (auto-submit HTML) döner.
// Sonucu shopier-webhook işler.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SHOPIER_API_KEY = Deno.env.get('SHOPIER_API_KEY')!;
const SHOPIER_API_SECRET = Deno.env.get('SHOPIER_API_SECRET')!;
// https://<proje-ref>.supabase.co/functions/v1/shopier-webhook — Supabase Edge Function
// secret olarak ayarlanır (kodda sabit yazılmaz, farklı ortamlar/projeler için esnek kalır).
const SHOPIER_CALLBACK_URL = Deno.env.get('SHOPIER_CALLBACK_URL')!;

// react-native-web/web istemcisi preflight (OPTIONS) gönderir.
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PlanCode = 'plus' | 'isletme';
type BillingPeriod = 'monthly' | 'yearly';

// Shopier panelinde bu fiyatlarla ürün oluşturuldu (shopier.com/vademde/50114763 vb.) ve
// App Store Connect/RevenueCat'teki mobil fiyatlarıyla birebir aynı — tek kaynak burasıdır,
// panel/App Store fiyatı değişirse burası da güncellenmelidir.
const PRICE_TABLE: Record<PlanCode, Record<BillingPeriod, { amountMinor: number; productName: string }>> = {
  plus: {
    monthly: { amountMinor: 14_999, productName: 'Vademde Plus Aylık' },
    yearly: { amountMinor: 149_999, productName: 'Vademde Plus Yıllık' },
  },
  isletme: {
    monthly: { amountMinor: 34_999, productName: 'Vademde İşletme Aylık' },
    yearly: { amountMinor: 349_999, productName: 'Vademde İşletme Yıllık' },
  },
};

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Yetkilendirme başlığı eksik' }, 401);
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await authedClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Oturum geçersiz' }, 401);
  }
  const user = userData.user;

  let body: { plan?: string; billingPeriod?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Geçersiz istek gövdesi' }, 400);
  }

  const plan = body.plan as PlanCode | undefined;
  const billingPeriod = body.billingPeriod as BillingPeriod | undefined;
  const priceInfo = plan && billingPeriod ? PRICE_TABLE[plan]?.[billingPeriod] : undefined;
  if (!priceInfo) {
    return jsonResponse({ error: 'Geçersiz plan veya ödeme dönemi' }, 400);
  }

  const { data: profile } = await authedClient
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const fullName = (profile?.full_name ?? '').trim();
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const buyerName = nameParts[0] || 'Vademde';
  const buyerSurname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Kullanıcı';

  const { data: order, error: insertError } = await authedClient
    .from('shopier_orders')
    .insert({
      owner_id: user.id,
      plan,
      billing_period: billingPeriod,
      amount_minor: priceInfo.amountMinor,
      currency_code: 'TRY',
      status: 'pending',
    })
    .select('id')
    .single();
  if (insertError || !order) {
    return jsonResponse({ error: 'Sipariş oluşturulamadı' }, 500);
  }

  const randomNr = Math.floor(100_000 + Math.random() * 900_000).toString();
  const totalOrderValue = (priceInfo.amountMinor / 100).toFixed(2);
  // İmza: HMAC-SHA256(random_nr + platform_order_id + total_order_value + currency, API_SECRET)
  // base64 — Shopier PHP SDK'sındaki ShopierParams::getDataToBeHashed/Shopier::calculateSignature
  // ile birebir aynı algoritma. currency=0 → TL (Shopier\Enums\Currency::TL).
  const dataToBeHashed = randomNr + order.id + totalOrderValue + '0';
  const signature = await hmacSha256Base64(SHOPIER_API_SECRET, dataToBeHashed);

  // NOT: buyer_id_nr (TC Kimlik No) ve buyer_phone için uygulamada henüz bir alan yok —
  // gerçek değer toplanana kadar placeholder kullanılıyor. Shopier'ın bunu gerçekten
  // zorunlu tuttuğu doğrulanmalı; öyleyse checkout öncesi kısa bir bilgi formu eklenmeli.
  const fields: Record<string, string> = {
    API_key: SHOPIER_API_KEY,
    website_index: '1',
    platform_order_id: order.id,
    product_name: priceInfo.productName,
    product_type: '1', // Shopier\Enums\ProductType::DOWNLOADABLE_VIRTUAL — dijital ürün, kargo yok
    buyer_name: buyerName,
    buyer_surname: buyerSurname,
    buyer_email: user.email ?? '',
    buyer_account_age: '0',
    buyer_id_nr: '11111111111',
    buyer_phone: '5555555555',
    billing_address: 'Dijital ürün - adres gerekmiyor',
    billing_city: 'İstanbul',
    billing_country: 'Türkiye',
    billing_postcode: '34000',
    shipping_address: 'Dijital ürün - adres gerekmiyor',
    shipping_city: 'İstanbul',
    shipping_country: 'Türkiye',
    shipping_postcode: '34000',
    total_order_value: totalOrderValue,
    currency: '0',
    platform: '0',
    is_in_frame: '0',
    current_language: '0',
    modul_version: '1.0.4',
    random_nr: randomNr,
    signature,
    callback: SHOPIER_CALLBACK_URL,
  };

  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Ödemeye yönlendiriliyor…</title>
</head>
<body>
  <form id="shopier-form" method="post" action="https://www.shopier.com/ShowProduct/api_pay4.php">
${inputs}
  </form>
  <script>document.getElementById('shopier-form').submit();</script>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
});
