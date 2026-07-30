# CLAUDE.md — Vademde

Bu dosya, bu repoda (`~/Desktop/vademde/`) çalışan Claude Code için proje-özel rehberdir. Kök dizindeki `~/CLAUDE.md` (workspace geneli talimatlar) ile birlikte geçerlidir; çelişki durumunda daha spesifik olan bu dosya önceliklidir.

## Proje nedir

> Vademde; çek, senet, fatura, kredi ödeme planı ve diğer finansal belgeleri OCR ve yapay zekâyla okuyarak borç, alacak, gelir, gider ve vadeleri kullanıcı onayıyla oluşturan iOS finans takip uygulamasıdır.

- **Platform**: iOS öncelikli (React Native + Expo); mimari Android'e genişleyebilir.
- **Hedef kullanıcı**: Bireysel kullanıcılar, esnaf, serbest çalışanlar, küçük işletmeler.
- **Ana yaklaşım**: OCR-first finansal belge ve vade yönetimi — OCR bir ek özellik değil, ürünün ana kayıt yöntemidir.
- **Durum**: Greenfield / Aşama 0 (planlama ve döküman hazırlığı tamamlandı). Henüz kod yazılmadı. Sıradaki adım: `docs/13-yol-haritasi.md` → **Aşama 1 - Temel**.

## Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Mobil | React Native + TypeScript, Expo Development Build + EAS, Expo Router |
| Yerel veri | SQLite (offline-first kuyruk ve taslaklar) |
| Backend | Supabase PostgreSQL + Auth + Storage (private bucket) + Edge Functions + RLS |
| OCR | Cihaz üstü (Apple Vision / ML Kit) + Gemini (multimodal yapılandırılmış belge analizi, sunucu tarafında — API anahtarı istemcide olmaz) |
| Bildirim | Yerel bildirimler + gerektiğinde sunucu destekli hatırlatmalar |

Detaylar: `docs/06-teknik-mimari.md`.

## Bağlayıcı kurallar (asla ihlal edilmez)

1. **AI çıktısı hiçbir zaman doğrudan kesin finans kaydına dönüşmez.** OCR sonucu her zaman kullanıcı onayından geçer; düşük güvenli alanlar açıkça işaretlenir. (`docs/04-ocr-belge-isleme.md`)
2. **Kredi, kredi kartı, çek, senet ve fatura birer *finansal kayıt/belge türüdür*, kategori değildir.** "Yakıt", "market", "kira" gibi kavramlar kategoridir. Bu ayrım veri modelinde bozulmaz. (`docs/01-finansal-kayit-modeli.md`)
3. **Her çalışma alanı (`workspace_id`) verisi tamamen izoledir.** Tüm sorgular, dosyalar, raporlar ve RLS politikaları workspace bazlıdır — cross-workspace veri sızıntısı olmaz. (`docs/00-vizyon-ve-strateji.md` §2.4, `docs/07-guvenlik-gizlilik.md`)
4. **Graphite Finance tasarım sistemi zorunludur.** Renk/tipografi/spacing tokenları sabit kodlanmaz, tema dosyasından gelir. "Hazır AI şablonu" / generic dashboard görünümünden kaçınılır. (`docs/08-tasarim-sistemi.md` — bağlayıcı tasarım ilkesi)
5. **Manuel giriş her zaman erişilebilir olmalıdır.** OCR başarısız olursa belge kaybolmadan manuel forma geçilir.
6. **Belge ve finans kaydı birbirine bağlı saklanır** — orijinal belge, OCR alanları ve oluşan kayıt ilişkilendirilmiş kalır.
7. **Para tutarları floating point tutulmaz** (en küçük para birimi/decimal); para birimi ISO koduyla saklanır.
8. **Service role anahtarı asla mobil uygulamaya gömülmez**; Gemini API anahtarı istemcide bulunmaz — OCR işi Edge Function üzerinden yürütülür.

## `docs/` dizini haritası

PRD'nin tamamı (`Vademde_PRD_v1.3.pdf`) konu bazlı dosyalara bölündü. Görev türüne göre hangi dosyaya bakılacağı:

| Görev türü | İlgili dosyalar |
|---|---|
| Ürün vizyonu, hedef kullanıcı, workspace modeli | `docs/00-vizyon-ve-strateji.md` |
| Finansal kayıt/kategori mantığı, hesaplama kuralları | `docs/01-finansal-kayit-modeli.md` |
| Hangi özellik MVP'de var/yok (P0/P1/P2) | `docs/02-kapsam-ve-oncelikler.md` |
| Ekran/navigasyon/UI akışı işi | `docs/03-bilgi-mimarisi-ekranlar.md`, `docs/08-tasarim-sistemi.md` |
| OCR pipeline, belge türü şemaları | `docs/04-ocr-belge-isleme.md`, `docs/06-teknik-mimari.md` |
| Supabase şema / migration işi | `docs/05-veri-modeli.md` |
| Genel mimari, klasör yapısı, offline-sync | `docs/06-teknik-mimari.md` |
| RLS, gizlilik, App Store uyumu | `docs/07-guvenlik-gizlilik.md` |
| Renk/tipografi/spacing/bileşen tasarımı | `docs/08-tasarim-sistemi.md` |
| Uçtan uca akış tasarlarken referans | `docs/09-kullanici-akislari.md` |
| Abonelik/paywall/fiyatlama | `docs/10-abonelik-gelir-modeli.md` |
| Metrik/analytics event tasarımı | `docs/11-basari-metrikleri.md` |
| "MVP bitti mi?" kontrolü | `docs/12-mvp-kabul-kriterleri.md` |
| Hangi aşamadayız, sıradaki iş ne | `docs/13-yol-haritasi.md` |
| Terminoloji / değişmez kararlar | `docs/14-kararlar-ve-terminoloji.md` |

Orijinal PDF (`Vademde_PRD_v1.3.pdf`) referans olarak korunmuştur; her `docs/*.md` dosyasının başında kaynak PDF bölüm numarası belirtilir.

## Entegrasyon durumu

- **GitHub**: `https://github.com/Mittrandill/vademde.com.git` — şu an tamamen boş (commit yok). Kod yazıldıktan sonra bu repoya push edilecek.
- **Supabase**: MCP sunucusu `.mcp.json` üzerinden bağlı (proje ref: `wgdirnckmlicctreyoxk`). Şu an hiç tablo/migration yok — şema `docs/05-veri-modeli.md`'ye göre oluşturulacak.
- **Apple Developer / EAS**: Kullanıcıda hazır. Native build (Expo Development Build, EAS, bundle identifier, push sertifikaları) konfigüre edilirken bu bilgiler kullanıcıdan istenecek.

## Marka varlığı

- `Logo.png` — kök dizinde, uygulama ikonu/marka kimliği için referans görsel (koyu grafit zemin, sarı/Saffron "V" formu — Graphite Finance renk yönüyle uyumlu).

## Sıradaki adım

`docs/13-yol-haritasi.md` → **Aşama 1 - Temel**: Expo Development Build ile repo iskeleti, tema/design tokens (`docs/08-tasarim-sistemi.md` §12.5-12.7), Supabase Auth + workspace tabloları + RLS, SQLite offline temeli. Geliştirme sırası önerisi (§17.1): önce tasarım foundations, sonra veri modeli/finans çekirdeği, sonra tek belge türüyle (çek) uçtan uca OCR dikey dilimi.
