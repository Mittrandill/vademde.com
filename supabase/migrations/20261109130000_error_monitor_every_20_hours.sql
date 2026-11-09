-- Log Query kotası için hata toplayıcı 20 saatte bir okur. pg_cron 20 saatlik aralığı ifade
-- edemediğinden iş saatte bir uyanır; son başarılı okumanın üzerinden 20 saat geçmediyse claim null
-- döner ve hiçbir log sorgusu atılmaz. İmleç yalnızca başarılı okumada ilerlediği için başarısız
-- okuma bir sonraki saatte yeniden denenir. Aralık, fonksiyondaki 23 saatlik okuma penceresinden
-- küçük kalmalıdır; aksi hâlde aradaki loglar okunmaz.
create or replace function public.error_monitor_claim()
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare result timestamptz;
begin
  update admin_private.error_collector_state
  set last_claim_at = now()
  where id = 1
    and (last_claim_at is null or last_claim_at < now() - interval '60 seconds')
    and cursor_at <= now() - interval '20 hours'
  returning cursor_at into result;
  return result;
end;
$$;
revoke all on function public.error_monitor_claim() from public, anon, authenticated;
grant execute on function public.error_monitor_claim() to service_role;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'collect-error-logs'),
  schedule := '0 * * * *'
);
