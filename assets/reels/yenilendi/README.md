# Vademde yenilendi — Reels videosu

1080×1920, 30 fps, 28,8 sn, H.264 + AAC stereo; açık (Graphite Finance light) zemin.
Animasyonlar Framer Motion ile yazıldı (yaylı girişler, 3B telefon dönüşleri, ekrandan koparılan
kartlar, fosforlu kalem vurguları, çapraz geçiş bantları). Tek bir zaman değeri (`t`) kare kare
ilerletilip Playwright ile çekilir ve ffmpeg'e beslenir — çıktı kare-kesin ve tekrarlanabilir.

Ses `audio.py` ile yalnızca numpy kullanılarak sentezlenir (telifsiz): 100 BPM, C–G–Am–F;
her ölçü bir sahneye denk gelir. Geçiş "whoosh"ları, kart "pop"ları, çek tarama sesi,
bildirim "ding"i ve giriş/kapanış vuruşu `src/timeline.js` → `audioEvents()` ile görüntüye senkron.

## Akış
| Sn | Sahne |
|---|---|
| 0–2,4 | Logo + "Vademde **yenilendi.**" (belge türü kartları etrafta uçuşur) |
| 2,4–24 | 9 ekran: Ana sayfa, Tara, Takvim, Çek/Senet, Kredi, Kredi kartı, Cari, Raporlar, Bankalar |
| 24–28,8 | Üç telefon yelpazesi + "Şimdi güncelle" |

## Kullanım
```sh
npm install
npx playwright install chromium   # yalnızca ilk sefer (Mac)
npm run render                    # → out/vademde-yenilendi.mp4 (repoya eklenmez)
npm run build && open "dist/index.html?play"   # tarayıcıda canlı önizleme
node preview.mjs 1.5 10 23        # belirli saniyelerden PNG kare → out/preview/
```

## Ekran görüntülerini değiştirmek
`shots/` klasöründeki PNG'leri (1206×2622, çerçevesiz iPhone ekranı) aynı adlarla değiştir:
`home, tara, takvim, instruments, kredi, card, cari, reports, banks`.
Sahne sırası, başlıklar ve öne çıkarılan bölgeler `src/timeline.js` → `SCENES` dizisinde.
