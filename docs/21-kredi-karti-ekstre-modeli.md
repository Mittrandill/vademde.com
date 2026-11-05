# 21 — Kredi kartı / ekstre model incelemesi

Tarih: 2026-11-05. Durum: iki eklemeli migration, send-reminders v9 ve production iOS/Android OTA yayında. Kaynak commit `566638d`; runtime `1.0.9`. Ayrıntılı yayın kimlikleri [yayın günlüğünde](15-yayin-gunlugu.md).

## Arayüz

- Yeni kredi kartında açılış borcu sorulmaz. Asgari ödeme oranı isteğe bağlıdır. Eski kartı düzenlemek mevcut açılış bakiyesini veya bu bakiyenin tarihini değiştirmez.
- Ayrı ekstre formunun sırası: ön dolu dönem, hareket formundaki büyük tutar alanı, otomatik dolu ve değiştirilebilir standart başlık alanı. Mevcut tema, bileşenler ve boşluklar kullanılır. Türkçe/İngilizce ve açık/koyu tema desteklenir.
- Kart/banka seçimi tekrarlanmaz; hesap kesim ve son ödeme tarihleri kart bilgilerinden alınır. Kategori ve taksit planı oluşturulmaz. Kart tarihleri eksikse kartı düzenleme eylemi gösterilir. Eski tarihli ekstre düzenlenirken kayıtlı kesim/vade korunur.
- Kesilmemiş yeni dönem kaydedilemez. Son ekstreyi eklemek isteğe bağlıdır. Ekstre ve oran bulunmadan asgari tutar üretilmez.
- Kısa bilgi metni, bankanın bildirdiği ekstre tutarının girilmesini ve kesim sonrası harcamaların ayrıca kaydedilmesini açıklar. Kartta gösterilen güncel borç kayıtlı verilere dayanan hesaplamadır; banka bağlantısı yoktur.
- Ay/hafta takviminde Borç, Alacak, Çek-Senet, Kredi ve Kredi Kartı açıklamaları vardır. Aynı gündeki türlerin mevcut tema renkleri tek belirteçte karıştırılır.
- Büyük tutar alanı gerçek metin genişliğiyle boyutlanır; sayı ayrıştırma veya kayıt birimi değiştirilmez.

## Bankacılık tanımları

[İş Bankası hesap özeti açıklaması](https://www.isbank.com.tr/aciklamalar), hesap özeti borcunun devreden bakiyeyi içerdiğini; asgarinin hesap özeti toplamından hesaplandığını belirtir. Kullanılabilir limit ayrıca vadesi gelmemiş taksitler ve provizyonlardan etkilenir.

[Garanti BBVA kredi kartı SSS](https://www.garantibbva.com.tr/sikca-sorulan-sorular/kredi-kartlari), ekstreyi iki kesim tarihi arasındaki harcama, borç, ödeme ve diğer kart bilgilerinin dökümü olarak tanımlar.

[İş Bankası asgari ödeme açıklaması](https://www.isbank.com.tr/kredi-karti-asgari-odeme-hesaplama) müşteri limitine ve tarihli uygulamaya bağlı oranlar belirtir. Tek kartın limitinden evrensel oran türetilmez. Kullanıcının oranıyla hesaplanan tutar tahmindir; bankanın bildirdiği tutar esas alınır.

## Borç hesabı

Ekstre bir bakiye özetidir; ayrıca harcama veya para hareketi oluşturmaz. Güncel borç, en son kesilmiş ekstre ile kesim sonrasında kaydedilen harcama/ödeme/iadelerden hesaplanır. Eski, daha yeni tarihli bir açılış bakiyesi varsa mevcut çapa kuralı korunur.

Ardışık ekstrelerin kalanları bağımsız borçlar gibi toplanmaz. Ortak saf hesaplama `supabase/functions/_shared/cardLedger.ts` içindedir. Her ekstre için tam kalan bakiye ve toplamda yalnızca bir kez sayılacak dönem katkısı ayrı hesaplanır. Geçmişten taşınan borç eski vadesini korur; sırf yeni ekstre girildi diye ödendi yapılmaz. Kart detayında tam ekstre kalanı, takvim ve toplam borçta dönem katkıları kullanılır.

| Senaryo | Kart borcu | Toplamda sayılan ekstre borcu |
|---|---:|---:|
| Eski ödenmemiş 25.000 TL, eskiyi içeren yeni 60.000 TL ekstre | 60.000 TL | 25.000 + 35.000 = 60.000 TL |
| Son kesimden sonra 10.000 TL ödeme | 50.000 TL | 15.000 + 35.000 = 50.000 TL |
| Sonrasında 35.000 TL harcama | 85.000 TL | 50.000 TL ekstre + 35.000 TL ekstreleşmemiş borç |

Mevcut atomik ödeme RPC'si ve eski ödeme dağıtımı değiştirilmez. Kart transferleri bir kez düşülür; ayrı ödeme satırları ikinci transfer sayılmaz. Hesapsız ödemeler, iadeler, silinmiş ödemeler, geç girilen/düzeltilen ekstreler, eski mükerrer dönemler ve gelecekteki kayıtlar okuma sırasında ele alınır. İki ayrı sorgu arasında eklenen transfer, ödemenin ilişkili transfer verisiyle tamamlanır ve kimliğiyle tekilleştirilir.

Asgari kalan tahmini, ekstre toplamı × oran − ekstre bakiyesindeki azalma üzerinden hesaplanır ve sıfırda sınırlandırılır. Ekstre sonrası yeni alışveriş asgariyi artırmaz. Bankaların iade/mahsup ve ücret uygulamaları farklı olabileceğinden bu değer bankanın kesin asgarisi yerine geçmez.

Ana sayfa, takvim, borç özetleri, cari/banka bakiyesi ve nakit tahmini aynı dönem katkılarını kullanır. Gönderilecek bildirimlerde ortak hesaplama kullanılır; sonraki ekstreye taşınmış, gelecekteki veya kalanı sıfır olan ekstre hatırlatmaları iptal edilir. Bu iptal yalnızca hatırlatma kaydına uygulanır. Çalışan UTC sunucuda Türk banka takvimi Europe/Istanbul ile hesaplanır. Bankanın hesap kesim gününün saati bilinmediğinden gün bazında hesap yapılır; kesim günündeki hareketler ekstre içinde kabul edilir.

## Mevcut kullanıcıların korunması

- Migration'lar yalnızca nullable alanlar ve yeni tarihli ekstreler için kısıt ekler. Eski bakiye, ödeme, durum, taksit veya açılış tarihine toplu güncelleme yapılmaz. Eski istemci alanları göndermeden kayıt ekleyebilir.
- Düzenleme ve koşullu güncelleme gerçek ham kaydı kullanır; hesaplanmış kalan tutar veritabanına yazılmaz. Eşzamanlı ödeme/değişiklikte eski verinin yeni veriyi ezmesi engellenir.
- **Eski taksit planı bulunan kartlar**, taksitli ekstreyi aylık bakiye özeti gibi yeniden yorumlamamak için mevcut borç hesabı, takvim ve hatırlatma işleyişini korur. Bu kartlarda yeni dönem projeksiyonu uygulanmaz. Eski plan düzenleme yolu açık kalır; yeni ekstre formu plan üretmez. Taksitli ekstrelerin kapsamlı dönüşümü bu değişikliğin dışındadır.
- Dışa aktarılan kayıtlar ve gerçek ödeme geçmişi korunur. Gerçekleşmiş Hareketler listesi, dekont eşleştirme ve eski cari ödeme/ciro seçicileri ham tutarları kullanır; bu eski yazma akışlarının veritabanındaki tutarlara bağlı eşzamanlılık kontrolleri değiştirilmez. Yeni ekstreler cariyle ilişkilendirilmez; önerilen ödeme yolu kart sayfasındaki atomik kart ödemesidir. Okuma hesabı eski kayıtları silmez veya sahte ödeme oluşturmaz.
- Uygulama geçmiş kayıtları otomatik düzelttiğini veya banka bakiyesini canlı aldığını iddia etmez. Kayıt dışı harcama, faiz, ücret, provizyon ve bankanın özel mahsup kuralları bilinmez.

## Doğrulama ve yayın sırası

- Finans regresyonu, kart borcu, kart vadesi ve yeni ekstre/takvim testleri; yerel PostgreSQL migration uyumluluğu; Türkçe/İngilizce açık/koyu tarayıcı kontrolleri kullanılır. Testler canlı kullanıcı verisine yazmaz.
- Sunucu hatırlatma testi devreden eski 25.000 / yeni 60.000 / ödeme 10.000 senaryosunda iki dilde 50.000 tutarını doğrular; eski ekstre bildirimi gönderilmez. Finansal tabloya yazılmadığı ayrıca doğrulanır.
- TypeScript ve iOS/Android/web export kontrol edilir. Projedeki eski OCR ekranının effect kaynaklı lint hataları bu çalışmada topluca düzenlenmez; değişen dosyalar HEAD ile karşılaştırılarak yeni lint hatası eklenmediği kontrol edilir. Tarayıcı görselleri native cihaz testi yerine geçmez.
- Yayında önce eklemeli migration'lar, sonra ortak modeli kullanan send-reminders Edge Function, sonra uygulama/OTA gelmelidir. Bu sırayla canlıya uygulandı. OTA grubu `d595dc64-f1c5-4681-be43-5b1bd9bd8e9c`, production kanalındaki 1.0.9 runtime kurulumlarına sunuluyor; iOS/Android manifest ve Hermes SHA-256 kontrolleri geçti. Diğer runtime sürümleri bu OTA kapsamına girmez.
