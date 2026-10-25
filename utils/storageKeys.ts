// AsyncStorage anahtarları burada toplanır ki birden fazla ekran (tara.tsx okuyor,
// profile/index.tsx yazıyor) aynı sabiti içe aktarsın — bir route dosyasını (app/(tabs)/tara)
// sırf bir sabit için başka bir ekrandan import etmek, o ekranın tüm kamera/OCR bağımlılıklarını
// gereksiz yere birlikte sürükler.
export const RETAIN_ORIGINAL_DEFAULT_KEY = 'vademde-retain-original-default';

// app/(tabs)/index.tsx — ücretsiz plandaki kullanıcıya periyodik paywall hatırlatması
// için son gösterim zamanı (epoch ms, cihazda kalıcı).
export const PAYWALL_LAST_SHOWN_KEY = 'vademde-paywall-last-shown';

// docs/07-guvenlik-gizlilik.md §11.2 — belge görüntüsü buluta (OCR) gönderilmeden önce alınan açık onay.
// tara.tsx ve taslak belge kuyruğu (DraftDocumentsQueue) aynı onayı paylaşır; onay metni i18n scan.consentText.
export const OCR_CONSENT_KEY = 'vademde-ocr-consent-granted';
