-- Push token telefona özgüdür (push_tokens.token UNIQUE). Aynı telefonda önce başka bir hesapla
-- giriş yapıldıysa satır o hesabın adına kalıyordu; yeni hesabın istemci upsert'ü ON CONFLICT
-- UPDATE'te push_tokens_update_own (auth.uid() = user_id, eski satır) yüzünden 403 alıyor ve
-- yeni hesap hiç bildirim almıyordu. Token'ı şu an o cihazda oturum açmış kullanıcıya taşıyan
-- dar bir fonksiyon: yalnızca çağıranın kendi user_id'sine yazar, başka hiçbir satırı okumaz/döndürmez.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_token is null or length(p_token) = 0 or length(p_token) > 512 or p_platform not in ('ios', 'android') then
    raise exception 'Invalid input';
  end if;
  insert into public.push_tokens(user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
