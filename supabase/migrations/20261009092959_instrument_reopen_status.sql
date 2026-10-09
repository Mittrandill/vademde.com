-- State transitions only; existing instruments are not rewritten.
create or replace function public.instrument_status_on_close()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.document_type not in ('cek','senet') then return new; end if;
 if new.status in ('odendi','tahsil_edildi')
    and coalesce(new.instrument_status,'') not in ('ciro_edildi','karsiliksiz') then
   new.instrument_status := case when new.direction='receivable' then 'tahsil_edildi' else 'odendi' end;
   new.instrument_status_changed_at := now();
 elsif old.status in ('odendi','tahsil_edildi')
    and new.status in ('bekliyor','kismen_odendi','kismen_tahsil_edildi','gecikti')
    and new.instrument_status in ('odendi','tahsil_edildi','ciro_edildi') then
   new.instrument_status := case when new.direction='receivable' then 'portfoy' else null end;
   new.instrument_status_changed_at := now();
 end if;
 return new;
end $$;
revoke all on function public.instrument_status_on_close() from public,anon,authenticated;
