# Tasarımdan sapmalar

Tasarımla kod çeliştiğinde kod esas alınır; her sapma burada kayıtlıdır.

## Aşama 1 — Temel
- `accentViolet` marka sabiti olarak (#6B4DFF) kaldı; logo (`VademdeMark`) bunu kullanıyor ve temadan bağımsız olmalı. Ödeme anlamı yeni `payable` token'ından gelir.
- `success` ayrı bir renk olmaktan çıktı, `receivable` ile aynı değer (açıkta #0F7A52, koyuda #52CE96). Mevcut `success` kullanımları otomatik yeni anlama geçti.
- `surfaceElevated` tasarımda tanımlı değil; koyuda #393B3F korundu, açıkta #FFFFFF.
- `fontWeight` aileyi seçmediği için `Text` bileşeni ağırlığı font ailesine çevirir. Plex Mono 700 yüklenmedi (tasarım 400–600 kullanıyor), 700 istenirse 600 kullanılır.
- `Text` içinde `tabular` artık Plex Mono'yu da seçer (tutar/tarih kuralı).
- `BankLogo`, `PersonAvatar`, `ServiceLogo` RN `Text` kullandığı için sistem fontunda kaldı.

## Aşama 2 — Ortak bileşenler
- `BottomSheet`: mevcut `ActionSheet` menü amaçlı kaldı; genel amaçlı sheet ayrı yazıldı.
- `Pager`: yeni bileşen yazılmadı, mevcut `Pagination` tasarımdaki köşe yarıçapı (14) ve `action` rengiyle güncellendi.
- `ListSkeleton`: mevcut `Skeleton` üzerine kuruldu.
- Tarih sheet'leri (`DatePickerSheet`, `DateRangeSheet`, `MonthYearSheet`, `DayOfMonthSheet`) yeni eklendi; mevcut `DateField` modalına dokunulmadı. Ekranlar geçirilirken `DateField` bu sheet'e bağlanacak.
- `TypeRow` + aranabilir sheet yeni; mevcut tam ekran `SearchablePicker` hesap/kategori/kişi için aynen kalır.
- `InstallmentStrip`: ödenen = textPrimary, sıradaki = payable, gecikmiş = danger, bekleyen = mutedControl çerçeve (tasarım dosyasında renk eşlemesi açık yazılı olmadığı için çıkarım).
- `LoadMore` sayaç metni (`n / toplam kayıt`) tasarım örneğinden çıkarıldı; sayfa boyutu 30 çağıran tarafta kalır (`LIST_PAGE_SIZE`).
- `ServiceLogo`, `BankLogo`, `ValueUnitBadge` mevcut bileşenler olarak değişmedi.

## Aşama 3 — Sekmeler
- **Ana sayfa:** Tasarımdaki "2 tasarruf önerisi" kartı (AI, §5.7) backend olmadığı için yok. `QuickActions` ve "Son hareketler" tasarımda yok ama işlev kaybolmasın diye ekranda duruyor; Aşama 5'te Hızlı ekle sheet'i gelince `QuickActions` kalkacak. Hero'nun ikinci sayfası (bu ay gelir/gider) ve ekrandaki tema anahtarı tasarımda yok, kaldırıldı (tema Ayarlar > Görünüm'den değişir). Yaklaşanlar: 7/30 gün sekmeleri ve sayfalandırma yerine ilk 5 kayıt + "Tümü".
- **Hareketler:** Ay gezgini, günlük gruplar ve Gelir/Gider/Net özeti istemci tarafında hesaplanır (kaynaklar zaten tek seferde çekiliyor; sorgular değişmedi). Numaralı sayfalar yerine "Daha fazla yükle" (docs/06 §10.6.2'ye uygun, 30'luk dilim); eski kod 10'luk numaralı sayfa kullanıyordu. Arama ve sıralama arama ikonunun arkasında. "Transfer" sekmesi tasarımda var ama veri tarafında ayrı filtre yoktu (`FILTERS` değişmedi): Tümü altında görünür.
- **Tara:** Tasarımdaki canlı belge algılama (alan alan "algılandı") mevcut kamera akışında yok; görsel olarak yalnızca izin ekranı, kaynak seçimi ve işleniyor adımları yenilendi. İşleniyor ekranındaki "Arka planda devam et" eklenmedi (arka plan bildirimi garantisi yok). Kota doldu / yardım bilgisi hâlâ Alert; sheet'e dönüşümü ayrı iş. Karekod modu (§5.8) sonraki aşama.
- **Takvim:** Hafta/Liste görünümleri ve satırlar yeni renk token'larıyla gelir; ay ızgarası düz yüzeye çevrildi, gün özeti halkasız mono sütunlara.
- **Daha fazla:** Aboneliklerim, Döviz ve altın, Akıllı öneriler, Dışa aktar satırları ilgili ekranlar yapılana kadar eklenmedi. Çek ve senet portföyü (§5.4) gelene dek "Çekler" ve "Senetler" ayrı satırlar. Hesaplar/Krediler/Kartlar satırlarındaki tutar özetleri tasarımdaki gibi sayıya indirildi.
- `Amount`: eksi işareti `-` yerine `−`; gelir/alacak rengi `receivable`. `StatusBadge`: dolgulu hap yerine renkli metin.
- `TabBar`: yüzen çubuk yerine tam genişlikte düz çubuk; üst kenar eski konumda kaldığı için `tara.tsx` kamera kontrolleri etkilenmez.

## Aşama 5 — Mevcut veriyle yeni ekranlar
- **Hızlı ekle:** `QuickActions` (kullanıcının özelleştirdiği kısayol satırı) mevcut bir özellik olduğu için ana sayfada korundu (Aşama 3 notundaki "kalkacak" ifadesi geçersiz). Tasarımdaki tek "Ödeme veya tahsilat kaydet" satırı, yön rota parametresiyle seçildiği için "Ödeme kaydet" ve "Tahsilat kaydet" olarak ikiye bölündü. Başlıktaki bakiye gösterilmedi. Tetikleyiciler: Tara uzun basışı ve Hareketler "+" (ana sayfada "+" yok, tasarımdaki başlık düzeniyle uyumlu).
- **Aboneliklerim:** Yeni şema yok. Aylık maliyet = sıradaki taksitin tutarı. "Deneme bitiyor" uyarısı ve "Yıllık" grubu için veri alanı yok (bkz. PLANLAR.md); onların yerine Bu hafta / Bu ay / Daha sonra grupları. Detayda "dolar bazlı aboneliğin aylara göre TL karşılığı" yapılmadı (geçmiş ödemelerin kuru saklanmıyor); ayrı karar gerektirir.
- **Döviz ve altın:** Yeni şema yok; kasalar + birimli borç/alacaklar + güncel kurlar. Hesap detayında döviz/altın görünümü (`DovizHesapDetay`, `AltinHesapDetay`) Aşama 4'te.

## Aşama 4 — Mevcut alt ekranlar (kısmi)
- **Ortak:** `Button` (56 pt/16 radius), `TextField` (etiket alanın içinde, mono), `SectionHeader`, `EmptyState` (kartsız), `ScreenHeader` yeni görünümde; bunlara dayanan tüm ekranlar otomatik değişti.
- **Liste iskeleti:** `FinanceListHero`, `FinanceFilterCard` (artık `ScrollableTabs`), `FinanceListSurface` kartsız; Hesaplar, Kredi kartları, Bankalar, Cariler ve Vadeli kayıtlar listeleri bunları kullanıyor. Vadeli kayıtlar listesindeki borç/alacak sekmeleri ve gün grupları yok (iş mantığında yön filtresi bilerek kaldırılmıştı); numaralı sayfalama korundu. Satırlardaki borç tutarı artık kırmızı değil (kırmızı yalnızca gecikme).
- **Giriş/Kayıt:** yeni başlık düzeni ve etiketli alanlar. Tasarımdaki "Ad soyad" alanı, parola kuralı çipleri, onay kutusu ve "7 gün ücretsiz Plus" rozeti eklenmedi (kayıt akışı ve plan mantığı değişmez).
- **Henüz yapılmayanlar:** Vadeli kayıt detayı/formu, kredi ve kart detayları, hesap detayları, belge inceleme (OcrKontrol), raporlar, ayarlar, çalışma alanı, paywall, yasal ve onboarding ekranlarının yeniden düzeni.

## Aşama 6 — Akıllı öneriler ve soru-cevap (§5.7)
- **Şema:** yalnızca ekleyici `ai_insights` tablosu (`20261005120000_ai_insights.sql`, production'a uygulandı; geri alma: `drop table public.ai_insights`). RLS: üyeler okur, düzenleyiciler yalnızca `status` günceller; ekleme yalnızca service role.
- **Edge function'lar** (`generate-insights`, `ai-ask`, `verify_jwt` açık, mevcut `GEMINI_API_KEY` secret'ı): sorgular kullanıcının JWT'siyle (RLS), üyelik ve Plus planı sunucuda doğrulanır. Rakamlar sorgudan; Gemini yalnızca metni akıcılaştırır ve metindeki sayılar olgularda yoksa şablon metne düşülür. `ai-ask` yazma yetkisiz, kaynak sayısı ve dönemi koddan hesaplanır.
- **Kurallar (şimdilik 2):** aynı kategoride 2+ abonelik; son 3 ay üst üste artan harcama kategorisi. Nakit riski (§5.6 `planned_account_id` gelince) ve kur etkisi kuralları henüz yok.
- **Onay:** "Akıllı Tarama İzni"nden ayrı, cihazda tutulan KVKK onayı; "yatırım/kredi tavsiyesi değildir" notu. Bu onay metni hukuki gözden geçirme ister.
- **Bilinen sınır:** `ai-ask` yalnızca TL hareketleri son 120 günden özetler (en çok 3000 kayıt); istek başına hız sınırı yok (maliyet izlenmeli).

## Aşama 4/11 — Raporlar ve alt ekranlar (ikinci tur)
- **Raporlar:** yeni düzen (dönem sekmeleri + özel aralık, önceki döneme göre değişim, bölüm atlama çipleri, dışa aktarma sheet'i, PDF bölüm seçimi). "Akıllı özet" yapay zekâ değil, ekrandaki rakamlardan türeyen deterministik metindir. Borç/alacak için "geçen aya göre" değişimi yok (geçmiş borç anlık görüntüsü saklanmıyor). Tasarruf oranı yalnızca gelir kaydı olan dönemlerde.
- **Alt ekranlar:** `SearchablePicker` (tüm hesap/kategori/kişi/banka/tür/birim seçicileri), form başlıkları (`ScreenHeader`) ve alan etiketleri, Ayarlar, Görünüm, Kategoriler (bu ay kullanım), Bildirimler, Abonelik yeni görünümde. Profil, Çalışma alanları, Üyeler, Paywall, Yasal, Uygulama kilidi, vadeli kayıt/ödeme/hareket **formlarının iç yerleşimi** yeni renk ve yazı tipini alıyor ama tasarımdaki satır satır düzene yeniden çizilmedi; cihazda inceleyip sapmaları bildirmek gerekir.
- Bildirimler tasarımındaki "Ödendi işaretle / Kontrol et" satır içi eylemleri ve "Bu hafta" grubu yok (liste yalnızca bugün/geçmiş ayrımı yapıyor).
- Abonelik ekranında yalnızca belge tarama kullanımı gösteriliyor (çalışma alanı/ekip kullanımı için ek sorgu gerekir).

## Aşama 4 — Alt ekranlar (üçüncü tur)
- **Ortak:** `GroupedList` (`GroupedSection/Row/ToggleRow/RowIcon/RowAvatar`) Ayarlar'dan çıkarıldı; Profil ve diğer ekranlar da kullanıyor.
- **Profil:** ad alanı her zaman düzenlenebilir, değişince Kaydet çıkar; "Telefon" alanı yok (profilde saklanmıyor). Şifre değiştirme satırdan açılan satır içi form.
- **Çalışma alanları:** rol çipi yalnızca "Sahip" için (listede üye rolü sorgulanmıyor). Ad düzenleme/silme ikonları korundu. Kurulum ekranı illüstrasyonsuz, sola hizalı.
- **Üyeler, Paywall, Yasal, Uygulama kilidi:** yeni renk/tipografi ve satır düzeni. Yasal ekranda bölüm atlama çipleri ve paylaş düğmesi yok; "Şifreyle giriş yap" bağlantısı kilit ekranında yok. Paywall'da plan kartları mağaza fiyatından, özellik maddeleri yerine tek satır slogan.
- **Vadeli kayıt detayı:** hero altında "Ödendi işaretle" birincil eylemi; taksit işaretleri tasarım eşlemesinde. Belge görüntüsü satırı ve "Geçmiş" zaman çizelgesi yok.
- **Vadeli kayıt formu, ödeme formu, Belge inceleme, Dekont:** alan etiketleri mono, başlık `ScreenHeader`, belge önizlemesi koyu çerçevede. Satır satır `FieldGroup` düzenine ve alan bazlı "belgeden okundu / kontrol et" rozetlerine geçilmedi.
- Bildirimlerdeki satır içi eylemler hâlâ yok.

## Kapanış turu (6 Ekim 2026)
- **Push bildirimi metni:** `send-reminders` artık "Türkiye İş Bankası 10.000 TL Tutarındaki Kredi Ödemeniz 3 Gün Sonra" biçiminde (özne: banka → servis → karşı taraf → başlık; tür+yön eşlemesi; aşama: 7/3 Gün Sonra, Bugün, 1 Gün Gecikti). Uygulama içi Bildirimler aynı cümleyi `utils/reminderMessage.ts` ile üretir; iki eşleme (Deno ve uygulama) elle senkron tutulur. `names.ts` banka/servis listesinden üretilmiş kopyadır.
- **Bildirimler ekranı:** BUGÜN / BU HAFTA / GEÇMİŞ grupları; satır içi "Ödendi / Tahsil edildi işaretle" ödeme formunu açar (tek dokunuşta kayıt yok — ödeme hesabı/tutar onayı gerekir), "Kontrol et" kaydı açar.
- **Nakit riski:** `planned_account_id` kolonu eklenmedi; mevcut `obligations.account_id` kullanılıyor (HANDOFF §5.6'dan sapma). `generate-insights` artık 14 günlük nakit riski kuralını da çalıştırır (`kind='nakit'`). **Kur etkisi** kuralı için yeni `value_unit_rate_history` tablosu eklendi (günlük anlık görüntü, `sync-market-rates` yazar); kural en az 20 günlük geçmiş birikince (≈ 26 Ekim 2026) öneri üretmeye başlar, ≥%3 kur değişimi ve ≥1.000 TL fark arar.
- **Abonelik alanları:** `obligations.trial_ends_on` ve `billing_period ('monthly'|'yearly')` eklendi (NULL = bugünkü aylık davranış). Yıllıkta vadeler 12 ayda bir dizilir, Aboneliklerim aylık toplama 12'ye bölerek katar; "Deneme bitiyor" (≤14 gün) ve "Yıllık" grupları var. Mevcut kayıtlar etkilenmez.
- **Kayıt ekranı:** isteğe bağlı Ad soyad (`handle_new_user` zaten `full_name` meta verisini okuyor) ve zorunlu koşullar/gizlilik onayı eklendi. Parola kuralı çipleri ve "7 gün ücretsiz Plus" rozeti eklenmedi (kural/plan mantığı yok).
- **Tara:** Kota doldu ve "nasıl çalışır" `Alert` yerine sheet. "Belgeyi taslak olarak sakla" tasarımda var ama taslak kuyruğu olmadığı için eklenmedi.
- **Tarih seçiciler:** `DateField` artık `DatePickerSheet` kullanır; tüm formlar otomatik geçti.
- **Belge inceleme:** alan güven göstergesi `SourceTag` ("Belgeden" / "Kontrol et"); kırmızı metin kaldırıldı.
- **Uygulama ikonu:** "Mor" seçenek seçiciden kaldırıldı; `app.json` alternatif ikon tanımı, daha önce seçmiş kullanıcıların ikonu sıfırlanmasın diye bilerek duruyor.
- **Yasal** ekranlarda madde numarası çipleriyle bölüme atlama var; kilit ekranında "Şifreyle giriş yap" oturumu kapatır (onaylı).
- **Hâlâ yok:** ana ekran widget'ları (App Group + native build gerekir), canlı belge algılama, dolar bazlı aboneliğin geçmiş TL karşılığı (kur geçmişi artık birikiyor, ödeme anındaki kur ayrıca saklanmıyor), vadeli kayıt formlarının satır satır `FieldGroup` düzeni.
