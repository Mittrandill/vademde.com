# App Preview (video) senaryosu — 1.0.4

Apple, App Preview'ların uygulamanın gerçek ekran kaydı olmasını ister; tasarım animasyonu ya da ekran
görüntüsü slayt gösterisi kabul edilmez. Bu yüzden video, TestFlight'taki 1.0.4 build'inden iPhone'da
alınmış ekran kaydıyla hazırlanır (Kontrol Merkezi → Ekran Kaydı). Süre 15–30 sn, dikey, sessiz de olabilir.
Ekran kaydını attığında kesip hızlandırıp yüklemeye hazır hâle getiririm (ffmpeg).

Önce demo hesabı hazırla: örnek veriyle bir çalışma alanı, birkaç açık borç/alacak, bir taksitli kredi.

| Sn | Sahne | Ne yapılır | Ekranda görünen |
|---|---|---|---|
| 0–4 | Tara | Tara sekmesi → "Kameradan Tara" → bir çeki çerçeveye al | Köşe işaretleri, tarama çizgisi, "Taranıyor... %65" |
| 4–9 | Onay | Sonuç ekranı → alanlar yeşil güvenle görünür → "Onayla" | Tutar, vade, keşideci, %98 güven |
| 9–13 | Takvim | Takvim sekmesi → vade günleri, bugünün vadesi | Renkli noktalar, günün kayıtları |
| 13–19 | Dekont | Dekont tara → eşleşen taksit seçili → "Ödeme olarak kaydet" | Gönderen/alıcı, eşleşme kartı |
| 19–23 | Arşiv | Daha Fazla → Belge Arşivi → bir dekonta dokun → açılır | Aya göre liste, dosyanın açılması |
| 23–27 | Ana sayfa | Ana sayfa → bakiye kartını kaydır (Bu Ay) | Toplam bakiye, borç/alacak |
| 27–30 | Kapanış | Paywall veya ana sayfa | "7 gün ücretsiz" |

Not: Tara sahnesinde gerçek bir kamera görüntüsü gerekir; test çekini bir masa üstüne koyup çek.
