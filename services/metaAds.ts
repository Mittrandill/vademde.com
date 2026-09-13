import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Settings } from 'react-native-fbsdk-next';

// app.json'da isAutoInitEnabled/advertiserIDCollectionEnabled kapalı bırakıldı:
// Apple App Store İnceleme Kuralları 5.1.2 gereği IDFA toplama ve SDK başlatma,
// kullanıcı App Tracking Transparency isteminde onay vermeden ÖNCE başlayamaz.
// SDK burada, ATT sonucu belli olduktan sonra manuel başlatılıyor.
export async function initMetaAds(): Promise<void> {
  const advertiserTrackingGranted =
    Platform.OS === 'ios' ? (await requestTrackingPermissionsAsync()).status === 'granted' : true;

  Settings.setAdvertiserIDCollectionEnabled(advertiserTrackingGranted);
  Settings.setAdvertiserTrackingEnabled(advertiserTrackingGranted);
  // App Events, IDFA olmadan da (Aggregated Event Measurement ile) çalışmaya devam
  // eder — bu yüzden ATT sonucundan bağımsız açık.
  Settings.setAutoLogAppEventsEnabled(true);
  Settings.initializeSDK();
}
