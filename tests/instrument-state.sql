do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test database required'; end if;
end $$;
alter table public.obligations add column document_type text, add column instrument_status text,
 add column instrument_status_changed_at timestamptz;
create trigger instrument_close before update of status on public.obligations
 for each row when(old.status is distinct from new.status) execute function public.instrument_status_on_close();
do $$ declare instrument uuid; state text; begin
 instrument:='00000000-0000-0000-0000-000000000198';
 insert into public.obligations(id,workspace_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status,document_type,instrument_status)
 values(instrument,'00000000-0000-0000-0000-000000000010',10000,10000,'TRY','receivable','bekliyor','cek','portfoy');
 update public.obligations set status='tahsil_edildi' where id=instrument;
 select instrument_status into state from public.obligations where id=instrument;
 if state<>'tahsil_edildi' then raise exception 'Instrument did not close'; end if;
 update public.obligations set status='bekliyor' where id=instrument;
 select instrument_status into state from public.obligations where id=instrument;
 if state<>'portfoy' then raise exception 'Instrument did not reopen'; end if;
 raise notice 'PASS: collected cheque reopens in portfolio after payment undo';
end $$;
