-- Uygulama içi destek: web iletişim formunun contact_messages tablosu destek talebinin kendisidir;
-- talebe yazılan cevaplar (destek ekibi ve kullanıcı) support_replies'ta sohbet olarak tutulur.
-- Bir talep kullanıcıya user_id ile (uygulamadan açılanlar) ya da doğrulanmış e-postasıyla
-- (web formundan açılanlar) bağlanır. Destek sohbeti kullanıcıya aittir, workspace verisi içermez.
-- Admin tarafı (cevap yazma, push) vademde.app reposundaki admin_support_* fonksiyonlarındadır.

alter table public.contact_messages
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists source text not null default 'web' check (source in ('web', 'app'));

create index if not exists contact_messages_user_idx on public.contact_messages(user_id) where user_id is not null;
create index if not exists contact_messages_email_idx on public.contact_messages(lower(email));

-- Anonim web formu hiçbir zaman bir kullanıcıya bağlı talep oluşturamaz (aksi halde başkasının
-- uygulamasındaki destek ekranına mesaj düşürülebilirdi).
drop policy if exists "anon can insert contact messages" on public.contact_messages;
create policy "anon can insert contact messages" on public.contact_messages
  for insert to anon with check (user_id is null and source = 'web');

-- Çağıran kullanıcı bu talebin sahibi mi? Web talepleri e-postayla eşleşir; yalnızca doğrulanmış
-- e-posta sayılır ki doğrulanmamış bir hesap başkasının taleplerini göremesin.
create or replace function public.is_own_support_message(p_user_id uuid, p_email text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_user_id = auth.uid()
    or (p_user_id is null and exists (
      select 1 from auth.users u
      where u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = lower(p_email)
    ))
  );
$$;
revoke all on function public.is_own_support_message(uuid, text) from public, anon;
grant execute on function public.is_own_support_message(uuid, text) to authenticated;

create policy "users read own support messages" on public.contact_messages
  for select to authenticated using (public.is_own_support_message(user_id, email));

create policy "users open support messages from app" on public.contact_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and source = 'app');

-- Uygulamadan açılan talepte e-posta/ad istemciden güvenilmez: hesaptaki değerlerle doldurulur
-- (admin bu e-postayı görüp cevaplar).
create or replace function public.fill_support_message_identity()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    select coalesce(u.email, ''), coalesce(nullif(p.full_name, ''), split_part(coalesce(u.email, ''), '@', 1))
      into new.email, new.name
      from auth.users u left join public.profiles p on p.id = u.id
      where u.id = new.user_id;
  end if;
  if length(coalesce(new.subject, '')) = 0 or length(new.subject) > 200 or length(coalesce(new.message, '')) = 0 or length(new.message) > 5000 then
    raise exception 'Invalid support message';
  end if;
  return new;
end;
$$;
create trigger contact_messages_fill_identity before insert on public.contact_messages
  for each row execute function public.fill_support_message_identity();

create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.contact_messages(id) on delete cascade,
  sender text not null check (sender in ('user', 'support')),
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  -- Destek cevabını kullanıcı ne zaman gördü (okunmamış rozeti için).
  read_at timestamptz
);
create index support_replies_message_idx on public.support_replies(message_id, created_at);

alter table public.support_replies enable row level security;
revoke all on public.support_replies from anon, authenticated;
grant select, insert on public.support_replies to authenticated;
grant update (read_at) on public.support_replies to authenticated;

create policy "users read own support replies" on public.support_replies
  for select to authenticated using (exists (
    select 1 from public.contact_messages c
    where c.id = message_id and public.is_own_support_message(c.user_id, c.email)
  ));

-- Kullanıcı yalnızca kendi adına yazar; 'support' satırları yalnızca admin fonksiyonundan gelir.
create policy "users reply to own support messages" on public.support_replies
  for insert to authenticated with check (sender = 'user' and read_at is null and exists (
    select 1 from public.contact_messages c
    where c.id = message_id and public.is_own_support_message(c.user_id, c.email)
  ));

create policy "users mark support replies read" on public.support_replies
  for update to authenticated
  using (sender = 'support' and exists (
    select 1 from public.contact_messages c
    where c.id = message_id and public.is_own_support_message(c.user_id, c.email)
  ))
  with check (sender = 'support');

-- Kullanıcı çözülmüş bir talebe yeniden yazarsa talep admin destek kutusunda tekrar açılır.
create or replace function public.reopen_support_message_on_user_reply()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender = 'user' then
    update admin_private.message_state set resolved_at = null, resolved_by = null
      where message_id = new.message_id and resolved_at is not null;
  end if;
  return new;
end;
$$;
create trigger support_replies_reopen after insert on public.support_replies
  for each row execute function public.reopen_support_message_on_user_reply();

revoke all on function public.fill_support_message_identity() from public, anon, authenticated;
revoke all on function public.reopen_support_message_on_user_reply() from public, anon, authenticated;
