import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Settings } from 'react-native-fbsdk-next';

// iOS 14+ üzerinde Meta SDK, reklam kimliğini (IDFA) yalnızca kullanıcı App Tracking
// Transparency isteminde izin verirse toplayıp App Events/SKAdNetwork ile eşleştirir.
// İzin reddedilse bile SDK olay göndermeye devam eder, sadece cihaz düzeyinde
// eşleştirme yapılmaz — bu yüzden reddedilirse akışı durdurmuyoruz.
export async function initMetaAds(): Promise<void> {
  if (Platform.OS === 'ios') {
    const { status } = await requestTrackingPermissionsAsync();
    Settings.setAdvertiserTrackingEnabled(status === 'granted');
  } else {
    Settings.setAdvertiserTrackingEnabled(true);
  }
}
