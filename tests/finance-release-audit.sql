-- Metadata and aggregate counts only: no account names, emails or payment details.
select jsonb_pretty(jsonb_build_object(
  'server_version', current_setting('server_version'),
  'database_bytes', pg_database_size(current_database()),
  'extensions', (select jsonb_agg(extname order by extname) from pg_extension),
  'finance_private_exists', to_regnamespace('finance_private') is not null,
  'migration_versions', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'rpc_functions', (select jsonb_agg(jsonb_build_object('name', p.proname,
    'signature', pg_get_function_identity_arguments(p.oid), 'security_definer', p.prosecdef,
    'config', p.proconfig) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_payments','record_payments_v2','record_card_payment_owned',
      'settle_cash_atomic','cancel_cash_settlement_request','settle_offset_atomic','reverse_offset_atomic',
      'update_payment_atomic','delete_payment_atomic','mark_instrument_bounced','settle_endorsement_atomic',
      'cancel_endorsement_request','preview_instrument_bounce','bounce_instrument_atomic')),
  'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname) order by c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' and c.relname in ('payments','transactions','obligations','workspace_members')),
  'storage_policies', (select jsonb_agg(policyname order by policyname) from pg_policies where schemaname='storage' and tablename='objects'),
  'rls_disabled_public_tables', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'counts', jsonb_build_object('obligations',(select count(*) from public.obligations),
    'payments',(select count(*) from public.payments),'transactions',(select count(*) from public.transactions)),
  'overpaid_obligations', (select count(*) from public.obligations o where
    (select coalesce(sum(p.amount_minor),0) from public.payments p where p.obligation_id=o.id)>o.total_amount_minor),
  'linked_movement_mismatches', (select count(*) from public.payments p join public.transactions t on t.id=p.transaction_id
    where p.account_id is not null and (p.amount_minor is distinct from t.amount_minor or p.account_id is distinct from t.account_id or p.workspace_id is distinct from t.workspace_id))
));
