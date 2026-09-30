-- 1) Belge türü kısıtı: 'borc_verme' uygulamada vardı (features/obligations/documentTypes.ts) ama
--    obligations_document_type_check listesinde yoktu — "Borç Verme" kaydı veritabanında
--    reddediliyordu. 'avans' yeni türdür: cariye yapılan ön ödeme / cariden alınan avans (bkz.
--    features/payments/api.ts createAdvanceObligation). Ödemeyi aşan tutar artık bağımsız bir hareket
--    olarak kaybolmaz, ters yönde bir avans kaydı olarak cari bakiyesine girer ve sonraki faturadan
--    mahsup edilir.
alter table public.obligations drop constraint if exists obligations_document_type_check;
alter table public.obligations add constraint obligations_document_type_check check (
  document_type = any (array[
    'kredi', 'kredi_karti_ekstresi', 'nakit_avans', 'cek', 'senet', 'borc_verme', 'avans', 'fatura',
    'abonelik', 'kira', 'maas', 'vergi_sgk', 'tedarikci_borcu', 'musteri_alacagi', 'banka_dekontu',
    'makbuz_fis', 'sozlesme_odeme_plani', 'diger'
  ]::text[])
);

-- 2) Anapara payı: kredi / nakit avans / borç verme para hareketlerinin anapara kısmı gelir ya da
--    gider değildir — hesap bakiyesini etkiler ama gelir-gider raporlarına girmez. Önceden nakit
--    avans "gelir", geri ödemesi "gider"; borç verme "gider", geri alınması "gelir" sayılıyordu;
--    kredi taksitlerinin tamamı (anapara dahil) gider görünüyordu. Raporlar artık
--    amount_minor - financing_minor toplar (bkz. features/reports/api.ts, features/dashboard/api.ts).
alter table public.transactions
  add column if not exists financing_minor bigint not null default 0;
alter table public.transactions drop constraint if exists transactions_financing_minor_check;
-- Üst sınır (financing_minor <= amount_minor) bilinçli olarak kısıt değildir: yayındaki eski sürümler
-- bir hareketin tutarını düşürürken bu kolonu bilmez ve güncelleme reddedilirdi. Raporlar payı
-- tutarla sınırlar (bkz. features/reports/api.ts profitAndLossMinor).
alter table public.transactions add constraint transactions_financing_minor_check
  check (financing_minor >= 0);

comment on column public.transactions.financing_minor is
  'Hareketin anapara (borçlanma/borç verme) kısmı. Hesap bakiyesini etkiler, gelir-gider raporlarına girmez.';

-- Geriye dönük doldurma: kredi/nakit avans/borç verme ödemelerinden oluşan hareketler. Taksitte
-- anapara/faiz kırılımı varsa anapara payı orantılı ayrılır; yoksa tamamı anapara sayılır.
update public.transactions t
set financing_minor = least(t.amount_minor, case
  when i.principal_minor is not null and i.interest_minor is not null and (i.principal_minor + i.interest_minor) > 0
    then round(t.amount_minor::numeric * i.principal_minor / (i.principal_minor + i.interest_minor))::bigint
  else t.amount_minor
end)
from public.payments p
join public.obligations o on o.id = p.obligation_id
left join public.installments i on i.id = p.installment_id
where p.transaction_id = t.id
  and o.document_type in ('kredi', 'nakit_avans', 'borc_verme');

-- Nakit avansın hesaba yatan tutarı ve ödünç verilen para (bkz. app/obligations/new.tsx).
update public.transactions
set financing_minor = amount_minor
where (direction = 'income' and description like 'Nakit avans — %')
   or (direction = 'expense' and description like 'Ödünç verildi — %');
