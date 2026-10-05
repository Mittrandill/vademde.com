# Tasarımdan sapmalar

Tasarımla kod çeliştiğinde kod esas alınır; her sapma burada kayıtlıdır.

## Aşama 1 — Temel
- `accentViolet` marka sabiti olarak (#6B4DFF) kaldı; logo (`VademdeMark`) bunu kullanıyor ve temadan bağımsız olmalı. Ödeme anlamı yeni `payable` token'ından gelir.
- `success` ayrı bir renk olmaktan çıktı, `receivable` ile aynı değer (açıkta #0F7A52, koyuda #52CE96). Mevcut `success` kullanımları otomatik yeni anlama geçti.
- `surfaceElevated` tasarımda tanımlı değil; koyuda #393B3F korundu, açıkta #FFFFFF.
- `fontWeight` aileyi seçmediği için `Text` bileşeni ağırlığı font ailesine çevirir. Plex Mono 700 yüklenmedi (tasarım 400–600 kullanıyor), 700 istenirse 600 kullanılır.
- `Text` içinde `tabular` artık Plex Mono'yu da seçer (tutar/tarih kuralı).
- `BankLogo`, `PersonAvatar`, `ServiceLogo` RN `Text` kullandığı için sistem fontunda kaldı.

## Aşama 2 — Ortak bileşenler
- `BottomSheet`: mevcut `ActionSheet` menü amaçlı kaldı; genel amaçlı sheet ayrı yazıldı.
- `Pager`: yeni bileşen yazılmadı, mevcut `Pagination` tasarımdaki köşe yarıçapı (14) ve `action` rengiyle güncellendi.
- `ListSkeleton`: mevcut `Skeleton` üzerine kuruldu.
- Tarih sheet'leri (`DatePickerSheet`, `DateRangeSheet`, `MonthYearSheet`, `DayOfMonthSheet`) yeni eklendi; mevcut `DateField` modalına dokunulmadı. Ekranlar geçirilirken `DateField` bu sheet'e bağlanacak.
- `TypeRow` + aranabilir sheet yeni; mevcut tam ekran `SearchablePicker` hesap/kategori/kişi için aynen kalır.
- `InstallmentStrip`: ödenen = textPrimary, sıradaki = payable, gecikmiş = danger, bekleyen = mutedControl çerçeve (tasarım dosyasında renk eşlemesi açık yazılı olmadığı için çıkarım).
- `LoadMore` sayaç metni (`n / toplam kayıt`) tasarım örneğinden çıkarıldı; sayfa boyutu 30 çağıran tarafta kalır (`LIST_PAGE_SIZE`).
- `ServiceLogo`, `BankLogo`, `ValueUnitBadge` mevcut bileşenler olarak değişmedi.

## Aşama 3 — Sekmeler
- **Ana sayfa:** Tasarımdaki "2 tasarruf önerisi" kartı (AI, §5.7) backend olmadığı için yok. `QuickActions` ve "Son hareketler" tasarımda yok ama işlev kaybolmasın diye ekranda duruyor; Aşama 5'te Hızlı ekle sheet'i gelince `QuickActions` kalkacak. Hero'nun ikinci sayfası (bu ay gelir/gider) ve ekrandaki tema anahtarı tasarımda yok, kaldırıldı (tema Ayarlar > Görünüm'den değişir). Yaklaşanlar: 7/30 gün sekmeleri ve sayfalandırma yerine ilk 5 kayıt + "Tümü".
- **Hareketler:** Ay gezgini, günlük gruplar ve Gelir/Gider/Net özeti istemci tarafında hesaplanır (kaynaklar zaten tek seferde çekiliyor; sorgular değişmedi). Numaralı sayfalar yerine "Daha fazla yükle" (docs/06 §10.6.2'ye uygun, 30'luk dilim); eski kod 10'luk numaralı sayfa kullanıyordu. Arama ve sıralama arama ikonunun arkasında. "Transfer" sekmesi tasarımda var ama veri tarafında ayrı filtre yoktu (`FILTERS` değişmedi): Tümü altında görünür.
- **Tara:** Tasarımdaki canlı belge algılama (alan alan "algılandı") mevcut kamera akışında yok; görsel olarak yalnızca izin ekranı, kaynak seçimi ve işleniyor adımları yenilendi. İşleniyor ekranındaki "Arka planda devam et" eklenmedi (arka plan bildirimi garantisi yok). Kota doldu / yardım bilgisi hâlâ Alert; sheet'e dönüşümü ayrı iş. Karekod modu (§5.8) sonraki aşama.
- **Takvim:** Hafta/Liste görünümleri ve satırlar yeni renk token'larıyla gelir; ay ızgarası düz yüzeye çevrildi, gün özeti halkasız mono sütunlara.
- **Daha fazla:** Aboneliklerim, Döviz ve altın, Akıllı öneriler, Dışa aktar satırları ilgili ekranlar yapılana kadar eklenmedi. Çek ve senet portföyü (§5.4) gelene dek "Çekler" ve "Senetler" ayrı satırlar. Hesaplar/Krediler/Kartlar satırlarındaki tutar özetleri tasarımdaki gibi sayıya indirildi.
- `Amount`: eksi işareti `-` yerine `−`; gelir/alacak rengi `receivable`. `StatusBadge`: dolgulu hap yerine renkli metin.
- `TabBar`: yüzen çubuk yerine tam genişlikte düz çubuk; üst kenar eski konumda kaldığı için `tara.tsx` kamera kontrolleri etkilenmez.
