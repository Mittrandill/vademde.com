-- Güvenlik taraması düzeltmeleri. Kısıtlar istemci rollerine uygulanır; SECURITY DEFINER RPC'ler,
-- webhook'lar ve service role etkilenmez. Yayın öncesi canlıda bu kurallara aykırı kayıt yoktu.

-- 1. Belge dosyası, kaydın ait olduğu çalışma alanının klasöründe olmalı.
create or replace function public.validate_document_storage_path()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.storage_path is not null and split_part(new.storage_path, '/', 1) <> new.workspace_id::text then
    raise exception 'Belge yolu çalışma alanıyla eşleşmiyor' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger validate_document_storage_path
  before insert or update of storage_path, workspace_id on public.financial_documents
  for each row execute function public.validate_document_storage_path();

-- 2. Hatırlatıcılar yalnızca kendi çalışma alanındaki kayıtlara bağlanabilir.
create trigger a_validate_workspace_references
  before insert or update of workspace_id, obligation_id, account_id on public.reminders
  for each row execute function public.validate_workspace_references();

-- 3 ve 5. Sahiplik ve arşiv durumu istemciden değiştirilemez.
create or replace function public.guard_workspace_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
    and (new.owner_id is distinct from old.owner_id or new.archived_at is distinct from old.archived_at) then
    raise exception 'Bu alan istemciden değiştirilemez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_workspace_columns
  before update of owner_id, archived_at on public.workspaces
  for each row execute function public.guard_workspace_columns();

-- 5. Plan kilidi süresini yalnızca sync_plan_enforcement belirler; istemci değeri yok sayılır.
create or replace function public.guard_profile_plan_grace()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.plan_grace_until := old.plan_grace_until;
  end if;
  return new;
end;
$$;
create trigger guard_profile_plan_grace
  before update of plan_grace_until on public.profiles
  for each row execute function public.guard_profile_plan_grace();

-- 4. Üye ekleme ve rol değişimi yalnızca plan limitini denetleyen RPC'lerden yapılır.
drop policy if exists workspace_members_insert_owner on public.workspace_members;
drop policy if exists workspace_members_update_owner on public.workspace_members;
