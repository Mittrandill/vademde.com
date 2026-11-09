-- Oturumsuz erişimi kapatır. Fonksiyonlar authenticated ve service_role için açık kalır; tetikleyiciler
-- ve SECURITY DEFINER fonksiyonlarının iç çağrıları EXECUTE yetkisinden etkilenmez.
revoke execute on function public.plan_for_owner(uuid) from public, anon;
revoke execute on function public.resolve_primary_workspace(uuid) from public, anon;
revoke execute on function public.owned_workspace_count(uuid) from public, anon;
revoke execute on function public.workspace_limit_for_owner(uuid) from public, anon;
revoke execute on function public.team_member_limit_for_workspace(uuid) from public, anon;
revoke execute on function public.workspace_write_allowed(uuid) from public, anon;
revoke execute on function public.set_primary_workspace(uuid) from public, anon;
revoke execute on function public.sync_plan_enforcement() from public, anon;
revoke execute on function public.delete_settlement_payments_for_obligation() from public, anon;
revoke execute on function public.enforce_workspace_plan_limit() from public, anon;
revoke execute on function public.enforce_workspace_write_access() from public, anon;

-- Public URL'ler RLS'ten geçmez; listeleme kapanır. upsert kendi dosyasını okuyabilmeye devam eder.
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

-- NOT VALID: mevcut satırlar kontrol edilmez, yalnızca yeni kayıtlar sınırlanır.
alter table public.waitlist_signups
  add constraint waitlist_signups_email_valid
    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid,
  add constraint waitlist_signups_source_length
    check (source is null or char_length(source) <= 200) not valid;
