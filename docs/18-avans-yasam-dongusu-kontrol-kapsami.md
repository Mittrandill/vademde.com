# Ön ödeme / alınan avans kontrol kapsamı

Bu belge tamamlanmış ürün güvencesi değil; 2026-10-09 tarihli doğrulama ve kalan iş sınırlarıdır.

## Teyit edilen kur kuralı

İşlenen tutar işlem anındaki kuruyla sabitlenir. Açık kalan borç/alacak ve henüz kullanılmamış avans güncel kurla değerlenir. Kaydedilmiş geçmiş hareket sırf güncel kur değişti diye yeniden fiyatlanmaz. Tarihsel ekstre bakiyesi ile bugünkü TL değerlemesi ayrı gösterilmelidir; aradaki fark sessizce başka bir ödeme gibi yazılamaz.

## Kaynaklar ve doğrulama durumu

| Senaryo | Bu paketteki kanıt | Kalan iş |
| --- | --- | --- |
| Nakit/havale/kart/online, alınan avans veya verilen ön ödeme | API testlerinde faturasız ve fazla tutar yolları | Gerçek servis ve tam şema; ilk kayıt atomikliği/idempotency |
| Avansın birden fazla faturaya kısmi/tam mahsubu | API ve yerel PostgreSQL testleri | Tam RLS/plan limiti ve gerçek cihaz |
| Bir mahsubun geri alınması, diğer kullanımların korunması | Yerel PostgreSQL'de üç uygulamadan yalnızca ikinci geri alındı | Geçmiş makbuzları seçme ve farklı editor desteği |
| Açık döviz avansı/borcu ve geçmiş ödeme | Cari liste/detay + rapor/dashboard API testleri | Ekstre değerleme farkının kullanıcıya açık sunumu |
| Fatura henüz yokken çek/senetle avans | Kodda oluşturma yolu var | İlk kayıt atomikliği ve kaynak bağlantılı geri alma |
| Ciro fazlası avans | Mevcut çok adımlı kod incelendi | Her çekin payını ayrı izleyen atomik kayıt |
| Önceden kullanılmış çek avansının karşılıksız olması | Eksiklik kod incelemesinde teyit edildi | Mahsup zincirinin kaynak bazında atomik çözülmesi |
| Nakit/havale iadesi, kart iadesi/chargeback | Bu paket test etmedi | Ayrı ters para hareketi, kısmi iade ve mahsup çözümü |

## Kaynak geri alma için kabul şartları

1. Kullanılmamış 30.000 TL avansın kaynağı geçersizleşirse avans kullanılabilir bakiye olarak kalmamalı.
2. 30.000 TL avansın 20.000 TL'si kullanılmışsa yalnızca o kaynağın kapattığı 20.000 TL yeniden açılmalı; 10.000 TL kullanılmamış pay geçersizleşmeli.
3. 30.000 TL tamamen birden fazla kayda dağıtıldıysa her kaynağa ait pay ayrı çözülebilmeli; başka avanslar veya bağımsız nakit ödemeleri değişmemeli.
4. Birden fazla çekten oluşan ortak avans varsa yalnızca karşılıksız çekin payı çözülmeli. Mevcut ciro kodunun ortak, parent'sız avansı bu güvenceyi sağlamaz; açıklama metninden kaynak tahmin edilmemeli.
5. Alınmış çekin karşılıksız olması ile nakit/havale/kart iadesi ayrılmalı. İlkinde gerçekleşmemiş para için hesap hareketi uydurulmamalı; gerçekleşmiş para iadesinde özgün hareket silinerek tarihçe kaybedilmemeli.
6. Kısmi iade, birden fazla kullanım, başka cariye aktarım ve yeniden mahsup durumunda kaynak payı tutar olarak izlenmeli. Bağlantı kopuksa tarihsel veri tahmin edilip silinmemeli; açık mutabakat gerekmeli.
7. Aynı istek yeniden gönderildiğinde veya yanıt kaybolduğunda ikinci avans, ikinci iade ya da ikinci geri açma oluşmamalı.
8. Aynı avansa eşzamanlı mahsup ve kaynak geri alma birbirinin kapasitesini aşmamalı. Parent/taksit/ödeme kilitleri ortak sabit sıra kullanmalı.
9. Son adım hatası bütün finansal adımları geri almalı. Yetkisiz kullanıcı, başka workspace/cari/birim ve değiştirilmiş ödeme snapshot'ları reddedilmeli.
10. Kaynak iptal/geri alma ekranı etkilenen kayıtları ve tutarları işlemden önce göstermeli. Kaynak türünün etiketi tek başına para hareketi türünü veya hesap türünü kanıtlamaz.

Bu kabul şartları henüz tamamının uygulandığı veya test edildiği anlamına gelmez. Canlı geçişten önce tam Supabase şeması, RLS, trigger sırası, plan limitleri, mobil cihaz ve eski uygulama sürümleriyle doğrulanmaları gerekir.
