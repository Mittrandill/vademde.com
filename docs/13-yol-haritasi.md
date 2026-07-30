# Yol Haritası ve Yayın Planı

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 17 (s. 25-26)
> Bu dosya geliştirme aşamalarını, önerilen geliştirme sırasını ve dikey dilim ilkesini tanımlar.
>
> **Güncel durum**: Proje şu an Aşama 0'da (planlama/döküman hazırlığı). Sıradaki adım Aşama 1 - Temel.

## Aşamalar

| Aşama | Teslim |
|---|---|
| Aşama 1 - Temel | Repo, Expo Development Build, tema/tokens, Supabase, Auth, workspace, RLS, SQLite ve senkronizasyon temeli |
| Aşama 2 - Finans çekirdeği | Hesaplar, kategoriler, kişi/firma, transaction, obligation, taksit, ödeme ve transfer |
| Aşama 3 - OCR çekirdeği | Kamera/dosya, kalite kontrolü, storage, OCR kuyruğu, belge sınıflandırma, alan çıkarımı ve kontrol ekranı |
| Aşama 4 - Ana deneyim | Dashboard widget'ları, hareketler, detaylar, takvim, bildirimler ve arama/filtre |
| Aşama 5 - Rapor ve üyelik | Grafikler, PDF/CSV, abonelik, kota ve paywall |
| Aşama 6 - Yayın | TestFlight, performans, gizlilik, hesap silme, App Store varlıkları ve inceleme notları |

## 17.1 Geliştirme sırası önerisi

1. Önce tasarım foundations ve temel bileşenler
2. Ardından veri modeli ve finans çekirdeği
3. Sonra tek belge türüyle uçtan uca OCR dikey dilimi: çek
4. Çek akışı sağlamlaştıktan sonra senet, fatura, kredi ve kart ekstresi
5. Son aşamada rapor, üyelik ve işletme ekip özellikleri

> **Dikey dilim ilkesi**
> İlk teknik demo yalnızca "kamera açılıyor" veya "AI JSON döndürüyor" olmamalıdır. Çek tarama → alan kontrolü → vadeli kayıt → takvim → bildirim zinciri uçtan uca çalışmalıdır.
