-- Kart taksitli alışverişleri (design/vademde-redesign/PLANLAR.md §5.5) ve nakit uyarısı günlüğü (§5.6).
-- EKLEYİCİ: iki yeni tablo; mevcut tablolara dokunmaz.
-- Geri alma: drop table public.card_installment_purchases; drop table public.cash_alert_log;
-- (cash_alert_log ve 'send-cash-alerts' cron işi 20261005 tarihli cash_alert_log migration'ıyla oluşturuldu:
--  select cron.unschedule('send-cash-alerts');)

create table if not exists public.card_installment_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Kredi kartı hesabı. İlişki, accounts'a gömülü seçimleri etkilemez (FK bu tablodan çıkar).
  account_id uuid not null references public.accounts(id) on delete cascade,
  merchant text not null,
  -- Toplam tutar, kuruş (para birimi ISO koduyla; kayan nokta yok — bağlayıcı kural 7).
  total_minor bigint not null check (total_minor > 0),
  currency_code text not null default 'TRY',
  installment_count int not null check (installment_count between 2 and 60),
  -- İlk taksidin düştüğü ekstre ayı (ayın 1'i).
  first_statement_month date not null check (extract(day from first_statement_month) = 1),
  created_at timestamptz not null default now()
);

create index if not exists card_installment_purchases_account_idx
  on public.card_installment_purchases (workspace_id, account_id);

alter table public.card_installment_purchases enable row level security;

create policy "card_installment_purchases_select_member" on public.card_installment_purchases
  for select using ((select public.is_workspace_member(workspace_id)));

create policy "card_installment_purchases_insert_editor" on public.card_installment_purchases
  for insert with check (
    public.can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.workspace_id = card_installment_purchases.workspace_id and a.type = 'credit_card'
    )
  );

create policy "card_installment_purchases_update_editor" on public.card_installment_purchases
  for update using (public.can_edit_workspace(workspace_id))
  with check (
    public.can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.workspace_id = card_installment_purchases.workspace_id and a.type = 'credit_card'
    )
  );

create policy "card_installment_purchases_delete_editor" on public.card_installment_purchases
  for delete using (public.can_edit_workspace(workspace_id));

-- Plan kilidi (salt okunur çalışma alanı) diğer tablolarla aynı tetikleyiciyle uygulanır.
drop trigger if exists enforce_write_access on public.card_installment_purchases;
create trigger enforce_write_access
  before insert or update on public.card_installment_purchases
  for each row execute function public.enforce_workspace_write_access();
