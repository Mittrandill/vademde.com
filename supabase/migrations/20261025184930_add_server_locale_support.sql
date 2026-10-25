begin;

-- Only language preferences are normalized. Existing workspace/category names stay untouched.
alter table public.profiles add column if not exists locale text not null default 'tr';
update public.profiles set locale = case
  when split_part(replace(lower(coalesce(locale, 'tr')), '_', '-'), '-', 1) = 'tr' then 'tr'
  else 'en' end
where locale is null or locale not in ('tr', 'en');
alter table public.profiles alter column locale set default 'tr';
alter table public.profiles alter column locale set not null;
alter table public.profiles add constraint profiles_locale_supported check (locale in ('tr', 'en'));

alter table public.ai_insights add column locale text not null default 'tr'
  constraint ai_insights_locale_supported check (locale in ('tr', 'en'));
create index ai_insights_workspace_locale_status_idx
  on public.ai_insights (workspace_id, locale, status, generated_at desc);

-- The original one-argument catalog remains the exact Turkish source of truth.
create function public.default_category_catalog(p_workspace_type text, p_locale text)
returns table (kind text, name text, icon text, color text)
language sql immutable set search_path = ''
as $function$
  select c.kind, case when p_locale = 'en' then coalesce(translated.en, c.name) else c.name end, c.icon, c.color
  from public.default_category_catalog(p_workspace_type) c
  left join (values
    ('Abonelikler', 'Subscriptions'),
    ('Aidat', 'Association Fees'),
    ('Alışveriş', 'Shopping'),
    ('Araç Bakım & Servis', 'Vehicle Maintenance & Service'),
    ('Banka & Kart Ücretleri', 'Bank & Card Fees'),
    ('Bakım & Onarım', 'Maintenance & Repairs'),
    ('Bebek & Çocuk', 'Baby & Child'),
    ('Eğitim', 'Education'),
    ('Eğlence', 'Entertainment'),
    ('Ev & Yaşam', 'Home & Living'),
    ('Ev Hizmetleri', 'Home Services'),
    ('Evcil Hayvan', 'Pets'),
    ('Faturalar', 'Bills'),
    ('Giyim & Aksesuar', 'Clothing & Accessories'),
    ('Hediye & Bağış', 'Gifts & Donations'),
    ('Hobi', 'Hobbies'),
    ('Kargo & Teslimat', 'Shipping & Delivery'),
    ('Kira', 'Rent'),
    ('Kişisel Bakım', 'Personal Care'),
    ('Kitap & Kırtasiye', 'Books & Stationery'),
    ('Market', 'Groceries'),
    ('Mobilya & Dekorasyon', 'Furniture & Decoration'),
    ('Restoran / Kafe', 'Restaurant / Cafe'),
    ('Sağlık', 'Health'),
    ('Seyahat & Konaklama', 'Travel & Accommodation'),
    ('Spor & Fitness', 'Sports & Fitness'),
    ('Teknoloji & Elektronik', 'Technology & Electronics'),
    ('Telefon & İletişim', 'Phone & Communication'),
    ('Ulaşım', 'Transport'),
    ('Vergi & Sigorta', 'Tax & Insurance'),
    ('Yakıt', 'Fuel'),
    ('Diğer Gider', 'Other Expenses'),
    ('Burs', 'Scholarship'),
    ('Diğer Gelir', 'Other Income'),
    ('Emekli Maaşı', 'Pension'),
    ('Faiz Geliri', 'Interest Income'),
    ('Hediye & Destek', 'Gifts & Support'),
    ('Hizmet Geliri', 'Service Income'),
    ('İkinci El Satış', 'Secondhand Sales'),
    ('Kira Geliri', 'Rental Income'),
    ('Maaş', 'Salary'),
    ('Prim & Bonus', 'Bonuses'),
    ('Serbest Çalışma', 'Freelance Work'),
    ('Telif & Lisans Geliri', 'Royalties & Licensing Income'),
    ('Yatırım Geliri', 'Investment Income'),
    ('Araç Giderleri', 'Vehicle Expenses'),
    ('Banka Masrafları', 'Bank Charges'),
    ('Depo Giderleri', 'Warehouse Expenses'),
    ('Eğitim & Gelişim', 'Training & Development'),
    ('Ekipman & Demirbaş', 'Equipment & Fixed Assets'),
    ('Güvenlik & Temizlik', 'Security & Cleaning'),
    ('Hukuk & Danışmanlık', 'Legal & Consulting'),
    ('İnternet & İletişim', 'Internet & Communication'),
    ('İş Sağlığı & Güvenliği', 'Occupational Health & Safety'),
    ('Kargo & Lojistik', 'Shipping & Logistics'),
    ('Kırtasiye & Ofis', 'Stationery & Office'),
    ('Lisans & Resmî Harçlar', 'Licenses & Official Fees'),
    ('Malzeme & Hammadde', 'Materials & Raw Materials'),
    ('Muhasebe & Mali Müşavir', 'Accounting & Tax Advisory'),
    ('Pazarlama & Reklam', 'Marketing & Advertising'),
    ('Personel', 'Staff'),
    ('POS Komisyonu', 'POS Commission'),
    ('Profesyonel Hizmetler', 'Professional Services'),
    ('Restoran & Temsil', 'Dining & Business Entertainment'),
    ('SGK', 'Social Security'),
    ('Sigorta', 'Insurance'),
    ('Stok & Ürün Alımı', 'Inventory & Product Purchases'),
    ('Taşeron Giderleri', 'Subcontractor Expenses'),
    ('Teknoloji & Donanım', 'Technology & Hardware'),
    ('Vergi & Resmî Ödemeler', 'Tax & Official Payments'),
    ('Yazılım & Abonelik', 'Software & Subscriptions'),
    ('Yemek & İkram', 'Meals & Catering'),
    ('Abonelik Geliri', 'Subscription Income'),
    ('Komisyon Geliri', 'Commission Income'),
    ('Proje Geliri', 'Project Income'),
    ('Sponsorluk & Reklam Geliri', 'Sponsorship & Advertising Income'),
    ('Ürün Satışı', 'Product Sales')
  ) as translated(tr, en) on translated.tr = c.name;
$function$;
revoke all on function public.default_category_catalog(text, text) from public, anon, authenticated;

create or replace function public.seed_default_categories()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_locale text;
begin
  select coalesce(p.locale, 'tr') into v_locale from public.profiles p where p.id = new.owner_id;
  insert into public.categories (workspace_id, kind, name, icon, color, is_default)
  select new.id, c.kind, c.name, c.icon, c.color, true
  from public.default_category_catalog(new.type, coalesce(v_locale, 'tr')) c
  on conflict (workspace_id, kind, name) do nothing;
  return new;
end;
$function$;
revoke all on function public.seed_default_categories() from public, anon, authenticated;

create or replace function public.setup_initial_workspaces(
  p_mode text,
  p_name text default null,
  p_opening_balance_minor bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_primary uuid;
  v_locale text;
  v_limit integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select coalesce(p.locale, 'tr') into v_locale from public.profiles p where p.id = v_uid;

  v_limit := public.workspace_limit_for_owner(v_uid);
  v_count := public.owned_workspace_count(v_uid);

  if p_mode = 'both' then
    if v_count + 2 > v_limit then
      raise exception 'WORKSPACE_LIMIT_REACHED: Ücretsiz planda % çalışma alanı oluşturabilirsiniz. Hem kişisel hem işletme alanı için planınızı yükseltin.', v_limit
        using errcode = 'check_violation';
    end if;
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, case when v_locale = 'en' then 'Personal' else 'Kişisel' end, 'personal')
      returning id into v_primary;
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, case when v_locale = 'en' then 'Business' else 'İşletme' end, 'business');
    if p_opening_balance_minor is not null then
      insert into public.accounts (workspace_id, name, type, opening_balance_minor)
        values (v_primary, case when v_locale = 'en' then 'Cash' else 'Kasa' end, 'cash', p_opening_balance_minor);
    end if;
  elsif p_mode in ('personal', 'business') then
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, coalesce(nullif(btrim(p_name), ''), case when v_locale = 'en' then 'Workspace' else 'Çalışma Alanı' end), p_mode)
      returning id into v_primary;
    if p_opening_balance_minor is not null then
      insert into public.accounts (workspace_id, name, type, opening_balance_minor)
        values (v_primary, case when v_locale = 'en' then 'Cash' else 'Kasa' end, 'cash', p_opening_balance_minor);
    end if;
  else
    raise exception 'Geçersiz çalışma alanı türü: %', p_mode;
  end if;

  return v_primary;
end;
$function$;
revoke all on function public.setup_initial_workspaces(text, text, bigint) from public, anon;
grant execute on function public.setup_initial_workspaces(text, text, bigint) to authenticated;

commit;
