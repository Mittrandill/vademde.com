-- Personel, bugüne kadar müşteri/tedarikçi ile aynı "Kişi" listesine karışıyordu ve maaş
-- ödemeleri ayrı takip edilemiyordu. counterparties.type'a üçüncü bir değer eklenir;
-- ayrı bir tablo yerine mevcut cari yapısı genişletilir, böylece borç/alacak, ödeme,
-- rapor ve OCR akışları hiç değişmeden personel için de çalışır.
--
-- İstemci tarafındaki karşılığı: features/counterparties/api.ts CounterpartyType.

alter table public.counterparties
  drop constraint if exists counterparties_type_check;

alter table public.counterparties
  add constraint counterparties_type_check
  check (type = any (array['individual'::text, 'company'::text, 'personel'::text]));
