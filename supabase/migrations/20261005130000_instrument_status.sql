-- Çek/senet portföyü yaşam döngüsü (design/vademde-redesign/PLANLAR.md §5.4).
-- EKLEYİCİ: iki boş bırakılabilir kolon, iki tetikleyici, bir fonksiyon. Eski uygulama sürümleri
-- bu kolonları bilmez ve etkilenmez. Geri alma dosyanın sonundaki "down" bloğundadır.

alter table public.obligations
  add column if not exists instrument_status text,
  add column if not exists instrument_status_changed_at timestamptz;

alter table public.obligations
  drop constraint if exists obligations_instrument_status_check;
alter table public.obligations
  add constraint obligations_instrument_status_check check (
    instrument_status is null
    or (
      document_type in ('cek', 'senet')
      and instrument_status in ('portfoy', 'ciro_edildi', 'tahsile_verildi', 'tahsil_edildi', 'karsiliksiz', 'odendi')
    )
  );

-- Mevcut kayıtlar: alınmış (receivable) çek/senet — açıksa portföyde; kapalıysa ciro (ödeme notu
-- "Ciro edildi…") ya da tahsil edilmiş. Verilmiş (payable) çek/senet — kapalıysa ödendi.
-- Geri doldurma kullanıcı yazma tetikleyicilerini (plan/yazma kontrolü) tetiklemesin.
set local session_replication_role = replica;

update public.obligations o
set instrument_status = case
    when o.direction = 'receivable' and o.status in ('odendi', 'tahsil_edildi') then
      case when exists (
        select 1 from public.payments p
        where p.obligation_id = o.id and p.notes ilike 'Ciro edildi%'
      ) then 'ciro_edildi' else 'tahsil_edildi' end
    when o.direction = 'receivable' and o.status <> 'iptal_edildi' then 'portfoy'
    when o.direction = 'payable' and o.status in ('odendi', 'tahsil_edildi') then 'odendi'
    else null
  end,
  instrument_status_changed_at = now()
where o.document_type in ('cek', 'senet') and o.instrument_status is null;

set local session_replication_role = origin;

-- Yeni alınmış çek/senet portföyde başlar (OCR onayı dahil tüm oluşturma yolları için).
create or replace function public.instrument_status_on_insert()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.instrument_status is null
     and new.document_type in ('cek', 'senet')
     and new.direction = 'receivable' then
    new.instrument_status := 'portfoy';
    new.instrument_status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists obligations_instrument_status_insert on public.obligations;
create trigger obligations_instrument_status_insert
  before insert on public.obligations
  for each row execute function public.instrument_status_on_insert();

-- Kayıt kapanınca durum güncel kalır (ciro/karşılıksız elle verilmiş durumlar ezilmez).
create or replace function public.instrument_status_on_close()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.document_type in ('cek', 'senet')
     and new.status in ('odendi', 'tahsil_edildi')
     and coalesce(new.instrument_status, '') not in ('ciro_edildi', 'karsiliksiz') then
    new.instrument_status := case when new.direction = 'receivable' then 'tahsil_edildi' else 'odendi' end;
    new.instrument_status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists obligations_instrument_status_close on public.obligations;
create trigger obligations_instrument_status_close
  before update of status on public.obligations
  for each row when (old.status is distinct from new.status)
  execute function public.instrument_status_on_close();

-- Karşılıksız: ciro edilmişse ciroyla kapanan fatura(lar) ve çekin kendi kapanışı geri alınır
-- (ödeme satırları silinir, payments_recompute_progress kalanları yeniden hesaplar). SECURITY INVOKER:
-- RLS çağıranın yetkisiyle işler; tek işlemde atomik.
create or replace function public.mark_instrument_bounced(p_obligation_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  o public.obligations;
begin
  select * into o from public.obligations where id = p_obligation_id;
  if not found then
    raise exception 'Kayıt bulunamadı';
  end if;
  if o.document_type not in ('cek', 'senet') then
    raise exception 'Yalnızca çek/senet karşılıksız işaretlenebilir';
  end if;
  if o.direction <> 'receivable' then
    raise exception 'Yalnızca alınmış çek/senet karşılıksız işaretlenebilir';
  end if;

  if o.instrument_status = 'ciro_edildi' then
    -- Çekin kapattığı faturalar yeniden açılır.
    delete from public.payments
      where workspace_id = o.workspace_id and settled_by_obligation_id = o.id;
    -- Çekin kendisi ciroyla kapanmıştı; A'nın borcu olarak yeniden açılır.
    delete from public.payments
      where workspace_id = o.workspace_id and obligation_id = o.id
        and settled_by_obligation_id is not null and notes ilike 'Ciro edildi%';
  end if;

  update public.obligations
  set instrument_status = 'karsiliksiz', instrument_status_changed_at = now()
  where id = o.id;
end;
$$;

revoke execute on function public.mark_instrument_bounced(uuid) from public, anon;
grant execute on function public.mark_instrument_bounced(uuid) to authenticated;

-- DOWN:
--   drop function if exists public.mark_instrument_bounced(uuid);
--   drop trigger if exists obligations_instrument_status_close on public.obligations;
--   drop trigger if exists obligations_instrument_status_insert on public.obligations;
--   drop function if exists public.instrument_status_on_close();
--   drop function if exists public.instrument_status_on_insert();
--   alter table public.obligations drop constraint if exists obligations_instrument_status_check;
--   alter table public.obligations drop column if exists instrument_status_changed_at, drop column if exists instrument_status;
