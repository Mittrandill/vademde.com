import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Linking, Platform } from 'react-native';

// Push bildirimine dokunulunca ilgili ekrana gider. Veri biçimleri sunucudan gelir:
// - send-cash-alerts: { type: 'cash_alert', accountId } — accountId bir hesap kimliği ya da 'toplam'
// - send-reminders (borç/alacak): { obligationId, stage }
// - send-reminders (kredi kartı): { accountId, stage }
// - support-reply: { type: 'support', messageId }
// - kampanya: { type: 'offer_code', code } — iOS'ta App Store teklif kodu kullanma sayfası açılır.
//   Adres sabittir; bildirimden yalnızca kod gelir (A-Z, 0-9), keyfi bağlantı açılamaz.
// Bildirim verisi dışarıdan geldiği için yalnızca dize alanlar kabul edilir ve yol parçası kodlanır.
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function routeForNotificationData(data: Record<string, unknown> | undefined): Href | null {
  if (!data) return null;
  const accountId = str(data.accountId);
  const obligationId = str(data.obligationId);
  const messageId = str(data.messageId);
  if (data.type === 'support' && messageId) return `/destek/${encodeURIComponent(messageId)}` as Href;
  if (data.type === 'cash_alert' && accountId) return `/cash-alert/${encodeURIComponent(accountId)}` as Href;
  if (obligationId) return `/obligations/${encodeURIComponent(obligationId)}` as Href;
  if (accountId) return `/accounts/${encodeURIComponent(accountId)}` as Href;
  return null;
}

const APP_STORE_APP_ID = '6796449470';

export function offerCodeRedeemUrl(data: Record<string, unknown> | undefined): string | null {
  if (!data || data.type !== 'offer_code') return null;
  const code = str(data.code);
  if (!code || !/^[A-Z0-9]{1,64}$/.test(code)) return null;
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_APP_ID}&code=${code}`;
}

let lastHandledId: string | null = null;

function handleResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (id === lastHandledId) return;
  const data = response.notification.request.content.data as Record<string, unknown>;
  const redeemUrl = Platform.OS === 'ios' ? offerCodeRedeemUrl(data) : null;
  if (redeemUrl) {
    lastHandledId = id;
    Linking.openURL(redeemUrl).catch(() => {});
    return;
  }
  const href = routeForNotificationData(data);
  if (!href) return;
  lastHandledId = id;
  // Soğuk başlangıçta gezinti henüz hazır olmayabilir; kısa bir gecikme ve hata yakalama ile güvenli.
  setTimeout(() => {
    try {
      router.push(href);
    } catch {
      // gezinti hazır değilse bildirim sessizce yok sayılır
    }
  }, 150);
}

// Oturum açıkken (korumalı ekranlar mevcutken) çağrılır: uygulama açıkken/arka plandayken gelen
// dokunuşları dinler, uygulamayı bildirimle açan (soğuk başlangıç) dokunuşu da bir kez işler.
export function attachNotificationTapHandler(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  Notifications.getLastNotificationResponseAsync()
    .then(handleResponse)
    .catch(() => {});
  return () => subscription.remove();
}
