# Abonelik ve Gelir Modeli

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 14 (s. 23-24)
> Bu dosya abonelik planlarını ve fiyatlama ilkelerini tanımlar.

## Planlar

| Plan | Kapsam |
|---|---|
| Ücretsiz | 1 kişisel çalışma alanı, temel gelir-gider ve borç-alacak, sınırlı OCR, temel bildirim ve rapor |
| Vademde Plus | Birden fazla çalışma alanı, daha yüksek OCR kotası, gelişmiş rapor, sınırsız dışa aktarma, belge arşivi, düzenli işlemler, Face ID |
| Vademde İşletme | Ekip üyeleri, roller, audit log, gelişmiş cari rapor, yüksek dosya/OCR kotası ve işletme özellikleri |

## 14.0 Limitlerin uygulanma durumu

`plan_limits` tablosu baştan beri doğru değerleri taşıyordu ama bu değerler uzun süre yalnızca
paywall ekranında **gösteriliyordu**; hiçbir katmanda uygulanmıyordu. Aşağıdaki tablo her limitin
nerede zorunlu kılındığını kaydeder — yeni bir limit eklenirken bu tablo da güncellenir.

| Limit | Nerede uygulanır |
|---|---|
| `monthly_ocr_quota` | Sunucu — `supabase/functions/process-document/index.ts` |
| `max_personal_workspaces` | Sunucu — `workspaces` üzerinde `enforce_workspace_plan_limit` trigger'ı + `setup_initial_workspaces`; istemcide `app/workspace/index.tsx` ve `app/workspace-setup/index.tsx` |
| `max_team_members` | Sunucu — `create_workspace_invite` / `redeem_workspace_invite`; istemcide `app/workspace/[id]/members.tsx` |
| `advanced_reports`, `unlimited_export`, `document_archive`, `recurring_transactions`, `face_id`, `audit_log` | **Henüz uygulanmıyor — bu özellikler bugün hiç yok, yalnızca paywall metni olarak vaat ediliyor.** |

### Limit üzerindeki mevcut kullanıcılar

Ücretsiz plan tek çalışma alanı içindir ama limit uygulanmadan önce açılmış hesaplarda birden
fazla alan var. Bu kullanıcıların verisi **silinmez**:

1. Uygulama açılışında `sync_plan_enforcement` limit aşımını görür ve **14 günlük lütuf süresi**
   başlatır. Süre, kullanıcı uyarıyı görmeden başlamaz.
2. Lütuf süresi boyunca tüm alanlar tam çalışır; dashboard ve çalışma alanı listesinde kalan gün
   sayısını ve kilit tarihini söyleyen bir uyarı bandı görünür.
3. Süre dolduğunda yalnızca kullanıcının seçtiği **birincil çalışma alanı** yazılabilir kalır
   (`profiles.primary_workspace_id`; seçilmediyse en eski alan). Diğerleri salt-okunur olur —
   veri durur, okunur, dışa aktarılabilir ve silinebilir; yalnızca yeni kayıt/güncelleme engellenir.
4. Kullanıcı abone olursa kilit anında kalkar; fazla alanı kendisi silerse lütuf süresi temizlenir.

Salt-okunur kuralı RLS politikalarına dokunmadan, `workspace_id` taşıyan veri tablolarındaki ortak
`enforce_write_access` trigger'ıyla uygulanır (bkz.
`supabase/migrations/20260905130000_enforce_plan_limits.sql`). DELETE bilerek serbesttir.

OCR maliyetleri nedeniyle ücretsiz planın aylık belge kotası olmalıdır. Kota bittiğinde manuel giriş açık kalır; kullanıcı belgesini taslak olarak saklayabilir veya ek paket/premium plan kullanabilir. İlk TestFlight döneminde premium özellikler manuel yetkiyle açılabilir.

## 14.1 Fiyatlama ilkeleri

- Aylık ve yıllık abonelik
- Yıllık planda anlamlı indirim
- İşletme planında kullanıcı ve OCR kotasına göre kademelendirme
- Kullanıcıya tarama öncesinde kalan OCR kotasını gösterme
- Başarısız veya okunamayan işlemde kotayı haksız düşürmeme
- iOS dijital özelliklerinde App Store IAP, Android'de Google Play Billing (ikisi de RevenueCat üzerinden, ayrı mağaza ürünleriyle)
