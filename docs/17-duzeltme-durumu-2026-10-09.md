# Denetim sonrası düzeltmeler — ilk paket

Bu dosya, [denetim raporundaki](16-kapsamli-denetim-2026-10-09.md) bulguların **uygulama durumudur**. Denetim raporu tarihsel bulguları tutar; aşağıdaki değişikliklerin canlıya geçtiği anlamına gelmez.

## Güvenli sınır

- Yalnızca yerel kod, yeni migration dosyaları ve testler değiştirildi.
- Canlı veritabanında migration, kayıt düzeltme, silme, yeni finansal işlem veya deploy yapılmadı.
- Mevcut 2.560 TL fark, 400 TL fazla ödeme ve boş tarihsel altın kuru değiştirilmedi.
- Migration'lar staging doğrulaması ve ayrı canlı geçiş onayı olmadan uygulanmamalı.
- Bu paket henüz üretime hazır kabul edilmemeli; bütün 22 bulgu tamamlanmış değil.

## Hazırlanan değişiklikler

| Alan | Yerel değişiklik | Kalan doğrulama / sınır |
| --- | --- | --- |
| Temel ödeme oluşturma | Yeni `record_payments_v2`; hareket ve ödeme aynı kur snapshot'ını kullanıyor | Tam Supabase şemasında RLS/plan/POS etkileşimi; tekrar isteği idempotency'si |
| Ödeme düzenle/sil | Tek RPC transaction'ı, tutar/tarih için stale-write kontrolü | Eski uygulama sürümleri hâlâ eski çok adımlı yolu kullanır; sürüm geçişi gerekli |
| Fazla ödeme | Sunucuda parent kilidi ve güncel ödeme toplamıyla kontrol; taksit-parent uyumu | Tüm mahsup/ciro/plan oluşturma yollarıyla regresyon |
| Para birimi | Hareket formu create/edit/transfer birimi gönderiyor; sunucu legacy istemcide hesabın birimini çıkarıyor | Gerçek Supabase API ve eski uygulama smoke testi |
| Workspace referansları | Finansal ilişkilerde aynı workspace doğrulaması, transfer birimi kontrolü | Tam şemada FK cascade/silme ve service-role yolları |
| Dosya yetkisi | Viewer INSERT/UPDATE/DELETE kapalı, editor/owner açık; UPDATE kaynak/hedef kontrolü | Gerçek Storage upload/upsert/signed URL testleri |
| OCR yetkisi | Açık editor kontrolü; confirmed/processing/discarded belge yeniden başlatılamaz | İş/kota rezervasyonu ve eşzamanlı OCR hâlâ tamamlanmadı |
| Oturum cache'i | Kullanıcıya bağlı sahiplik kaydı; aynı kullanıcıda cache korunur, kullanıcı değişince indirilen sorgular temizlenir | Cihazda offline login/logout ve bozuk depolama testi |
| Bekleyen işlemler | İşlem pending ise çıkış/hesap silme/cache sahibi değişimi engellenir; restore sonrası kullanıcı doğrulanmadan mutation resume yok | Kalıcı çevrimdışı işlem kuyruğu ve doğal oturum süresi dolması senaryoları |
| Realtime | Workspace'teki bağlı bakiye/rapor/cari sorguları da invalidation alıyor | İki gerçek cihaz ve yoğun olaylarda performans |
| Büyük veri | Ana sayfa, cari liste/özet/ekstre, banka özeti, rapor CSV ve taksit vade bilgisi sayfalı | Takvim/öngörü/diğer sınırlı listelerin tüm tüketicileri henüz tamamlanmadı; eşzamanlı export bir DB snapshot'ı değil |
| Export | Sayfalama + kart planı ve belge alan/kalem/çıkarım tabloları | Gerçek cihazda paylaşım ve geri yükleme; orijinal dosyalar pakete dahil değil |
| Kart taksit ekranı | “Ödendi/kalan borç” yerine açıkça takvim ilerlemesi ve gelecek ekstre yükü | Bu tabloya gerçek ödeme takibi eklenmedi; gerçek borç kart hesabı/ekstrede izleniyor |
| İptal taksit | Vade ve due-info toplamından çıkarılıyor; iptal planı üst borca fallback yapmıyor | Diğer toplamlar/iptal akışları ile tam mutabakat |
| Banka gecikmesi | Eski status etiketi yerine taksit vadesinden gecikme sayısı | Gerçek kredi ekranında karşılaştırma |
| Çek/senet geri alma | Kapalıdan açık duruma geçince portföy etiketi geri açılıyor | Ciro fazlası avans ve karşılıksız senaryosu hâlâ tamamlanmadı |
| Dekont fazlası | Sessizce tutar kırpmak kaldırıldı; fazla dekontta güvenli hata ve avanslı ödeme ekranı yönlendirmesi | Belge onayının atomik/idempotent yeniden tasarımı |
| Belge kısmi başarı | Geçmiş taksit ödeme hatası artık kullanıcıya bildiriliyor | Kaydın bütün adımlarını tek transaction'a alma tamamlanmadı |
| OCR ara yazımları | Çıkarım/alan/kalem/kota/job sonucunda `{error}` artık fırlatılıyor | Başlangıç, ready durumu, cleanup ve kota rezervasyonunun bütünlüğü tamamlanmadı |
| RevenueCat | Abonelik yazım hataları 200 yerine hata yoluna düşüyor | Olay sırası/idempotency ve Shopier atomik kayıt hâlâ tamamlanmadı |
| AI gelir-gider | Anapara giderden ayrılıyor; ekstre toplamının çift sayımı dışlanıyor | AI sayfalama/nakit risk/abonelik kurallarının ortak finans katmanıyla eşitliği tamamlanmadı |
| Eksik kur | Toplam fonksiyonu eksik döviz borcunu sıfır kabul etmek yerine hata veriyor | Bütün ekranlarda hata durumunu görünür sunma testi |
| Owner üyeliği | Doğrudan owner üyeliği silme/değiştirme engeli | Gerçek auth kullanıcı silme ve workspace cascade testi; service-role hesap silme yolu ayrı tutuldu |

## Testler

- `npm run test:finance`: **11 yerel regresyon kontrolü geçti**. Gerçek TS fonksiyonları kullanılır; veri erişimi ve bazı native modüller sahtedir.
- PostgreSQL 17 üzerinde izole sentetik veriyle: fatura 30.000 / tahsilat 10.000 / kalan 20.000; ödeme güncellemede rollback; stale-write engeli; ödeme silmede FK hatası rollback; başarılı silmede yeniden açılma; özel kur eşitliği; yetki ve workspace kontrolleri geçti.
- İki ayrı PostgreSQL bağlantısıyla eşzamanlı test: 30.000 TL borca iki adet 20.000 TL ödeme; **biri kabul, biri ret, 10.000 TL kalan**.
- Gerçek yerel RLS testinde viewer dosyayı okuyabildi, INSERT/UPDATE/DELETE yapamadı; editor UPDATE yapabildi.
- Legacy para birimi çıkarımı, farklı birim transfer engeli, anon RPC yetkisi ve owner üyelik koruması geçti.
- Çek kapanıp yeniden açıldığında portföy durumuna dönme testi geçti.
- TypeScript kontrolü geçti. Çekirdek değişen API/cache dosyalarındaki hedefli lint kontrolü 0 hata; önceki UI lint borcu bitirilmiş değil.

SQL testleri **tam canlı şemanın kopyası değildir**: sadeleştirilmiş fixture kullanır. Gerçek plan limitleri, bütün FK'ler, POS tetikleyicileri, Auth ve Edge/Storage servisleri staging'de doğrulanmalıdır. Bu testler canlı kullanıcı bakiyesiyle çalışmadı.

### Test dosyaları

- `tests/finance-regression.cjs`: tekrar çalıştırılabilir TS testleri.
- `tests/finance-bootstrap.sql`, `tests/finance-atomic.sql`: boş, yalnızca teste ayrılmış `vademde_finance_test` DB için fixture ve SQL kontrolleri.
- `tests/security-bootstrap.sql`, `tests/security-guardrails.sql`: takip eden RLS/yetki kontrolleri.
- `tests/finance-concurrency.cjs`: yalnızca `/private/tmp/vademde-pg-tests.*` yerel socket'i ve `vademde_finance_test` DB'yi kabul eder; TEST_PGHOST/TEST_PGPORT ister.
- `tests/instrument-state.sql`: sentetik çek durum kontrolü.

SQL fixture'ları üretime uygulamayın. İlk fixture roller ve tablolar oluşturduğu için tek kullanımlık boş test cluster'ında sırayla çalıştırılır. Yeni cluster'da önce finance bootstrap, sonra finans migration/test; security bootstrap, security migration/test; instrument migration/test. Concurrency testi kendi ayrı sentetik borcunu açar.

## İkinci paket: kart ödemesi (yerel)

- `20261009101713_atomic_card_payment.sql` ve `record_card_payment_atomic`: kaynak hesap transferi, en eski açık ekstrelere dağıtım ve işlem makbuzu tek transaction içinde. Hata olursa tamamı geri alınır; istemcide başarısız telafi silmesine bağımlı değildir.
- İptal edilmiş ekstreler dışlanır. Kaynak hesabın kredi kartı/POS olmaması, aynı workspace ve birim sunucuda doğrulanır. Ekstre fazlası yalnızca kart hesabına alacak ödeme olarak yansır, gelir/gider yazılmaz.
- Özel `finance_private` şemasında kalıcı işlem kimliği: aynı kimlik ve aynı içerik ikinci transfer oluşturmaz; farklı içerik reddedilir. Uygulama kullanıcısına makbuz UPDATE/DELETE yetkisi verilmez. Şema Data API'ye eklenmemelidir.
- İkinci pakette kart formu UUID'yi yalnızca açık form boyunca koruyordu. Bu sınırlama aşağıdaki üçüncü pakette kalıcı kayıtla ele alındı. Genel ödeme/mahsup/ciro idempotency'si henüz tamamlanmadı.
- Gerçek PostgreSQL bağlantılarıyla aynı isteğin eşzamanlı gönderimi tek transfer üretti. 30.000/10.000/20.000, çoklu ekstre, fazla kart ödemesi, iptal dışlama, içerik çakışması, ödeme adımı hatasında rollback, son adım hatasında rollback ve viewer engeli testleri geçti. Bunlar sadeleştirilmiş fixture testleridir; tam Supabase staging testi değildir.
- `tests/card-payment-bootstrap.sql`, ardından yeni migration, ardından `tests/card-payment-atomic.sql` çalıştırılır; `tests/card-payment-concurrency.cjs` ayrı yerel bağlantılarla kontrol eder. Fixture'lar tek kullanımlık sentetik DB içindir.
- TS regresyon paketi artık **12 test** içeriyor. Kart çağrısının yalnızca atomik RPC kullanması ve aynı request ID ile tekrar gönderimi de kontrol ediliyor.
- Canlı veri veya deploy değişmedi. Yeni RPC staging'de doğrulanıp uygulanmadan bu uygulama sürümü yayımlanmamalı. İkinci paketin TypeScript ve hedefli lint kontrolleri hatasız geçti.

## Tamamlanmayan ana işler

### Üçüncü paket: kart ödemesinin kalıcı kurtarma kaydı

- `features/payments/cardPaymentQueue.ts`: ağ isteğinden **önce** kullanıcı/workspace/kart kapsamında UUID ve özgün kaynak/tutar/tarih saklanır. Uygulama/form yeniden açıldığında aynı istek kullanılır; yeni varsayılan tutar veya bugünün tarihiyle değiştirilmez.
- Form, bekleyen ödeme varken yeni ödeme oluşturmaz. Yeniden deneme işlemi daha önce kaydedilmişse makbuzu alır; kaydedilmemişse özgün ödemeyi tamamlar. Otomatik arka plan gönderimi yoktur.
- Başarı cihazda `confirmed` olarak tutulur. Kullanıcı açıkça “Yeni ödeme başlat” demeden yeni UUID üretilmez. Bekleyen veya sonucu belirsiz kayıt silinemez. Sunucunun kesin olarak reddettiği işlemler için güvenli iptal/tombstone akışı **henüz yoktur**; bu durumda hata sebebi giderilip aynı istek yeniden denenmelidir.
- Sorgu cache'i temizleme, çıkış ve kullanıcı değişimi bu kurtarma kayıtlarını silmez. Diğer kullanıcının kaydı yüklenmez/gönderilmez. Uygulama silinmesi, işletim sistemi verilerinin temizlenmesi ve başka cihazda yeniden giriş yerel kaydı korumaz; cihazlar arası kurtarma henüz yoktur.
- `20261009103815_card_payment_actor_guard.sql`: `record_card_payment_owned` kuyruk sahibini RPC içinde `auth.uid()` ile karşılaştırır. İstemci kontrolü ile ağ çağrısı arasında oturum değişse bile başka kullanıcı adına kuyruk işlenmez. Yetki hâlâ mevcut RPC/RLS tarafından kontrol edilir; istemci oturumu sunucu yetkisi yerine kullanılmaz.
- TS paketi **21 regresyon testi** içerir. Modül yeniden yüklemesiyle yanıt kaybı sonrası aynı ID/payload; ilk saklama hatasında RPC olmaması; onay saklama hatasında aynı ID ile tekrar; içerik değiştirme/silme engeli; kullanıcı ayrımı; eşzamanlı yerel gönderim; bozuk depolama ve cache temizliğinde kuyruğun korunması kontrol edilir. Native depolama sahte olduğundan gerçek cihaz güç kesilmesi/yeniden açılması testi hâlâ gereklidir.
- PostgreSQL'de gerçek `authenticated` rolüyle kuyruk sahibi uyuşmazlığında hareket yazılmadı; doğru sahibiyle yeniden denemede tek transfer oluştu; anon RPC yetkisi yok. `tests/card-payment-owner.sql` yeni actor-guard migration'ından sonra çalışır ve test verisini rollback eder.
- Mahsup incelendi: `settleByOffset` çiftleri ayrı ayrı yazıyor; sonraki çift başarısız olursa önceki çift kalabiliyor. Bu turn'de mahsup/ciro değiştirilmedi; atomik RPC ve tekrar kimliği sonraki paketin işi.
- Canlı migration, veri düzeltme veya deploy yok. Uygulama artık actor-guard RPC'sine de bağlıdır; staging doğrulaması ve migration geçişi olmadan yayımlanmamalı.

### Dördüncü paket: atomik ve kalıcı mahsup

- `20261009105448_atomic_offset_settlement.sql`: tüm karşılıklı ödeme dilimleri ve işlem makbuzu tek transaction'da. Önce parent kayıtlar, sonra taksitler sabit ID sırasıyla kilitlenir. Cari, workspace, birim, ters yön ve istemcinin gördüğü kalan tutar sunucuda doğrulanır. Daha yeni ödeme geldiyse eski snapshot reddedilir.
- Taksit dağılımı istemciden alınmaz; kilit altındaki güncel açık taksitlerden hesaplanır. İptal planı üst borca fallback yapmaz; açık taksit toplamı yetmiyorsa bütün mahsup rollback olur. Aynı parent'a birden fazla çift düşmesi doğru dağıtılır.
- Borç/alacak taraflarında aynı toplam kapanır; hesap hareketi yazılmaz. Kart ekstresi bu cashless yolla kapatılamaz; kart hesabı bakiyesiyle ayrışmasını önlemek için hem API/UI hem RPC akışında dışlanır.
- `features/payments/offsetQueue.ts` ve ödeme ekranı: kullanıcı/workspace kapsamında özgün seçim snapshot'ları, tutar/tarih ve UUID ağ çağrısından önce saklanır. Yanıt kaybı ve yeniden açılmada aynı kimlik/içerik kullanılır. Workspace'te saklanan mahsup sonuçlandırılmadan bu ödeme ekranından yeni işlem başlatılamaz. Kesin başarıda “Yeni işlem başlat” açık onayı gerekir; cache temizliği kayıtları silmez.
- `cancel_offset_request`: kaydedilmemiş isteği aynı kilit altında sunucuda kalıcı iptal makbuzuyla işaretler. Gecikmiş bir ağ çağrısı daha sonra kapanış yazamaz. Zaten kaydedilmiş mahsup iptal edilmez; özgün başarı makbuzu kurtarılır. İptal yanıtı veya yerel saklama başarısızsa aynı kimlikle güvenle tekrar kontrol edilir.
- `update_payment_atomic` / `delete_payment_atomic` ve istemci API'si artık `settled_by_obligation_id` bağlı mahsup/ciro/çek kapanışını tek satır olarak düzenlemeyi/silmeyi reddeder. Karşı tarafı kapalı bırakma riski azaltıldı. **Kaydedilmiş mahsubu topluca geri alma/düzenleme akışı henüz yoktur.** Bu guard ilk yerel finans migration'ına eklendi; ilk paket canlıya uygulanmadığından mevcut üretim fonksiyonunun değiştiği varsayılmaz. Eski uygulamanın doğrudan tablo yazımları hâlâ ayrı geçiş riski.
- Yerel TS paketi **31 regresyon testi**: atomik çağrı/çiftler, UUID+snapshot kurtarma, eşzamanlı yerel gönderim, depolama hataları, kullanıcı ayrımı, açık onay, bozuk kayıt, cache temizliği, tek taraflı düzenle/sil engeli ve iptal senaryoları geçti. TypeScript ve bu pakette değişen dosyaların hedefli lint kontrolleri hatasız geçti.
- PostgreSQL gerçek bağlantılarıyla: 20.000 TL iki taraftan eşit düşüyor; örnek cari neti ve hesap hareketleri değişmiyor. Sonraki çift hatası tüm kapanışları/taksitleri geri alıyor. İki farklı 20.000 TL istek 30.000 TL kayıtlara yarışınca biri kabul, biri ret; her iki tarafta 10.000 TL kalıyor. Aynı UUID yarışında tek kapanış makbuzu oluşuyor. İptal/gönderim yarışında ya tek tam mahsup ya hiçbir kapanış oluşuyor.
- Farklı cari, iptal edilmiş taksit kapasitesi, viewer/anon, işlem makbuzu UPDATE/DELETE yetkisi, tek taraflı RPC düzenle/sil, iptal sonrası gecikmiş gönderim ve kaydedilmiş mahsubun iptal ile bozulmaması doğrulandı. Bunlar tam üretim şeması değil, sadeleştirilmiş fixture testleridir.
- Test sırası: yeni migration → `tests/offset-bootstrap.sql` → `tests/offset-atomic.sql` / `tests/offset-validation.sql` → `tests/offset-concurrency.cjs` → `tests/offset-linked-guard.sql` / `tests/offset-cancellation.sql`. Bootstrap tek kullanımlıktır. Concurrency testini yeniden çalıştırmak mevcut sentetik kimlikleri replay eder; temiz cluster yeni yarış için gerekir.
- Mahsup tamamlandı diye ciro/avans veya bütün programın hazır olduğu sonucu çıkarılmamalı. Ciro hâlâ eski çok adımlı yoldadır. Mobil depolama/gerçek cihaz, tam Supabase/RLS, tüm migration sırası ve plan-limit etkileşimleri staging'de doğrulanmalıdır. Canlı veri/deploy değişmedi; app yeni `settle_offset_atomic` ve `cancel_offset_request` RPC'lerine bağlıdır.

### Beşinci paket: kaydedilmiş mahsubu topluca geri alma

- Ciro/avans akışı incelendi; çek ve faturaların kapanışı, artan avans ve ciro etiketi hâlâ ayrı yazımlardır. Bu pakette ciro uygulanmadı; önce mahsup geri alma zemini tamamlandı. Ciro avansının hangi çeke ait olduğunu koruyan atomik akış ve karşılıksız çek senaryosu sonraki iştir.
- Yeni mahsup makbuzu, kilitli parent'lardaki önceki ödeme kimlikleriyle karşılaştırılarak **yalnızca bu işlemin oluşturduğu satırların** ID ve finansal alan snapshot'larını tutar. Toplam iki tarafın mahsup tutarına eşit değilse işlem reddedilir. Tarih epoch olarak saklanır; saat dilimi farkı snapshot kıyasını bozmaz.
- `20261009111903_reverse_offset_atomically.sql` / `reverse_offset_atomic`: aynı işlem kilidi, sabit parent/taksit/ödeme kilit sırası, bütün snapshot'ların doğrulanması, bütün bağlı satırların silinmesi ve kalıcı geri alma makbuzu tek transaction'dadır. Sonradan yapılan diğer ödemeler silinmez. Geri alınmış UUID yeniden mahsup uygulamaz; geri alma çağrısı tekrarlandığında ikinci silme yapılmaz.
- Silinmiş/değiştirilmiş ödeme satırı, değişmiş cari/yön/birim/workspace veya iptal parent varsa geri alma durur. **Eski makbuzlarda kesin ödeme ID'leri yoksa otomatik geri alma reddedilir**; tarihsel kayıtlar yeniden eşleştirilmedi veya düzeltilmedi.
- İstemci geri alma niyetini ağ isteğinden önce `reversing` olarak saklar. Yanıt kaybı veya son saklama hatasında uygulama yeniden açılınca aynı geri alma devam ettirilir; yeni işlem başlatma ve yerel kaydı silme engellenir. Kesin başarı `reversed` durumudur; açık kullanıcı onayıyla yeni işlem başlatılır.
- Ödeme ekranındaki saklanan son doğrulanmış mahsup için **onay isteyen** “Bu mahsubu geri al” eklendi. Şimdilik bu yol kuyrukta saklanan işlem ve onun sahibi içindir; kuyruk temizlendikten sonraki eski işlemleri seçebilen geçmiş/geri alma ekranı ve başka editor'ün işlemini yönetme yetkisi henüz eklenmedi.
- PostgreSQL sentetik testinde 20.000 TL çoklu mahsup geri alındı, iki taraf/taksitler yeniden açıldı ve sonradan yapılan **2.000 TL ödeme korundu**. Son geri alma makbuzu yazımı hatasında bütün silmeler rollback oldu. Değiştirilmiş satır ve yanlış kullanıcı reddedildi; iki bağlantının eşzamanlı geri alması tek makbuz üretti. Native depolama sahte olduğu için cihaz testi hâlâ gerekir.
- Yerel TS paketi **38 regresyon testi** içerir: geri alma niyeti/sonucu saklama hataları, yanıt kaybı ve modül yeniden açılması, aynı UUID ile tekrar, kullanıcı ayrımı, eşzamanlı istemci çağrısı, bozuk RPC yanıtı ve yeni işlem engelleri geçti. TypeScript ve hedefli lint kontrolleri hatasız geçti.
- Testler: güncel mahsup migration'ındaki snapshot helper/main RPC, sonra geri alma migration'ı → `tests/offset-reverse-bootstrap.sql` → `tests/offset-reverse.sql` → `tests/offset-reverse-concurrency.cjs`. Fixture bootstrap ve concurrency yeni sentetik kimlikler oluşturur; temiz test cluster'ı içindir. SQL test senaryoları rollback edilir; concurrency kendi sentetik işlemini commit eder. Canlı veriyle çalışmazlar.
- Canlı migration/veri düzeltme/deploy yok. Yeni app `reverse_offset_atomic` ve güncel makbuz formatına bağlıdır. Önce bütün migration sırası, tam şema/RLS ve gerçek servisli staging testi gerekir; bu paket bütün programın hazır olduğu anlamına gelmez.

### Altıncı paket: tüm anlık ödeme yöntemlerinde avans ve kur regresyonları

- Kullanıcı tarafından teyit edilen kural: işlenen tutar işlem anındaki kurda sabitlenir; açık borç/alacak ve kullanılmamış avans güncel kurla değerlendirilmeye devam eder. Avans hareketine fatura ödeme kurunu zorunlu kopyalayan bir değişiklik **yapılmadı**. Önceki “kur aktarılmıyor, hata” değerlendirmesi geri çekildi.
- Nakit, havale, kredi kartı ve online ödeme × verilen ön ödeme/alınan avans × faturalı/faturasız: 16 gerçek TypeScript API orchestration senaryosu eklendi. 30.000 TL'nin 20.000 TL faturaya + 10.000 TL avansa ayrılması veya tamamının avans olması; avansın ters yönü, cari, vadesizlik, kaynak hareketi/yöntemi ve sonraki mahsubun yeni para hareketi yazmaması kontrol edildi. Query fake gerçek banka, POS, PostgreSQL trigger veya RLS davranışını taklit etmez.
- Dağıtım hesabında negatif kalan, aynı kaydın tekrarı, NaN/Infinity, kesirli minor tutar veya güvenli integer sınırını aşan değerlerin yanlış avans yaratması önlendi. Ön izleme sıfır tutara izin verir; kaydetme tüm yöntemlerde pozitif tutar ister. Tüm seçimler, dağıtılan tutardan sonra kalan satırlar dahil, yazımdan önce kontrol edilir. Bunlar istemci korumasıdır; sunucu yetki/kapasite kontrollerinin yerini almaz.
- Fatura/avans × borç/alacak için 4 kur regresyonu: 200 USD kalan tutarın kur 45 → 60 olduğunda cari detay/listesinde 9.000 → 12.000 TL olması; 100 USD'lik geçmiş hareketin kayıtlı kurunda kalması; dashboard/rapor eşleşmesi ve avansın gecikme/vade toplamlarına girmemesi doğrulandı. Tarihsel ekstre yürüyen TL bakiyesi ile güncel değerleme aynı kavram değildir; kur farklarını görünür sunma konusu ayrı değerlendirilmelidir.
- `tests/advance-offset-lifecycle.sql`: **sadeleştirilmiş yerel fixture**, dört yöntem × iki yön × TRY/USD = 16 PostgreSQL senaryosu. Mevcut bir avans üç parçada iki faturaya uygulandı; uygulamalar farklı kurları korudu; yalnızca ikinci mahsup geri alındı ve tekrar geri alma güvenliydi. İlk kaynak hareketi ve diğer mahsuplar değişmedi. Avans ve ilk hareket testte önceden oluşturulur: bu SQL testi ilk oluşturmanın atomik olduğunun, kart/POS entegrasyonunun veya kaynak iadesinin kanıtı değildir. Bütün senaryolar rollback edilir.
- TS regresyon paketi **60 kontrol** geçti. Canlı migration, veri mutabakatı veya deploy yapılmadı. Ciro/çekten doğan avansın kaynak bazında izlenmesi, kaynak iptali/iadesi/karşılıksız işleminin sonradan yapılan mahsupları güvenle çözmesi ve ilk ödeme+avans oluşturmanın tek işlem/idempotent olması **henüz uygulanmadı**.

### Yedinci paket: anlık ödeme + avans için atomik sunucu zemini

- `20261009115028_atomic_cash_settlement.sql`: yeni `settle_cash_atomic`, özel/RLS korumalı kalıcı makbuz tablosu ve `cancel_cash_settlement_request`. Nakit/havale/kart/online yöntemleri için fatura ödeme dilimleri, tüm hesap hareketleri, artan avans ve işlem makbuzu tek transaction içindedir. İlk aşama yalnızca **sunucu zemini**; `settleObligations` ve ödeme ekranı hâlâ eski nakit/avans yolunu kullanır. Bu paket app'in atomik akışa geçtiği anlamına gelmez.
- İstek sahibi `auth.uid()` ile eşleşir; çalışma alanında edit yetkisi, hesap/cari/birim/yön, dilim toplamları ve özgün kalan snapshot'ları kontrol edilir. Aynı UUID aynı içerikte özgün makbuzu döndürür; farklı içerik reddedilir. Makbuz sonradan ödeme düzenlendi/silindi diye yeniden para oluşturmaz. Snapshot ve makbuzları uygulama istemcisi UPDATE/DELETE edemez; private schema Data API'ye açılmamalıdır.
- Kilitler hesap metadata'sı için `FOR SHARE`, sonra sabit sıralı bütün parent ve taksit kilitleri şeklindedir. Hesapta `FOR UPDATE`, parent-first eski ödeme yolunun transaction FK `KEY SHARE` kontrolüyle ters kilit/deadlock yaratabileceğinden kullanılmadı. Sonraki payload hazırlığı sunucuya özgün ödeme dilimleri ve yalnızca bu dilimlerin parent kalanlarını göndermelidir.
- Kur davranışı korunur: fatura ödemesi gönderilen işlem kurunda; artan avansın para hareketi oluşum anındaki güncel kurda kaydedilir. Açık avansın değerlemesi mevcut cari hesap fonksiyonlarında güncel kurla sürer. Yeni bir iş kuralı olarak aynı kur zorlanmadı.
- İptal, ödeme kaydıyla aynı UUID kilidinde kalıcı tombstone yazar. İptal kazandıysa gecikmiş gönderim kaydedilemez; ödeme zaten tamamlandıysa iptal onu geri almaz, `confirmed` döndürür. Kaynak iadesi/chargeback başka bir işlevdir ve bu paket kapsamında uygulanmadı.
- Yerel PostgreSQL: dört yöntem × iki yön × TRY/USD × faturalı/faturasız = **32 senaryo** geçti. Tam tutarın ödenmesi halinde gereksiz avans oluşmaması, son makbuz hatasında bütün finansal adımların rollback olması, ikinci taksit hatasında ilk dilimin de geri alınması, eski kalan snapshot'ı, iptal/tekrar gönderim, işlem sahibi ve viewer/anon/kalıcı makbuz yetkileri doğrulandı.
- `tests/cash-settlement-concurrency.cjs`: ayrı bağlantılarda aynı UUID tek ödeme yazdı; farklı UUID ile aynı eski 30.000 TL bakiyeye yarışan 20.000 TL isteklerden yalnızca biri geçti ve 10.000 TL kaldı. İptal/gönderim yarışında ya tam tek avans ya terminal iptal oluştu. Fixture satırları sentetiktir; concurrency kendi verisini commit eder, SQL varyant testleri rollback edilir.
- Test sırası: sadeleştirilmiş mevcut fixture → `tests/cash-settlement-bootstrap.sql` → yeni migration → `tests/cash-settlement-atomic.sql` → concurrency script. Bootstrap sadece disposable fixture'ı genişletir; üretime uygulanmaz. **Tam şema/RLS/plan limitleri, Supabase advisors, bütün migration sırası, POS gerçek servisleri ve mobil cihaz bu testlerin kapsamında değildir.**
- Sonraki gerekli iş: özgün hesap/tutar/tarih/seçim/taksit dilimleri ve UUID'yi ağ çağrısından önce kullanıcı/workspace kapsamında saklayan kalıcı istemci kuyruğu; yanıt kaybı/oturum değişimi/depolama hatası kurtarma; API ve ekranın bu yola geçirilmesi. App bağlanmadan canlı migration/deploy yapılmadı. Ciro/çek kaynaklı avans geri açma ve para iadesi zinciri hâlâ ayrı kalan iştir.

### Sekizinci paket: atomik anlık ödemenin kalıcı istemci akışı

- `features/payments/cashSettlementQueue.ts`: kullanıcı/workspace bazlı `pending/confirmed/cancelled` kayıtları query cache'inden ayrı saklanır. UUID, başlık, seçilen parent kalan snapshot'ları ve **özgün taksit ödeme dilimleri** ilk finansal RPC'den önce kaydedilir. Tekrar denemede güncel taksitlerden yeni dilim hesaplanmaz; eski isteğin makbuzu kurtarılır.
- `prepareCashSettlement` salt-okuma hazırlığı ve `validatePreparedCash` yerel tutarlılık kontrolü eklendi. `settleObligations` anlık ödeme dalı yalnızca kalıcı hazırlanmış payload + aktör + kimlikle `settle_cash_atomic` çağırır. Eski ödeme/avans/transaction ayrı yazımları ve başarısız telafi silmeleri kaldırıldı; güvensiz yola fallback yoktur. Tek satırlık `recordPayment`/belge onayı gibi başka giriş yolları bu pakette yeniden tasarlanmadı.
- Ödeme ekranında hem mahsup hem anlık ödeme kuyrukları kontrol edilir. Eski sonuç belirsiz, okunamıyor veya henüz açıkça onaylanmamışsa yeni yöntem/işlem başlatılamaz. Kurtarma ekranı aynı isteği yeniden kontrol eder, henüz kaydedilmediyse sunucuda iptal eder veya terminal sonuçtan sonra açık “Yeni işlem başlat” onayı ister. Kaydedilmiş anlık ödeme için toplu iade/geri alma butonu eklenmedi; “iptal” bir iade değildir.
- İlk yerel saklama hatasında RPC yapılmaz. Son başarı/iptal saklama hatasında özgün pending kimlik korunur. Hesap, tarih, tutar, cari, birim, yöntem, kategori ve hedef seçim değiştirilemez. Farklı oturum sahibi adına kurtarma yapılmaz. Bozuk yerel payload veya doğrulanamayan RPC makbuzu yeni işlem kilidini kaldırmaz. Cache temizliği anlık ödeme kuyruğunu da silmez.
- TS regresyon paketi **70 kontrol** geçti. Yeni nakit/avans matrisi artık gerçek API'nin atomik RPC yolunu kontrol eder; test fake'i gerçek POS/banka veya mobil depolama değildir.
- `tests/cash-settlement-client-integration.cjs`: gerçek TypeScript API + kalıcı kuyruk kodu + gerçek yerel PostgreSQL RPC yanıtı. USD ödeme/TRY tahsilat, iki taksitli fatura ve faturasız avans testlerinde **sunucu commit ettikten sonra yanıt bilerek kaybedildi**. Modül yeniden açıldığında aynı UUID ve eski dilimler kullanıldı; fatura açık tutarı sıfır kaldı, avans ve hareketler tek kez oluştu. Native AsyncStorage ve gerçek Supabase Auth/RLS yerine reduced mock kullanılır; sentetik fixture satırları commit edilir.
- TypeScript ve değişen istemci/test dosyalarında hedefli lint doğrulaması yapılır; tüm projenin lint borcu temizlenmiş sayılmaz. Bildirimler/dekont yükleme gibi finans sonrası yan etkiler tek transaction içinde değildir; kurtarmada tekrar dekont/bildirim tamamlamak ayrı iştir.
- Yeni app `settle_cash_atomic` / `cancel_cash_settlement_request` ve diğer yeni RPC'lere bağımlıdır. **Canlı migration doğrulanmadan uygulama/OTA yayımlanamaz.** Bu turda canlı veri/migration, OTA veya mağaza yayını yapılmadı. Commit/push ayrı kullanıcı talebiyle bütün mevcut değişiklikleri kapsar; backend deploy değildir. Ciro/karşılıksız çek, kaynak iadesi/chargeback ve kalan genel eksikler aşağıdadır.

### Genel eksikler

1. Borç + plan + geçmiş ödeme + başlangıç hareketini; plan düzenlemesini; kart ödemesini; mahsup/ciro/avansı uçtan uca tek transaction ve idempotent işlem hâline getirmek.
2. Belge onayında finansal kayıt + belge bağlantısını atomik yapmak; tekrar onay ve çift OCR/kota rezervasyonunu engellemek.
3. Shopier işleme + aboneliği atomik yapmak; RevenueCat event kimliği/sırası için koruma.
4. Kalan pagination tüketicileri ve AI kurallarını tek finans tanımıyla eşleştirmek.
5. Lint borcu, tam migration geçmişi/staging kurulumu, mobil cihaz ve gerçek servis testleri.
6. Canlıdaki tarihsel tutarsızlıkları kullanıcı teyidi + yedek + kayıt geçmişiyle ayrı mutabakatla ele almak.

## Canlı geçiş kapısı

İlk olarak yukarıdaki eksik işleri tamamlayın. Sonra tam şema/servisli staging üzerinde yeni ve eski uygulama sürümlerini test edin; güvenlik advisors ve yetki kontrollerini çalıştırın. Mevcut migration tarihleri yerel/remote arasında ayrıştığından **körlemesine `supabase db push` kullanmayın**.

Doğrulanmış yedek ve geri dönüş planı olmadan canlıya geçilmemeli. Yeni app `record_payments_v2`, `update_payment_atomic`, `delete_payment_atomic` fonksiyonlarına bağımlıdır: migration doğrulanmadan app/OTA yayımlamak ödeme kaydetmeyi bozacaktır. Eski güvensiz çok adımlı yol fallback olarak kullanılmaz.

## Önbellek kullanıcı açıklaması

Önbellek yalnızca cihazdaki indirilen kopyadır. Temizleme Supabase'teki faturayı, ödemeyi, hesabı veya bakiyeyi silmez; SQLite taslakları/senkronizasyon kuyruğuna da dokunmaz. Aynı kullanıcı uygulamayı yeniden açınca kendi cache'i korunur. Çıkış veya kullanıcı değişiminden sonra kendi asıl verisi giriş ve bağlantı ile yeniden yüklenir. Bekleyen bir işlem varsa önce işlem sonuçlanmalıdır; başka kullanıcı adına otomatik devam ettirilmez.
