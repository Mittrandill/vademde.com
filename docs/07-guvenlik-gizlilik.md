# Güvenlik, Gizlilik ve Uyum

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 11 (s. 15-16)
> Bu dosya güvenlik kurallarını, OCR gizlilik iznini, kullanıcı kontrolünü ve App Store gereksinimlerini tanımlar.

## 11.1 Güvenlik kuralları

- Tüm kullanıcı tablolarında RLS
- Yalnızca üyesi olunan workspace verilerine erişim
- Service role anahtarının mobil uygulamaya gömülmemesi
- Oturum bilgilerinin güvenli depolamada tutulması
- Private storage bucket ve süreli erişim bağlantıları
- Loglarda finansal açıklama ve tam belge içeriği bulunmaması
- Dosya türü, boyutu ve zararlı içerik kontrolleri
- Arka plana geçince app switcher gizliliği
- Face ID kilidi ve bakiye gizleme

## 11.2 OCR gizlilik izni

> **Örnek izin metni**
> Belgenizdeki tarih, tutar ve ödeme bilgilerini çıkarmak için belge görüntüsü güvenli bağlantı üzerinden akıllı belge analiz hizmetine gönderilecektir. Belge, siz onaylamadan finansal kayda dönüştürülmez.

- Kabul Et ve Akıllı Tara
- Yalnızca cihazda metni tara
- Vazgeç

## 11.3 Kullanıcı kontrolü

- AI belge analizini aç/kapat
- Orijinal belgeyi saklama veya işlem sonrası silme tercihi
- Tüm belgeleri dışa aktarma ve silme
- Hesabı uygulama içinden silme
- Çalışma alanını arşivleme veya kalıcı silme
- Belge paylaşımında hassas alanları maskeleme

## 11.4 App Store gereksinimleri

App Store gizlilik beyanları, toplanan veri türleri, üçüncü taraf AI veri işleme süreci, hesap silme, abonelik koşulları ve gizlilik politikası eksiksiz açıklanmalıdır. Premium dijital özellikler iOS'ta Apple uygulama içi satın alma sistemiyle sunulmalıdır.
