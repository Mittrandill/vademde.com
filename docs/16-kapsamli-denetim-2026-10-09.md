# Vademde kapsamlı doğruluk denetimi — 9 Ekim 2026

## Sonuç

Uygulama için **“tüm işlemler ve tüm ekranlar eksiksiz doğru çalışıyor” onayı verilemez**. Temel ödeme/kalan hesaplama mantığı doğru; ancak canlı veride tutarsızlıklar, hata anında finansal bütünlüğü bozan yollar, döviz kayıt sorunları, eksik toplamlar ve yetki açıkları var.

Bu çalışma bir düzeltme değil, kaynak kodu + canlı veritabanı + yerel senaryo denetimidir. Uygulama kodu ve canlı kayıtlar değiştirilmedi. Canlı sistemde yeni fatura, ödeme veya test kullanıcısı oluşturulmadı. Bu rapor dışında projeye dosya eklenmedi. Tanılama araçları geçici klasörde tutuldu.

Supabase becerisinin güvenlik kontrol listesi doğrultusunda yalnızca hesap formülleri değil, canlı RLS politikaları, dosya yetkileri, fonksiyonlar ve tetikleyiciler de incelendi.

## Kapsam ve sınırlar

İncelenen alanlar: kasa/banka/POS/kredi kartı hesapları; gelir-gider ve transferler; cari hesaplar; borç/alacak ve ödeme dağıtımı; kredi/anapara/faiz/taksit planları; çek-senet/ciro/mahsup; fatura/abonelik/kira/maaş/vergi gibi kayıt türleri; kart taksitleri; döviz-altın; ana sayfa, takvim, raporlar, nakit akışı ve dışa aktarma; belge/OCR/dekont onayı; çalışma alanları/üyelik/yetkiler; oturum/önbellek/realtime; uygulama abonelikleri/ödeme webhookları; bildirim ve zamanlanmış görevler; yapay zekâ finans özetleri.

Kaynak incelemesi bu modüllerin tamamında yapıldı; her ekranın cihaz üstünde bütün etkileşimleri yürütülmedi. App Store/Google Play satın alma, Shopier gerçek ödeme, kamera/OCR servis çağrısı, e-posta ve gerçek telefon push teslimatı uçtan uca denenmedi. Ağ kopması, eşzamanlı iki cihaz ve çevrimdışı kullanım için tam cihaz testi yapılmadı. Dolayısıyla bu çalışma üretim kabul testi veya muhasebe/mevzuat uygunluk belgesi değildir.

SDK sürümüne uygun kaynak: [Expo SDK 57 belgeleri](https://docs.expo.dev/versions/v57.0.0/). Sayfalama değerlendirmesinde [Supabase select belgelerindeki varsayılan 1.000 satır sınırı](https://supabase.com/docs/reference/javascript/select) esas alındı; mevcut projenin özel API satır limiti ayrıca alınmadı. Kodda açık 100/200/500/1.000 sınırları olan yerler bu varsayımdan bağımsızdır.

## Canlı veride doğrulanan sonuçlar

Salt okunur sorgular bütün çalışma alanlarındaki kayıtları kapsadı; aşağıdaki sayılar tek bir müşterinin kayıt sayıları değildir. Sorgular çalışırken sistem canlı olduğu için bunlar tek bir dondurulmuş veri anı değildir.

| Kontrol | Sonuç |
| --- | --- |
| Çalışma alanı / hesap | 56 / 78 |
| Hesap hareketi / borç-alacak kaydı | 238 / 128 |
| Taksit / ödeme / belge | 713 / 173 / 28 |
| Kalan borç ile `max(toplam − ödemeler, 0)` farkı | 0 kayıt |
| Kalan taksit ile `max(taksit − ödemeler, 0)` farkı | 0 kayıt |
| Taksitler toplamı ile üst kayıt toplamı farkı | 0 kayıt |
| Ödeme-taksit üst kayıt uyuşmazlığı | 0 kayıt |
| Ödeme-hareket tutar farkı | 1 kayıt |
| Ödeme-hareket kur bilgisi farkı | 1 kayıt |
| Toplam borcu aşan ödeme toplamı | 1 kayıt |
| Hareket-hesap para birimi uyuşmazlığı | 0 mevcut kayıt |
| Kontrol edilen ödeme/hesap ilişkilerinde farklı workspace | 0 mevcut kayıt |
| Kapalı çek/senet durumundayken pozitif kalan | 0 mevcut kayıt |
| Vadesi geçmiş, kalanlı, durumu hâlâ bekleyen/kısmi taksit | 26 kayıt |
| Public/Storage tablolarında RLS | Açık |
| Aktif cron işleri | 4 |
| Son 24 saatte cron çalışmaları | 242 `succeeded` |
| Döviz/altın kur önbelleği | Bugün güncellenmiş |

Cron başarısı görev SQL'inin çalıştığını gösterir; HTTP servisinin veya telefon bildirim teslimatının başarılı olduğunu tek başına kanıtlamaz.

### Mevcut tutar farkları

- Ödeme `b4e15882-0a34-41c0-bbd5-8f50a4ca0fdb`: **27.040 TL**; bağlı hesap hareketi **29.600 TL**. Fark **2.560 TL**. Aynı hesap, aynı tarih, payable kredi; hareketin `financing_minor` değeri 29.600 TL. Bu, anaparayı giderden ayıran alan sayesinde meşru bir ödeme/hareket farkı değildir: gerçek nakit hareketi ile ödeme tutarı yine aynı olmalıdır. Nasıl oluştuğu tarihçe olmadan kesinleştirilemez.
- Kredi `779c1b14-2dff-4506-bb43-3871c30cb667`: kayıt toplamı **29.600 TL**, ödeme toplamı **30.000 TL**, fark **400 TL**. Kalanı sıfıra kırpan formül bu fazlayı göstermiyor. Bunun bilinçli bir geçmiş veri düzeltmesi olup olmadığı ayrıca teyit edilmeli; kayıt kendiliğinden düzeltilmemeli.
- Ödeme `b958a546-3cba-44a7-8502-a0f217040cfc`: gram altın tahsilatında ödeme kuru boş; bağlı hareketin kur değeri `665815`. Bu tarihsel kaydın TL karşılığı farklı yerlerde farklı kaynaklardan hesaplanabilir. Yeni tetikleyici eski boş kayıtları otomatik doldurmuyor.

## Öncelikli bulgular

Kanıt türleri: **Canlı** = salt okunur gerçek kayıt/şema/politika; **Test** = gerçek TS fonksiyonuyla sahte veri erişimi/hata enjeksiyonu; **Kod** = kaynak akışı. Testler gerçek sunucu veya cihaz denemesi değildir. “Risk” ifadesi olayın üretimde yaşandığını değil, kod yolunun buna izin verdiğini belirtir.

### 1. Ödeme düzenleme ve silme atomik değil — kritik

Kaynak: [payments/api.ts](../features/payments/api.ts), `updatePayment`, `deletePayment`. Kanıt: Kod + Test; canlı tutar farkı ayrıca mevcut.

Düzenlemede önce hesap hareketi, sonra ödeme güncelleniyor. İkinci adım hata verirse 10.000 TL ödeme aynı kalırken hareket 15.000 TL olabiliyor. Silmede önce ödeme, sonra hareket siliniyor; ikinci adım hata verirse borç yeniden açılıyor ama kasadaki çıkış/giriş kalıyor. İki hata yolu yerelde yeniden üretildi. Canlı farkın bu yoldan kaynaklandığı iddia edilmiyor.

Öneri: düzenleme/silme de oluşturma gibi tek veritabanı transaction'ında yapılmalı; başarı cevabı tüm adımların başarısını ifade etmeli.

### 2. Fazla ödeme ve eşzamanlı ödeme koruması yalnızca istemcide — yüksek

Kaynak: [payments/api.ts](../features/payments/api.ts), `assertWithinRemaining`; [record_payments migration](../supabase/migrations/20261009140000_record_payments_atomic.sql). Kanıt: Kod + Canlı fonksiyon + Canlı fazla ödeme.

Yeni ödeme batch'i atomik, fakat RPC içinde kalan tutar kilitlenip yeniden doğrulanmıyor. İki cihaz aynı kalanı okuyup ikisi de ödeme gönderebilir. Sonradan çalışan kalan tetikleyicisindeki kilit, önceki onayı güvenli hâle getirmiyor. Doğrudan API yazımı da istemci kontrolünü atlayabilir. Canlı veride bir üst kayıt toplamından 400 TL fazla ödenmiş.

Öneri: sunucuda hedef satır kilidi, güncel kalana göre kontrol ve istek tekrarını önleyen benzersiz işlem anahtarı. Yarış senaryosu izole test veritabanında denenmeli.

### 3. Normal hareket ve transfer ekranında para birimi gönderilmiyor — yüksek

Kaynak: [transactions/new.tsx](../app/transactions/new.tsx), kayıt/düzenleme mutation'ları; [transactions/api.ts](../features/transactions/api.ts), `createTransfer`. Kanıt: Kod + Canlı varsayılan ve tetikleyici.

Ekran seçili USD/altın hesabının birimiyle tutarı ayrıştırıyor fakat normal oluşturma/düzenleme payload'ına `currency_code` eklemiyor. Transfer çağrısı da `currencyCode` göndermiyor. Canlı veritabanında varsayılan TRY; mevcut tetikleyici hesap para birimini otomatik kopyalamıyor, yalnızca zaten verilmiş para birimine kur buluyor. USD/altın hesap kaydı TL olarak saklanabilir; düzenlemede eski birim kalabilir. Mevcut 238 harekette uyuşmazlık olmaması bu yeni kayıt yolunu doğrulamaz.

Öneri: istemcide birimi açık gönderme; sunucuda hesap/hareket ve transfer taraflarının birim eşleşmesini zorunlu kılma.

### 4. Ödeme ile hareket aynı kurdan hesaplanmıyor — yüksek

Kaynak: [payments/api.ts](../features/payments/api.ts), `buildPaymentItems`; [record_payments migration](../supabase/migrations/20261009140000_record_payments_atomic.sql); kur tetikleyicileri. Kanıt: Test + Kod + Canlı.

Özel kur ödeme alanına konuyor, hareket alanına taşınmıyor; RPC de hareket insert'ine bu alanı koymuyor. Hareket kendi güncel kurunu alıyor. Örneğin 100 USD, ödeme kuru 40 TL, güncel kur 45 TL ise ödeme 4.000 TL, rapor hareketi 4.500 TL karşılığına dönüşebilir. Geçmiş tarihli yeni kayıtların kur kaynağı da kayıt günündeki güncel önbellek; ödeme tarihi için tarihsel kur seçilmiyor. Mevcut boş altın ödeme kuru ayrıca tespit edildi.

Öneri: tek kur politikası ve tek kur snapshot'ı; geçmiş tarih/manuel kur kurallarını netleştirme. Eski kayıtların kurunu bugünkü kurla gelişigüzel doldurmama.

### 5. Kart taksitleri gerçek ödeme olmadan “ödendi” oluyor — yüksek

Kaynak: [cardInstallments/api.ts](../features/cardInstallments/api.ts), `progressOf`; [kart taksit ekranı](../app/accounts/[id]/installments.tsx). Kanıt: Test + Kod.

Ödenen taksit sayısı ödeme kayıtlarından değil, geçen aylardan çıkarılıyor. Ocakta başlayan 12.000 TL/12 taksit alışveriş ekimde, hiç ödeme girilmese de 9 taksit ödenmiş ve 3.000 TL kalmış görünüyor. Ekran açıkça “ödendi” diyor. Bu kayıtlar ayrı bir plan tablosu; gerçek ödemeyle eşleştirme yok.

Öneri: gerçek ödemeyle mutabakat; sadece takvim planı amaçlanıyorsa “geçen dönem/gelecek ekstre yükü” olarak gösterme ve borç bakiyesi gibi sunmama.

### 6. Ana sayfa, cari, takvim ve bazı raporlar büyük veride eksik — yüksek

Kaynak: [dashboard/api.ts](../features/dashboard/api.ts), [counterparties/api.ts](../features/counterparties/api.ts), [reports/api.ts](../features/reports/api.ts), takvim/ödeme listesi çağrıları. Kanıt: Test + Kod.

Ana sayfa aylık toplamında tüm sayfalar çekilmiyor; rapor ana toplamında ise `fetchAll` var. Varsayılan limitli sahte sunucuda 1.001 adet 1 TL gider: ana sayfa 1.000 TL, rapor 1.001 TL çıktı. Cari ekstre sorgularında açık 1.000 sınırı var. Takvim/öngörü/açık kayıt çağrılarında 100/200/500 gibi sınırlar da bulunuyor. Özetler yalnızca ilk sayfa üzerinden oluşturulursa doğruluk veri büyüdükçe bozulur. Her liste sınırı hata değildir; **tam toplam veya tam evren bekleyen tüketicilerde** sorundur.

Öneri: tam toplamlar için sunucuda aggregate veya güvenilir sayfalama; görünür liste limiti ile finansal toplamı ayırma. 1.001 ve 5.001 kayıtla modüller arası mutabakat testi.

### 7. “Tam veri dışa aktarma” tam değil — yüksek

Kaynak: [export/api.ts](../features/export/api.ts), `EXPORTED_TABLES`, `buildWorkspaceExport`; rapor CSV veri sorgusu. Kanıt: Test + Kod.

Tablo başına tek sorgu var; 1.001 işlem testinde 1.000 işlem çıktı. Kart alışveriş taksit tablosu ve belge alan/kalem/çıkarım tabloları listede yok. Orijinal belge dosyalarının bilinçli dışarıda bırakıldığı kodda yazılı; bu ayrı bir ürün sınırı, hata sayılmadı. Fakat paket eksiksiz finansal yedek olarak güvenilir değil.

Öneri: sayfalama, tablo kapsamı, beklenen/çıkan kayıt sayısı kontrolü ve geri yükleme testi; eksik paket sessizce başarılı sayılmamalı.

### 8. Viewer belge dosyasını silebilir veya değiştirebilir — kritik yetki sorunu

Kanıt: Canlı `storage.objects` financial-documents INSERT/UPDATE/DELETE politikaları.

Dosya yazma politikaları `is_workspace_member` kullanıyor; owner/editor kontrolü yapmıyor. Dolayısıyla yalnızca görüntüleyici üye de dosya yükleme/değiştirme/silme yetkisi alıyor. Belge tablosundaki daha sıkı yazma politikası dosyayı korumuyor. Hiçbir kullanıcı adına silme/istismar denemesi yapılmadı.

Öneri: dosya yazımlarını `can_edit_workspace` ile sınırlandırma; kaynak/hedef klasörü UPDATE için birlikte doğrulama; viewer/editor izolasyon testleri.

### 9. OCR servisi okuma yetkisini yazma yetkisi yerine kullanıyor — yüksek

Kaynak: [process-document/index.ts](../supabase/functions/process-document/index.ts). Kanıt: Kod + Canlı SELECT politikası.

İlk kontrol kullanıcının belgeyi SELECT edebilmesi. Sonra service-role ile belge/job/çıkarım yazılıyor; editor/owner kontrolü yok. Viewer sahibi olduğu çalışma alanı üyeliğiyle OCR başlatıp belge durumunu değiştirebilir ve sahibin kotasını tüketebilir. Onaylı belgeyi tekrar işlemeden önce durum/iş kilidi kontrolü de yok.

Öneri: sunucuda açık yazma yetkisi, izin verilen durum geçişi, tek aktif iş/tekrar koruması ve atomik kota rezervasyonu.

### 10. Çalışma alanları arası referans bütünlüğü eksik — yüksek

Kanıt: Canlı RLS, FK kısıtları ve pg_trigger listesi.

Temel politikalar yazılan satırın `workspace_id` yetkisine bakıyor. FK'ler bağlı hesabın/cari kaydın/üst borcun da aynı workspace'te olmasını zorunlu kılmıyor; bunu zorlayan bir referans doğrulama tetikleyicisi görülmedi. Farklı iki çalışma alanına erişen kullanıcı API'de yanlış bağ kurabilir. Mevcut kontrol edilen ilişkilerde böyle bir kayıt bulunmadı; başka kullanıcı verisinin okunduğu iddia edilmiyor.

Öneri: workspace içeren bileşik ilişkiler veya merkezi referans doğrulaması; ödeme-taksit-üst kayıt uyumu ve transfer hedefleri dahil.

### 11. Kullanıcı değişiminde finansal önbellek ayrılmıyor — yüksek

Kaynak: [queryClient.ts](../services/queryClient.ts), [queryKeys.ts](../services/queryKeys.ts), [auth/api.ts](../features/auth/api.ts), kök oturum akışı. Kanıt: Kod; cihaz testi yapılmadı.

Kalıcı cache tek `vademde-query-cache` anahtarında. Profil/workspace/abonelik anahtarları kullanıcı kimliği içermiyor; çıkışta cache temizliği yok. Aynı telefonda başka kullanıcı girişinde eski profil/çalışma alanı/plan ve erişilebilir eski cache görünebilir. Sunucu RLS'yi delmekten ayrı, cihazda daha önce alınmış verinin izolasyonu sorunu.

Öneri: kullanıcıya göre cache namespace veya oturum değişiminde bellek + disk cache temizliği; logout/login ve offline geçiş testi.

### 12. Diğer cihazdaki işlem tüm bağlı ekranları yenilemiyor — orta/yüksek

Kaynak: [realtime.ts](../services/realtime.ts), [queryKeys.ts](../services/queryKeys.ts). Kanıt: Kod.

Realtime olayı yalnızca `[workspace, entity]` prefix'ini tazeliyor. Yeni hareket transactions listesini yenilerken hesap bakiyesi/rapor/cari sorgularını yenilemiyor. Ödeme olayı obligations'a indirgeniyor; ayrı detay anahtarları da kaçabiliyor. Aynı cihazdaki ortak invalidation yardımcı fonksiyonu daha kapsamlı, fakat realtime onu kullanmıyor. Sonuç: veritabanı doğru olsa da açık ekran geçici olarak yanlış bakiye gösterebilir.

Öneri: olaydan etkilenen bütün sorgular için ortak bağımlılık haritası; iki cihaz açıkken mutabakat testi.

### 13. Oluşturma/plan güncelleme/mahsup/ciro akışları yarım kalabilir — yüksek

Kaynak: [obligations/new.tsx](../app/obligations/new.tsx), [obligations/api.ts](../features/obligations/api.ts), [payments/api.ts](../features/payments/api.ts). Kanıt: Kod + mahsup Test.

Üst kayıt, taksitler, geçmiş ödemeler ve başlangıç finansman hareketi ayrı adımlarla yazılıyor. Plan değişikliği silme/insert/per-row update/üst toplam aşamalarına ayrılıyor. Mahsup/ciro birden fazla çift için döngüde yazılıyor. İkinci mahsup çifti hata verdiğinde ilk çiftin iki ödeme satırı kalması yeniden üretildi. Bazı yollar telafi yapıyor, fakat telafi de ayrı istek ve hata kontrolü eksik olduğundan garanti değil.

Öneri: finansal işlem başına transaction + idempotency; hata sonrasında “hiçbir şey kaydedilmedi” varsayımıyla tekrar ettirmeme.

### 14. Dekont tutarı kalan borcu aşarsa fazla kısım kayboluyor — yüksek

Kaynak: [receipt.tsx](../app/documents/[id]/receipt.tsx), ödeme eşleştirme `Math.min(amountMinor, payCapMinor)`. Kanıt: Kod.

20.000 TL dekont 10.000 TL kalan borca eşlenince ödeme ve bağlı hesap hareketi 10.000 TL'ye kırpılıyor. Fazla tutar için avans/ayrı hareket oluşturulmuyor. Normal tahsilat dağıtımında mevcut olan avans davranışı burada yok. Dekont toplamı ile kasa hareketi mutabakatı bozulabilir.

Öneri: fazlayı açıkça ayrı işlem/avans olarak işle veya onaydan önce kullanıcıya eksik muhasebeleşeceğini gösterip seçim iste.

### 15. Belge onayında bazı kayıt hataları başarı gibi sunuluyor — yüksek

Kaynak: [review.tsx](../app/documents/[id]/review.tsx), geçmiş taksit ödeme `catch`; [process-document](../supabase/functions/process-document/index.ts), ara yazımlar. Kanıt: Kod.

Kullanıcının “geçmiş taksit ödendi” seçimlerini kaydetme başarısızlığında catch yalnızca geçiyor; belge yine onaylanabiliyor. OCR servisindeki birçok ara insert/update Supabase `{error}` sonucunu denetlemiyor. Belge alanları/kalemleri/iş kayıtları eksikken hazır/başarılı durumu oluşabilir. Finansal kaydı oluşturma ile belgeyi onaylama ayrı adımlar; son adım hatasında tekrar onay mükerrer kayıt riski taşır.

Öneri: zorunlu yazımların hata kontrolü, onay idempotency'si ve tutarlı durum makinesi; kısmi başarı açık anlatılmalı.

### 16. İptal edilmiş taksit vade toplamına girebiliyor — orta

Kaynak: [obligations/api.ts](../features/obligations/api.ts), `getDueBreakdown`. Kanıt: Test + Kod.

Pozitif kalanlı taksitler alınırken taksitin `iptal_edildi` durumu dışlanmıyor. Aktif üst kaydın iptal taksiti 100 TL vade toplamına dahil edildi. Mevcut canlı veride pozitif kalanlı iptal taksit bulunmadı.

Öneri: iptal/draft/kapalı filtrelerini bütün toplamlar için tek tanımda toplama.

### 17. Banka gecikme sayısı tarihten değil eski durum etiketinden geliyor — orta

Kaynak: [banks/api.ts](../features/banks/api.ts), `overdueLoanCount`. Kanıt: Kod + Canlı tarihe göre gecikmiş 26 taksit.

Banka özeti yalnızca `status === 'gecikti'` üst kayıtlarını sayıyor. Tarih ilerledikçe status kendiliğinden günlük güncellenmiyor; kalanlı vadesi geçmiş taksitler bekleyen/kısmi etikette kalabiliyor. Vade hesaplayan diğer ekranla banka gecikme sayısı ayrışabilir. 26 taksitin tamamının banka kredisi olduğu iddia edilmiyor.

Öneri: gecikmeyi kalan + vade üzerinden hesaplama; status ile zamana bağlı görüntü etiketini ayırma.

### 18. Çek/senet ödeme iptalinde portföy durumu geri açılmıyor — orta/yüksek

Kaynak: [instrument_status.sql](../supabase/migrations/20261005130000_instrument_status.sql), `instrument_status_on_close`. Kanıt: Kod + Canlı tetikleyici tanımı.

Kapanışa geçişte `instrument_status` ödenmiş/tahsil edilmiş oluyor; ödeme silinip normal status tekrar açıldığında bunun tersine geçişi yok. Borç yeniden açıkken portföy etiketi kapalı kalabilir. Mevcut canlı veride bu uyuşmazlık bulunmadı.

Öneri: geri alma için güvenli durum geçişleri ve işlem tarihçesi. Ciro/karşılıksız/avans geri alma senaryoları birlikte test edilmeli.

### 19. Abonelik webhookları DB başarısızlığını başarı diye kabul edebilir — yüksek

Kaynak: [revenuecat-webhook](../supabase/functions/revenuecat-webhook/index.ts), [shopier-webhook](../supabase/functions/shopier-webhook/index.ts). Kanıt: Kod; gerçek ödeme yapılmadı.

Supabase çağrıları çoğunlukla hata fırlatmak yerine `{error}` döndürür. Webhook yazımları bunu denetlemiyor; abonelik kaydı başarısızken 200/success dönülebilir. Shopier “işlendi” kaydını abonelik güncellemesinden önce yazıyor; sonraki güncelleme başarısızsa tekrar webhook işlenmiş kabul edilip atlanabilir. RevenueCat'te olay sırası/idempotency koruması görülmedi; gecikmiş expiration yeni renewal'ı geri alabilir.

Öneri: işleme kaydı + abonelik değişimini atomik yapma; event kimliği/zamanına göre sıra kontrolü; başarısız yazımda tekrar denemeye izin veren cevap.

### 20. Yapay zekâ özeti raporla aynı finans kurallarını kullanmıyor — orta/yüksek

Kaynak: [ai-ask](../supabase/functions/ai-ask/index.ts), [generate-insights](../supabase/functions/generate-insights/index.ts), [reports/api.ts](../features/reports/api.ts). Kanıt: Kod.

Rapor giderden `financing_minor` anaparasını çıkarıyor; AI aylık ve kategori özetleri ham `amount_minor` topluyor. 10.000 TL kredi ödemesinde 8.000 TL anapara/2.000 TL faiz varsa rapor 2.000 TL gider, AI 10.000 TL gider temelinde yorum üretir. Bazı AI nakit risk yollarının gecikmiş alacak varsayımı da ortak tahminden farklı. AI anlatımı, doğru kabul edilen rapor verisine dayanmalı.

Öneri: bütün finans tüketicilerini ortak hesaplama/aggregate katmanına bağlama; AI'ya ham tablo yerine doğrulanmış sonuçları verme.

### 21. Kur eksikliği borç tutarını toplamda sessizce sıfırlıyor — orta/yüksek

Kaynak: [valueUnits/api.ts](../features/valueUnits/api.ts), `sumToReferenceMinor`. Kanıt: Test + Kod; mevcut kurlar güncel.

Eksik USD kuru ile USD borç toplamda 0 TL etkili oluyor; kullanıcıya toplamın eksik olduğu bilgisi taşınmıyor. Mevcut canlı kur kaynağında bu sorun yok, fakat yeni birim/yükleme hatasında ortaya çıkabilir.

Öneri: eksik kurda “toplam hesaplanamadı/eksik” sonucu; kayıt biriminde kalanları görünür tutma, sessiz sıfır kullanmama.

### 22. Owner üyeliği doğrudan silinebilir — orta yetki/bütünlük

Kanıt: Canlı `workspace_members` DELETE politikası ve tetikleyici listesi; üyelik RPC'si.

RPC owner çıkışını engelliyor, fakat doğrudan DELETE politikası owner veya kişinin kendisini silmesine izin veriyor. Owner üyeliğini koruyan tetikleyici görülmedi. Bu, arayüz korumasının API'de atlanıp alanın sahiplik/üyelik ilişkisini bozabilmesi riskidir; silme denemesi yapılmadı.

Öneri: owner üyeliğini veritabanında koruma; sahiplik devri/hesap silme akışını ayrı yetkili işlem olarak tasarlama.

## Doğru çalışan / olumlu doğrulanan noktalar

- Ödeme oluşturma RPC'si ödeme + hesap hareketi batch'ini tek transaction'da yazıyor; oluşturma yolu düzenleme/silmeden daha sağlam.
- Canlı kalan borç/taksit formülleri ödeme değişiminde yeniden hesaplanıyor. Mevcut kayıtların tamamında formülle kalan tutar uyuşuyor.
- Kullanıcının örneği olan 30.000 TL alacak − 10.000 TL tahsilat = 20.000 TL kalan dağıtımı yerel gerçek fonksiyon testinde doğru. Bu örnek canlı sisteme yazılarak denenmedi; canlı tetikleyici tanımı ve mevcut kayıt mutabakatı ayrıca doğrulandı.
- 35.000 TL tahsilatı 30.000 TL kapanış + 5.000 TL fazla tutar olarak ayırma fonksiyonu doğru.
- Test edilen kasa/kart/transfer işaretleri, kredi anaparasını kâr-zarar dışında tutma, Türkçe para ayrıştırma, ay sonu taksit tarihi ve kuruş yuvarlaması doğru.
- Amortisman 100 farklı taksit sayısında toplam anapara ve anapara+faiz=taksit kontrolünden geçti. Bu ekonomik faiz oranının/ürün sözleşmesinin uygunluğunu doğrulamaz.
- POS komisyonu için canlı otomatik hareket tetikleyicisi mevcut; aynı işlemin içinde çalışıyor. Gerçek POS ödeme/komisyon mutabakatı yapılmadı.
- Temel tablolar RLS korumalı; kritik recompute fonksiyonlarının anon/authenticated doğrudan çalıştırma izinleri kapalı. Yetki yardımcıları kullanıcı üyeliğini kontrol ediyor. RLS açık olması yukarıdaki Storage/referral açıklarını ortadan kaldırmıyor.

## Teknik test sonuçları

| Kontrol | Sonuç / yorumu |
| --- | --- |
| `npm run typecheck` | Geçti |
| `npm run lint` | Başarısız: 17 hata, 26 uyarı |
| Geçici TS senaryo aracı | 16 kontrol geçti: 7 normal davranış + 9 hatanın varlığını doğrulayan kontrol |
| Amortisman alt senaryoları | 100 |
| Canlı tutarlılık sorguları | Yukarıdaki sayısal sonuçlar |
| Canlı migration listesi | Yerel/remote sürüm adlandırma ve zamanları ayrışıyor |
| CLI schema dump | Docker çalışmadığı için alınamadı; şema SQL metadata sorgularıyla incelendi |

“16 kontrol geçti” ifadesi uygulamanın tüm testleri geçti demek değildir: dokuz kontrol bir hatayı başarılı biçimde yeniden üretmektedir. Sahte erişim katmanı gerçek ağ, Postgres transaction ve RLS davranışını taklit etmiyor. Geçici araç konumları: `/private/tmp/vademde-audit-20261009.cjs` ve `/private/tmp/vademde-live-audit.cjs`; kalıcı test altyapısı yerine geçmez.

Lint hataları ağırlıkla React effect içinde state güncelleme ve memo bağımlılık kuralları; bunlar tek başına finansal yanlışlık veya uygulama çökmesi kanıtı değildir. Ortamdaki Node v20.17.0 için Expo araçları desteklenmeyen sürüm uyarısı veriyor; doğrulama ortamı SDK gereksinimine yükseltilmeli.

Migration timestamp farkı tek başına canlı sunucuda bir özellik eksik demek değildir: ödeme RPC'si ve kur tetikleyicilerinin canlıda bulunduğu ayrıca doğrulandı. Ancak bu repo ile sıfırdan aynı şemanın kurulabilmesi ve migration geçmişinin eşleştirilmesi henüz doğrulanmış değil.

## Düzeltme ve kabul testi sırası

1. Mevcut 2.560 TL hareket/ödeme farkını ve 400 TL fazla ödemeyi geçmiş kayıtlarla mutabık kıl; önce yedek ve kullanıcı teyidi. Otomatik silme/düzeltme yapma.
2. Ödeme düzenle/sil, kalan kontrolü ve çok adımlı finans işlemlerini sunucu transaction'ına al; tekrar koruması ekle.
3. Para birimi/kur snapshot'ını bütün kaydetme yollarında tekleştir; hesap ve workspace referans doğrulamasını zorunlu kıl.
4. Viewer Storage/OCR yazımını ve oturum cache izolasyonunu düzelt.
5. Kart taksidi ödeme gerçekliği, eksik toplamlar, dışa aktarma ve realtime bağımlılıklarını düzelt.
6. Belge onayı/webhook durum makineleri, geri alma ve gecikme/iptal filtrelerini düzelt.
7. Ortak finans hesapları üzerinden UI, rapor, CSV ve AI için eşitlik testleri kur; lint ve migration tekrar kurulumu doğrula.

İzole staging ortamındaki kabul testleri en az şunları kapsamalı: her kayıt türünde oluştur/düzenle/sil; 30.000/10.000/20.000 fatura senaryosu bütün ekranlarda; kısmi/tam/fazla ödeme ve avans; eşzamanlı iki ödeme; kredi faiz/anapara ve erken kapama; kredi kartı ekstre/alışveriş/taksit/ödeme/refund; POS komisyonu; transfer ve döviz/altın; çek/senet tahsil/ciro/karşılıksız/iptal; mahsup; iptal ve geçmiş tarih; belge yeniden onayı ve her adımda hata; 1.001/5.001 kayıt; viewer/editor/owner; iki kullanıcı aynı cihaz ve iki cihaz aynı workspace; satın alma webhook tekrar/sıra/hata; bildirim teslimatı; eksiksiz export ve geri yükleme.

Bu kabul testleri tamamlanmadan “tüm program tam anlamıyla düzgün çalışıyor” sonucuna geçilmemeli.
