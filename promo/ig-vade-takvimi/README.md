# Instagram reklamı — "Vadeler hâlâ post-it'te mi?"

16 sn, 9:16 (1080×1920), 30 fps, H.264 + AAC. Framer Motion ile yazıldı, kare kare render edilir
(gerçek zamanlı ekran kaydı değildir, takılma olmaz).

| Dosya | Ne için |
|---|---|
| `out/vademde-vade-takvimi.mp4` | Efekt + altlık müzik. Doğrudan yüklenebilir. |
| `out/vademde-vade-takvimi-muziksiz.mp4` | Yalnızca efektler. Müziği Instagram kütüphanesinden ekleyeceksen bunu kullan. |

Bütün sesler `scripts/sfx.py` içinde sıfırdan sentezlenir. Örnek/sample yoktur, telifsizdir.

Mağaza rozetleri resmi vektörlerdir (`assets/brand/app-store.svg`, `google-play.svg`). npm'deki MIT lisanslı
`app-store-badge` ve `localized-responsive-google-play-badge` paketlerinden alındı. İkisi de İngilizce
sürümdür. Türkçe rozet istersen Apple Marketing Tools ve Google Play badge sayfasından indirip bu iki dosyanın
yerine koy. Dosyalar aynı 135×40 oranda olmalıdır.

## Akış

| Sn | Sahne |
|---|---|
| 0–2 | Ajanda + post-it'ler titrer, saat hızlanır — **"Vadeler hâlâ post-it'te mi?"** |
| 2–3,3 | Notlar tek tek uçar — **"Hepsini sil."** |
| 3,3–7,4 | Telefon yükselir; takvim noktaları, halkalar, sayaçlar, vade kartları; banka kartlarına kaydırma |
| 7,4–9,8 | Ana ekran: bakiye/alacak/borç sayar, Gecikmiş kartı kırmızı nabız atar |
| 9,8–12,9 | Kredi ödeme planı taranır → OCR onay ekranı (Güven %99) → "Kontrol Et ve Kaydet" → kayıt bildirimi |
| 12,9–16 | Logo, "Tüm vadeler tek takvimde.", ✓ Reklam yok / ✓ İndirmesi ücretsiz çipleri, App Store ve Google Play rozetleri |

"İndirmesi ücretsiz" ifadesi bilerek seçildi. Ücretsiz plan var (`docs/10-abonelik-gelir-modeli.md`)
ama Plus/İşletme abonelikleri de var. Bu yüzden "tamamen ücretsiz" denmez.

## Yeniden üretmek

```bash
npm install
npm run assets   # ekran görüntülerini hazırlar (assets/source → assets/screens)
npm run all      # build + ses + render → out/
node scripts/render.mjs --stills 0,4.2,8.2   # yalnızca önizleme kareleri
```

- Zaman çizelgesi ve ses ipuçları: `src/timeline.json`. Sahne içi zamanlar bileşenlerdedir.
- Renkler doğrudan `theme/colors.ts`'den gelir (Graphite Finance tokenları).
- Ekran koordinatları 923×2000 ekran görüntüsü uzayındadır (`src/layout.ts`).

## Önerilen gönderi metni

> Çek, senet, fatura, kredi… vadeler hâlâ post-it'te mi? 📌
> Fotoğrafını çek, Vademde okusun. Sen onayla, takvime eklensin.
> Reklamsız. İndirmesi ücretsiz. App Store ve Google Play'de.
> #vademde #çek #senet #esnaf #finans #vadetakibi
