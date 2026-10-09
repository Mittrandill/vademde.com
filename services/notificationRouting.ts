import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';

// Push bildirimine dokunulunca ilgili ekrana gider. Veri biçimleri sunucudan gelir:
// - send-cash-alerts: { type: 'cash_alert', accountId } — accountId bir hesap kimliği ya da 'toplam'
// - send-reminders (borç/alacak): { obligationId, stage }
// - send-reminders (kredi kartı): { accountId, stage }
// Bildirim verisi dışarıdan geldiği için yalnızca dize alanlar kabul edilir ve yol parçası kodlanır.
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function routeForNotificationData(data: Record<string, unknown> | undefined): Href | null {
  if (!data) return null;
  const accountId = str(data.accountId);
  const obligationId = str(data.obligationId);
  if (data.type === 'cash_alert' && accountId) return `/cash-alert/${encodeURIComponent(accountId)}` as Href;
  if (obligationId) return `/obligations/${encodeURIComponent(obligationId)}` as Href;
  if (accountId) return `/accounts/${encodeURIComponent(accountId)}` as Href;
  return null;
}

let lastHandledId: string | null = null;

function handleResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (id === lastHandledId) return;
  const href = routeForNotificationData(response.notification.request.content.data as Record<string, unknown>);
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
