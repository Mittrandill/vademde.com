import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { ensureNotificationPermission } from '@/services/notifications';
import { deletePushToken, upsertPushToken } from '@/features/reminders/api';

// app.json'daki EAS projectId — getExpoPushTokenAsync bu değeri gerektirir.
const EAS_PROJECT_ID = 'df8f055e-b6e1-4104-b0f8-885b80d4775b';

let currentToken: string | null = null;

// app/_layout.tsx'te oturum açıldığında çağrılır (configurePurchases ile aynı desen).
// supabase/functions/send-reminders bu token'a Expo Push API üzerinden gönderir.
export async function registerPushToken(userId: string): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    currentToken = data;

    await upsertPushToken({
      user_id: userId,
      token: data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  } catch (error) {
    console.warn('[pushToken] push token kaydı başarısız', error);
  }
}

// Oturum kapatıldığında yalnızca bu cihazın token'ı silinir — kullanıcının diğer
// cihazları (varsa) etkilenmez.
export async function unregisterCurrentPushToken(): Promise<void> {
  if (!currentToken) return;
  try {
    await deletePushToken(currentToken);
  } catch (error) {
    console.warn('[pushToken] push token silme başarısız', error);
  } finally {
    currentToken = null;
  }
}
