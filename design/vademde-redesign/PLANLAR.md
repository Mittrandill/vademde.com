# Backend gerektiren özellikler — uygulama planları (onay bekliyor)

Hiçbiri uygulanmadı. Tüm migration'lar `supabase/migrations/` altında, geri alınabilir (`down` notuyla),
RLS'li ve `docs/05-veri-modeli.md` güncellemesiyle birlikte gelir. Supabase projesi `wgdirnckmlicctreyoxk`
(production): migration'ları önce bir **branch** üzerinde deneyip onayınla birleştirmeyi öneriyorum.

Önerilen sıra (HANDOFF §6): 5.4 → 5.5 → 5.6 → 5.8 → 5.9 → 5.7 → 5.10.

## 5.4 Çek ve senet portföyü
- **Migration:** `obligations.instrument_status text` (check: portfoy, ciro_edildi, tahsile_verildi, tahsil_edildi,
  karsiliksiz, odendi), `instrument_status_changed_at timestamptz`. Yalnızca `document_type in ('cek','senet')`
  için dolu (check constraint). Mevcut çek/senetler `portfoy` ile doldurulur (backfill). Down: iki kolon silinir.
- **Mantık:** `payments/new.tsx` `method='ciro'` kaydı durumu `ciro_edildi` yapar. "Karşılıksız" işaretlenirse ciroyla
  kapanan borç yeniden açılır (`features/payments/api.ts settleWithInstrument` tersine çevrilir).
- **Ekranlar:** `app/instruments/index.tsx` (CekPortfoyu), `CekDetay` (yaşam döngüsü zaman çizgisi, mevcut
  `obligations/[id]`'ye çek/senet dalı), `CiroEt` görsel yenileme.
- **Risk:** Karşılıksız → borcu yeniden açma, cari bakiyeyi etkiler; `getSettlingInstrumentIds` mantığıyla çakışmaması için
  önce birim testleri/örnek verilerle doğrulanmalı. **Soru:** "tahsile_verildi" ve "tahsil_edildi" hesap bakiyesine
  ne zaman yansısın (bugünkü davranış korunsun mu)?

## 5.5 Kart taksitli alışverişleri
- **Migration:** `card_installment_purchases(id, workspace_id, account_id → accounts, merchant, total_minor bigint,
  currency_code, installment_count int, first_statement_month date, created_at)` + RLS (workspace üyeleri), indeks
  `(workspace_id, account_id)`. Ödenen taksit sayısı ekstre eşleşmesinden türetilir (kolon yok).
- **Mantık:** `process-document` ekstre ayrıştırmasında taksit satırlarını bu kayıtlarla eşleştirir; eşleşme
  kullanıcı onayından geçer (bağlayıcı kural 1).
- **Ekran:** `app/accounts/[id]/installments.tsx` (ekstre başına taksit yükü + alışveriş listesi).
- **Risk:** Ekstre satırında taksit ibaresi (2/6) ayrıştırma doğruluğu; yanlış eşleşme için "Önerildi" etiketi.

## 5.6 Nakit uyarısı
- **Migration:** `obligations.planned_account_id uuid references accounts null` (+ indeks). Down: kolon silinir.
- **Mantık:** Hesap bazlı tahmini bakiye = güncel bakiye − planlanan ödemeler + planlanan tahsilatlar, 30 gün gün gün
  (istemci tarafı hesap). `send-reminders` içinde 14 gün içinde sıfırın altına inen hesap için bildirim.
- **Ekran:** `app/cash-alert/[accountId].tsx`; ödeme/vade formuna "hangi hesaptan ödenecek" alanı.
- **Risk:** Bildirim sıklığı (spam) — hesap başına haftada en fazla 1 öneriyorum.

## 5.8 e-Arşiv / e-Fatura karekod okuma (istemci)
- Migration yok. `expo-camera` zaten var; `barcodeScannerSettings: { barcodeTypes: ['qr'] }`.
- Karekod JSON alanları GİB teknik kılavuzundan doğrulanmalı (**kılavuzu senden/kaynaktan teyit etmem gerek**).
  Okunursa OCR çağrılmaz, kota düşmez; sonuç `documents/[id]/review` akışına gider (kullanıcı onayı korunur).
- **Risk:** Karekodsuz/eski formatlı faturalarda OCR'a düşme yolu açık kalmalı (kural 5).

## 5.9 Alacak hatırlatma (istemci)
- Migration yok. `Linking.openURL('whatsapp://send?...')` (yoksa `wa.me`), SMS, e-posta; ton seçenekleri şablon metin;
  hesap özeti PDF'i `expo-print` + `expo-sharing`. Cari detayına hatırlatma sheet'i.
- **Risk:** Karşı tarafın telefon/e-posta alanı `counterparties`'te var mı — yoksa form alanı eklemek gerekir (küçük migration).

## 5.7 Akıllı öneriler ve soru-cevap (Plus)
- **Migration:** `ai_insights(id, workspace_id, kind, title, body, impact_minor, action_route, source jsonb,
  status check in (new,dismissed,applied), generated_at)` + RLS.
- **Edge function `generate-insights`:** önce deterministik kurallar (çift abonelik, artan kategori, nakit riski, kur
  etkisi); LLM yalnızca metin üretir, rakamlar sorgudan gelir. **`ai-ask`:** salt-okunur, workspace RLS'li araçlarla
  yanıt; "Kaynak: N hareket". KVKK için ayrı onay ekranı; "yatırım tavsiyesi değildir" notu; Plus plan kapısı.
- **Risk:** LLM maliyeti/limitleri, KVKK metni (hukuki gözden geçirme), prompt injection (kayıt başlıkları kullanıcı
  girdisi). Sağlayıcı `process-document` ile aynı Gemini anahtarı; **MCP'deki `gemini` sunucusu bu oturumda bağlanamadı**,
  uygulamadan önce kontrol edilmeli.

## 5.10 Ana ekran widget'ları (native)
- iOS WidgetKit (`expo-apple-targets`) + Android (`react-native-android-widget`); uygulama paylaşılan depoya
  (App Group / SharedPreferences) "sıradaki vade, 7 günlük özet" yazar. Yeni native build + Apple Developer'da App Group
  tanımı gerekir (senden bilgi isterim). En sona bırakılmalı.

## Veriyle ilgili eksikler (migration gerektirebilir, ayrıca karar ister)
- **Abonelik "deneme bitiyor" uyarısı:** `obligations`'ta deneme bitişi alanı yok (`trial_ends_on date`). Eklensin mi?
- **Abonelik yenileme periyodu (yıllık/aylık):** şu an her abonelik aylık taksit planı; "Yıllık" grubu için
  `billing_period` alanı gerekir.
