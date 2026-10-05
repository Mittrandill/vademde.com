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
