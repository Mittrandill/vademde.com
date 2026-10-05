-- Nakit uyarısı bildirim günlüğü (PLANLAR.md §5.6). Production'a MCP ile uygulandı; burada kayıt için.
-- Geri alma: select cron.unschedule('send-cash-alerts'); drop table public.cash_alert_log;
create table if not exists public.cash_alert_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists cash_alert_log_workspace_sent_idx on public.cash_alert_log (workspace_id, sent_at desc);
alter table public.cash_alert_log enable row level security;
revoke all on public.cash_alert_log from anon, authenticated;

select cron.schedule('send-cash-alerts', '0 6 * * *', replace(command, 'send-reminders', 'send-cash-alerts'))
from cron.job where jobname = 'send-due-reminders';
