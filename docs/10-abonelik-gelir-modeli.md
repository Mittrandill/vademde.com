# Abonelik ve Gelir Modeli

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 14 (s. 23-24)
> Bu dosya abonelik planlarını ve fiyatlama ilkelerini tanımlar.

## Planlar

| Plan | Kapsam |
|---|---|
| Ücretsiz | 1 kişisel çalışma alanı, temel gelir-gider ve borç-alacak, sınırlı OCR, temel bildirim ve rapor |
| Vademde Plus | Birden fazla çalışma alanı, daha yüksek OCR kotası, gelişmiş rapor, sınırsız dışa aktarma, belge arşivi, düzenli işlemler, Face ID |
| Vademde İşletme | Ekip üyeleri, roller, audit log, gelişmiş cari rapor, yüksek dosya/OCR kotası ve işletme özellikleri |

OCR maliyetleri nedeniyle ücretsiz planın aylık belge kotası olmalıdır. Kota bittiğinde manuel giriş açık kalır; kullanıcı belgesini taslak olarak saklayabilir veya ek paket/premium plan kullanabilir. İlk TestFlight döneminde premium özellikler manuel yetkiyle açılabilir.

## 14.1 Fiyatlama ilkeleri

- Aylık ve yıllık abonelik
- Yıllık planda anlamlı indirim
- İşletme planında kullanıcı ve OCR kotasına göre kademelendirme
- Kullanıcıya tarama öncesinde kalan OCR kotasını gösterme
- Başarısız veya okunamayan işlemde kotayı haksız düşürmeme
- iOS dijital özelliklerinde App Store IAP, Android'de Google Play Billing (ikisi de RevenueCat üzerinden, ayrı mağaza ürünleriyle)
