Bu repoda `design/vademde-redesign/` klasöründe Vademde uygulamasının yeni tasarımı var.
Önce `design/vademde-redesign/HANDOFF.md` dosyasını baştan sona oku; tek doğruluk kaynağı odur.
Ardından CLAUDE.md, AGENTS.md ve docs/ altındaki 05, 06, 08 numaralı dokümanları oku.

Görev: Bu tasarımı projeye aktar ve tasarımda olup projede olmayan özellikleri ekle.

Çalışma kuralları:
1. HANDOFF.md §6'daki sırayı izle. Her aşama ayrı bir commit (ve mümkünse ayrı PR) olsun.
   Bir aşamayı bitirmeden sonrakine geçme; her aşamanın sonunda ne yaptığını ve sıradakini özetle.
2. Mevcut iş mantığına dokunma: veri hook'ları, Supabase sorguları, mutasyonlar, doğrulamalar,
   plan kısıtları ve RLS aynı kalır. Değişiklik yalnızca görsel katmanda olmalı; istisna §5'teki
   yeni özelliklerdir.
3. Her ekran için önce ilgili `ekranlar/acik/<Ad>.html` ve `ekranlar/koyu/<Ad>.html` dosyalarını oku,
   sonra §4 tablosundaki kod dosyasını güncelle. Renk ve yazı tipini asla sabit yazma; theme token'larını
   kullan (§1, §2). Ekranlardaki isim/tutar/tarihler örnek veridir; gerçek veriyi kullan.
4. Önce ortak bileşenleri yaz (§3), ekranları bunlarla kur. Aynı yapıyı iki yerde yazma.
5. Tasarımla kod çelişirse (alan yok, kural farklı) kodu esas al, uyarlamayı yap ve sapmayı
   `design/vademde-redesign/SAPMALAR.md` dosyasına not et. Emin olmadığın ürün kararlarında dur ve sor.
6. §5'teki her yeni özellik için önce kısa bir plan yaz (migration, edge function, ekranlar, riskler),
   onayımı bekle, sonra uygula. Migration'ları geri alınabilir yaz, RLS politikalarını ekle,
   `docs/05-veri-modeli.md`'yi güncelle.
7. Her aşamadan sonra `npm run typecheck` ve `npm run lint` çalıştır, hataları düzelt.
   §7'deki kabul kriterlerini kontrol et.
8. Türkçe arayüz metinlerini tasarımdaki gibi kullan; yeni metin gerekiyorsa aynı sade tonu koru.

Şimdi aşama 1 ile başla: fontları ekle, `theme/colors.ts` ve tipografiyi §1–§2'ye göre güncelle,
`docs/08-tasarim-sistemi.md`'yi yeni sisteme göre revize et. Bitince değişiklikleri özetle ve dur.
