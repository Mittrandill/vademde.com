// AsyncStorage anahtarları burada toplanır ki birden fazla ekran (tara.tsx okuyor,
// profile/index.tsx yazıyor) aynı sabiti içe aktarsın — bir route dosyasını (app/(tabs)/tara)
// sırf bir sabit için başka bir ekrandan import etmek, o ekranın tüm kamera/OCR bağımlılıklarını
// gereksiz yere birlikte sürükler.
export const RETAIN_ORIGINAL_DEFAULT_KEY = 'vademde-retain-original-default';

// app/(tabs)/index.tsx — ücretsiz plandaki kullanıcıya periyodik paywall hatırlatması
// için son gösterim zamanı (epoch ms, cihazda kalıcı).
export const PAYWALL_LAST_SHOWN_KEY = 'vademde-paywall-last-shown';
