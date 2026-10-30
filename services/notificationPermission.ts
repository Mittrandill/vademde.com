import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerPushToken } from '@/services/pushToken';

export interface NotificationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

// Bildirim izninin canlı durumu. İzin uygulama dışında (sistem ayarları) değiştiği için uygulama
// her öne geldiğinde yeniden okunur; izin açıksa push token da kaydedilir — böylece kullanıcı
// ayarlardan açıp döndüğünde bildirimler hemen çalışmaya başlar.
export function useNotificationPermission(enabled = true) {
  const [status, setStatus] = useState<NotificationPermissionState | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    Notifications.getPermissionsAsync()
      .then((current) => {
        setStatus({ granted: current.granted, canAskAgain: current.canAskAgain });
        if (current.granted) void registerPushToken();
      })
      .catch(() => setStatus(null));
  }, [enabled]);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // iOS izni uygulama içinden kapatmaya izin vermez; açma isteği yalnızca hiç sorulmadıysa
  // gösterilebilir. Diğer her durumda (açık → kapatmak, reddedilmiş → açmak) sistem ayarları açılır.
  const openControls = useCallback(async () => {
    if (status && !status.granted && status.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync().catch(() => null);
      if (requested?.granted) {
        refresh();
        return;
      }
    }
    await Linking.openSettings();
  }, [status, refresh]);

  return { status, refresh, openControls };
}
