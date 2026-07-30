# Teknik Mimari

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 10 (s. 14-15)
> Bu dosya mobil/backend teknoloji yığınını, OCR servis tasarımını, yerel-first davranışı ve frontend klasör yaklaşımını tanımlar.

## Katman özeti

| Katman | İçerik |
|---|---|
| iOS Uygulaması | React Native + Expo Development Build + Expo Router |
| Yerel Katman | SQLite, çevrimdışı kuyruk, taslaklar, güvenli oturum saklama |
| API / İş Mantığı | Supabase Edge Functions, doğrulama kuralları, OCR iş kuyruğu |
| Veri Katmanı | Supabase PostgreSQL + RLS + Storage |
| OCR Katmanı | Apple Vision / ML Kit + Gemini yapılandırılmış belge analizi |
| Bildirim | Yerel bildirimler + gerektiğinde sunucu destekli hatırlatmalar |

## 10.1 Mobil uygulama

- React Native + TypeScript
- Expo Development Build ve EAS
- Expo Router
- iOS öncelikli native davranışlar
- Expo Camera / Image Picker / Document Picker
- Yerel veritabanı ve senkronizasyon kuyruğu
- Push ve yerel bildirim desteği

## 10.2 Backend

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage private bucket
- Supabase Edge Functions
- Row Level Security
- Zamanlanmış bildirim ve iş görevleri
- Sunucu tarafı loglama ve gözlemlenebilirlik

## 10.3 OCR servis tasarımı

Gemini API anahtarı mobil uygulamada bulunmaz. Uygulama belgeyi güvenli storage alanına yükler, Edge Function iş kaydı oluşturur, AI analizini çalıştırır, şemayı doğrular ve sonucu inceleme durumunda uygulamaya döndürür.

## 10.4 Yerel-first davranış

- Manuel kayıtlar çevrimdışı oluşturulabilir.
- Belge görüntüsü internet yokken yerel taslakta tutulabilir.
- OCR işi bağlantı geldiğinde kullanıcı onayıyla kuyruğa alınır.
- Optimistic UI kullanılır; başarısız eşitleme görünür durumla yeniden denenir.
- Çakışma çözümünde güncelleme zamanı, kullanıcı aksiyonu ve sürüm numarası dikkate alınır.

## 10.5 Frontend klasör yaklaşımı

| Katman | Örnek içerik |
|---|---|
| app/ | Expo Router ekranları ve route grupları |
| components/primitives/ | Text, Stack, Pressable, Divider |
| components/finance/ | Amount, DebtCard, ChequeCard, CashFlowChart |
| components/ocr/ | Scanner, ExtractedField, ConfidenceBadge |
| features/ | auth, workspaces, transactions, obligations, documents, reports |
| services/ | supabase, notifications, OCR, storage, analytics |
| store/ | aktif çalışma alanı, UI ve senkronizasyon durumu |
| theme/ | tokens, light/dark theme, typography, spacing |
| db/ | SQLite şema ve migration |
| utils/ | para, tarih, validasyon ve yerelleştirme |

## 10.6 Veri katmanı: önbellek, sayfalama, gerçek zamanlı güncelleme ve çevrimdışı senkronizasyon

> Bu bölüm sonradan eklendi (2026-07-28) — uygulama veri hacmi ve kullanıcı sayısı büyüdükçe kritik hale gelecek dört mimari karardır. Aşama 2 kapsamında temel altyapı kurulur; her ekranın buna göre yazılması bağlayıcıdır.

### 10.6.1 Önbellek ve veri getirme

- İstemci tarafı veri getirme ve önbellekleme **React Query** (`@tanstack/react-query`) üzerinden yapılır; ekranlar doğrudan `useEffect` + `useState` ile Supabase sorgusu tetiklemez.
- Her varlık türü (workspaces, accounts, categories, counterparties, transactions, obligations, payments) için sabit bir `queryKey` şeması kullanılır: `[workspaceId, 'entity', ...filtreler]`.
- Yazma işlemleri `useMutation` ile yapılır; başarılı mutation sonrası ilgili `queryKey`'ler geçersiz kılınır (invalidate).

### 10.6.2 Sayfalama

- Hareketler gibi büyüyebilecek listeler tek seferde tüm veriyi çekmez; Supabase sorguları `.range()` ile ofset tabanlı sayfalanır.
- İstemci tarafında `useInfiniteQuery` ile "daha fazla yükle" davranışı uygulanır; sayfa boyutu 30 kayıt olarak başlar.
- Farklı kaynaklardan (transactions, obligations) birleşen listelerde her kaynak kendi sayfalamasını bağımsız yönetir; birleştirme ve sıralama istemci tarafında yapılır.

### 10.6.3 Gerçek zamanlı güncelleme

- Finansal tablolar (`accounts`, `categories`, `counterparties`, `transactions`, `obligations`, `installments`, `payments`) Supabase Realtime `supabase_realtime` publication'ına eklenir.
- Aktif çalışma alanına (`workspace_id`) filtrelenmiş `postgres_changes` aboneliği açılır; gelen her olayda ilgili React Query anahtarları geçersiz kılınır.
- Bu, işletme çalışma alanlarında birden fazla ekip üyesinin aynı anda çalışmasında veya aynı kullanıcının birden fazla cihazında verinin manuel yenileme olmadan güncel kalmasını sağlar.

### 10.6.4 Çevrimdışı senkronizasyon

- Mutation'lar `networkMode: 'offlineFirst'` ile çalışır; bağlantı yokken tetiklenen bir yazma işlemi hata vermez, duraklatılmış (paused) durumda React Query mutation cache'inde tutulur.
- Mutation cache, `@tanstack/query-async-storage-persister` ile `AsyncStorage`'a yazılır; uygulama kapatılıp yeniden açılsa da bekleyen işlemler kaybolmaz.
- Bağlantı durumu `@react-native-community/netinfo` ile izlenir (`onlineManager`); bağlantı geri geldiğinde bekleyen mutation'lar otomatik olarak yeniden denenir.
- `db/` altındaki `sync_queue` tablosu bu genel mutation kuyruğuyla karışmaz — yalnızca OCR iş kuyruğu (Aşama 3) gibi sunucu tarafı arka plan işleri için ayrılmıştır. `drafts` tablosu OCR öncesi taslak belge/form verisi için kullanılmaya devam eder.
