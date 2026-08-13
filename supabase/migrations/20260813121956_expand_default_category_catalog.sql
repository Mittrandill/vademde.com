begin;

-- Varsayilan kategoriler çalışma alanı türüne göre ayrılır. Katalog tek bir SQL
-- fonksiyonunda tutulur; hem yeni çalışma alanı trigger'ı hem mevcut çalışma
-- alanlarının eksiklerini tamamlayan backfill aynı kaynağı kullanır.
create or replace function public.default_category_catalog(p_workspace_type text)
returns table (
  kind text,
  name text,
  icon text,
  color text
)
language sql
immutable
set search_path = ''
as $function$
  select
    catalog.kind,
    catalog.name,
    catalog.icon,
    catalog.color
  from (values
    -- Kişisel giderler
    ('personal', 'expense', 'Abonelikler', 'repeat', '#8B6BE0'),
    ('personal', 'expense', 'Aidat', 'business', '#5B6472'),
    ('personal', 'expense', 'Alışveriş', 'basket', '#39B7C9'),
    ('personal', 'expense', 'Araç Bakım & Servis', 'car-sport', '#4C8DFF'),
    ('personal', 'expense', 'Banka & Kart Ücretleri', 'card', '#FF625C'),
    ('personal', 'expense', 'Bakım & Onarım', 'construct', '#B98450'),
    ('personal', 'expense', 'Bebek & Çocuk', 'happy', '#E177B0'),
    ('personal', 'expense', 'Eğitim', 'school', '#7C6FF0'),
    ('personal', 'expense', 'Eğlence', 'game-controller', '#9B6BF2'),
    ('personal', 'expense', 'Ev & Yaşam', 'home', '#C97B4A'),
    ('personal', 'expense', 'Ev Hizmetleri', 'settings', '#B98450'),
    ('personal', 'expense', 'Evcil Hayvan', 'paw', '#C98F4A'),
    ('personal', 'expense', 'Faturalar', 'flash', '#F0B429'),
    ('personal', 'expense', 'Giyim & Aksesuar', 'shirt', '#E177B0'),
    ('personal', 'expense', 'Hediye & Bağış', 'gift', '#E0618E'),
    ('personal', 'expense', 'Hobi', 'color-wand', '#9B6BF2'),
    ('personal', 'expense', 'Kargo & Teslimat', 'cube', '#39B7C9'),
    ('personal', 'expense', 'Kira', 'key', '#C97B4A'),
    ('personal', 'expense', 'Kişisel Bakım', 'body', '#E0618E'),
    ('personal', 'expense', 'Kitap & Kırtasiye', 'book', '#7C6FF0'),
    ('personal', 'expense', 'Market', 'cart', '#3FB27F'),
    ('personal', 'expense', 'Mobilya & Dekorasyon', 'color-palette', '#C98F4A'),
    ('personal', 'expense', 'Restoran / Kafe', 'restaurant', '#E8985E'),
    ('personal', 'expense', 'Sağlık', 'medkit', '#F0616D'),
    ('personal', 'expense', 'Seyahat & Konaklama', 'airplane', '#2FA9C9'),
    ('personal', 'expense', 'Spor & Fitness', 'fitness', '#3FB27F'),
    ('personal', 'expense', 'Teknoloji & Elektronik', 'hardware-chip', '#3457D5'),
    ('personal', 'expense', 'Telefon & İletişim', 'call', '#2FA9C9'),
    ('personal', 'expense', 'Ulaşım', 'car', '#4C8DFF'),
    ('personal', 'expense', 'Vergi & Sigorta', 'shield-checkmark', '#3457D5'),
    ('personal', 'expense', 'Yakıt', 'flame', '#FFB000'),
    ('personal', 'expense', 'Diğer Gider', 'ellipsis-horizontal', '#8B8D98'),

    -- Kişisel gelirler
    ('personal', 'income', 'Burs', 'school', '#7C6FF0'),
    ('personal', 'income', 'Diğer Gelir', 'ellipsis-horizontal', '#5B6472'),
    ('personal', 'income', 'Emekli Maaşı', 'cash', '#3E8E5A'),
    ('personal', 'income', 'Faiz Geliri', 'stats-chart', '#FFB000'),
    ('personal', 'income', 'Hediye & Destek', 'gift', '#E0618E'),
    ('personal', 'income', 'Hizmet Geliri', 'briefcase', '#52CE96'),
    ('personal', 'income', 'İkinci El Satış', 'pricetag', '#39B7C9'),
    ('personal', 'income', 'Kira Geliri', 'business', '#E177B0'),
    ('personal', 'income', 'Maaş', 'cash', '#3E8E5A'),
    ('personal', 'income', 'Prim & Bonus', 'trophy', '#52CE96'),
    ('personal', 'income', 'Serbest Çalışma', 'briefcase', '#2FA9C9'),
    ('personal', 'income', 'Telif & Lisans Geliri', 'document-text', '#6B4DFF'),
    ('personal', 'income', 'Yatırım Geliri', 'rocket', '#6B4DFF'),

    -- İşletme giderleri
    ('business', 'expense', 'Araç Giderleri', 'car-sport', '#4C8DFF'),
    ('business', 'expense', 'Banka Masrafları', 'business', '#FF625C'),
    ('business', 'expense', 'Bakım & Onarım', 'construct', '#B98450'),
    ('business', 'expense', 'Depo Giderleri', 'layers', '#6C7A89'),
    ('business', 'expense', 'Diğer Gider', 'ellipsis-horizontal', '#8B8D98'),
    ('business', 'expense', 'Eğitim & Gelişim', 'school', '#7C6FF0'),
    ('business', 'expense', 'Ekipman & Demirbaş', 'hardware-chip', '#3457D5'),
    ('business', 'expense', 'Faturalar', 'flash', '#F0B429'),
    ('business', 'expense', 'Güvenlik & Temizlik', 'shield', '#6C7A89'),
    ('business', 'expense', 'Hukuk & Danışmanlık', 'document-text', '#6B4DFF'),
    ('business', 'expense', 'İnternet & İletişim', 'wifi', '#2FA9C9'),
    ('business', 'expense', 'İş Sağlığı & Güvenliği', 'medkit', '#F0616D'),
    ('business', 'expense', 'Kargo & Lojistik', 'cube', '#39B7C9'),
    ('business', 'expense', 'Kira', 'business', '#C97B4A'),
    ('business', 'expense', 'Kırtasiye & Ofis', 'pencil', '#7C6FF0'),
    ('business', 'expense', 'Lisans & Resmî Harçlar', 'document', '#3457D5'),
    ('business', 'expense', 'Malzeme & Hammadde', 'cube', '#39B7C9'),
    ('business', 'expense', 'Muhasebe & Mali Müşavir', 'calculator', '#5B6472'),
    ('business', 'expense', 'Pazarlama & Reklam', 'trending-up', '#E0618E'),
    ('business', 'expense', 'Personel', 'people', '#6C7A89'),
    ('business', 'expense', 'POS Komisyonu', 'card', '#FF625C'),
    ('business', 'expense', 'Profesyonel Hizmetler', 'briefcase', '#52CE96'),
    ('business', 'expense', 'Restoran & Temsil', 'restaurant', '#E8985E'),
    ('business', 'expense', 'Seyahat & Konaklama', 'airplane', '#2FA9C9'),
    ('business', 'expense', 'SGK', 'shield-checkmark', '#3457D5'),
    ('business', 'expense', 'Sigorta', 'shield-checkmark', '#4C8DFF'),
    ('business', 'expense', 'Stok & Ürün Alımı', 'basket', '#3FB27F'),
    ('business', 'expense', 'Taşeron Giderleri', 'people', '#B98450'),
    ('business', 'expense', 'Teknoloji & Donanım', 'hardware-chip', '#3457D5'),
    ('business', 'expense', 'Telefon & İletişim', 'call', '#2FA9C9'),
    ('business', 'expense', 'Ulaşım', 'car', '#4C8DFF'),
    ('business', 'expense', 'Vergi & Resmî Ödemeler', 'receipt', '#3457D5'),
    ('business', 'expense', 'Yakıt', 'flame', '#FFB000'),
    ('business', 'expense', 'Yazılım & Abonelik', 'apps', '#8B6BE0'),
    ('business', 'expense', 'Yemek & İkram', 'fast-food', '#E8985E'),

    -- İşletme gelirleri
    ('business', 'income', 'Abonelik Geliri', 'repeat', '#8B6BE0'),
    ('business', 'income', 'Diğer Gelir', 'ellipsis-horizontal', '#5B6472'),
    ('business', 'income', 'Faiz Geliri', 'stats-chart', '#FFB000'),
    ('business', 'income', 'Hizmet Geliri', 'briefcase', '#52CE96'),
    ('business', 'income', 'Kira Geliri', 'business', '#E177B0'),
    ('business', 'income', 'Komisyon Geliri', 'trending-up', '#E8985E'),
    ('business', 'income', 'Proje Geliri', 'rocket', '#6B4DFF'),
    ('business', 'income', 'Sponsorluk & Reklam Geliri', 'star', '#E0618E'),
    ('business', 'income', 'Telif & Lisans Geliri', 'document-text', '#7C6FF0'),
    ('business', 'income', 'Ürün Satışı', 'pricetag', '#2FA9C9')
  ) as catalog(workspace_type, kind, name, icon, color)
  where catalog.workspace_type = case
    when p_workspace_type = 'business' then 'business'
    else 'personal'
  end;
$function$;

-- Katalog uygulama API'si değildir; yalnızca veritabanı içi seed/backfill kaynağıdır.
revoke all on function public.default_category_catalog(text) from public;
revoke all on function public.default_category_catalog(text) from anon, authenticated;

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  insert into public.categories (workspace_id, kind, name, icon, color, is_default)
  select new.id, catalog.kind, catalog.name, catalog.icon, catalog.color, true
  from public.default_category_catalog(new.type) as catalog
  on conflict (workspace_id, kind, name) do nothing;

  return new;
end;
$function$;

revoke all on function public.seed_default_categories() from public;
revoke all on function public.seed_default_categories() from anon, authenticated;

-- Eski birleşik/adlandırması dar varsayılanları yeni kataloğun adlarına taşır.
-- Yalnızca sistem varsayılanları güncellenir; kullanıcı kategorileri değiştirilmez.
update public.categories as category
set name = 'Faturalar'
where category.is_default
  and category.name = 'Elektrik, Su, İnternet'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Faturalar')
  );

update public.categories as category
set name = 'Bakım & Onarım'
where category.is_default
  and category.name = 'Bakım'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Bakım & Onarım')
  );

update public.categories as category
set name = 'Vergi & Sigorta'
where category.is_default
  and category.name = 'Vergi ve Sigorta'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Vergi & Sigorta')
  );

update public.categories as category
set name = 'Abonelikler'
where category.is_default
  and category.name = 'Abonelik'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Abonelikler')
  );

update public.categories as category
set name = 'Faiz Geliri'
where category.is_default
  and category.kind = 'income'
  and category.name = 'Faiz'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Faiz Geliri')
  );

update public.categories as category
set name = 'Komisyon Geliri'
where category.is_default
  and category.kind = 'income'
  and category.name = 'Komisyon'
  and not exists (
    select 1
    from public.categories as existing
    where existing.workspace_id = category.workspace_id
      and existing.kind = category.kind
      and lower(existing.name) = lower('Komisyon Geliri')
  );

update public.categories
set icon = 'card'
where is_default
  and name = 'POS Komisyonu'
  and icon = 'cut';

-- Mevcut çalışma alanlarına yalnızca eksik kategorileri ekler. Aynı ad kullanıcı
-- tarafından daha önce farklı harf büyüklüğüyle oluşturulduysa ikinci kayıt açılmaz.
insert into public.categories (workspace_id, kind, name, icon, color, is_default)
select workspace.id, catalog.kind, catalog.name, catalog.icon, catalog.color, true
from public.workspaces as workspace
cross join lateral public.default_category_catalog(workspace.type) as catalog
where not exists (
  select 1
  from public.categories as existing
  where existing.workspace_id = workspace.id
    and existing.kind = catalog.kind
    and lower(existing.name) = lower(catalog.name)
)
on conflict (workspace_id, kind, name) do nothing;

commit;
