import { Platform } from 'react-native';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Settings } from 'react-native-fbsdk-next';

// app.json'da isAutoInitEnabled/advertiserIDCollectionEnabled kapalı bırakıldı:
// Apple App Store İnceleme Kuralları 5.1.2 gereği IDFA toplama, kullanıcı App Tracking
// Transparency isteminde onay vermeden ÖNCE başlayamaz.
//
// SDK açılışta IDFA'sız başlatılır (App Events / Aggregated Event Measurement IDFA olmadan da
// çalışır, kurulum ölçümü kaybolmaz). ATT istemi ise eskiden giriş ekranından önce, uygulama
// açılır açılmaz çıkıyordu; artık kullanıcı çalışma alanını kurup Ana Sayfa'ya geldikten
// sonra soruluyor (bkz. requestTrackingIfNeeded, app/(tabs)/index.tsx).
function applyTracking(granted: boolean) {
  Settings.setAdvertiserIDCollectionEnabled(granted);
  Settings.setAdvertiserTrackingEnabled(granted);
}

export async function initMetaAds(): Promise<void> {
  const granted =
    Platform.OS === 'ios' ? (await getTrackingPermissionsAsync()).status === 'granted' : true;
  applyTracking(granted);
  Settings.setAutoLogAppEventsEnabled(true);
  Settings.initializeSDK();
}

// Yalnızca henüz sorulmamışsa (undetermined) istemi gösterir; sonuç SDK'ya uygulanır.
export async function requestTrackingIfNeeded(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const current = await getTrackingPermissionsAsync();
  if (current.status !== 'undetermined') return;
  const { status } = await requestTrackingPermissionsAsync();
  applyTracking(status === 'granted');
}
