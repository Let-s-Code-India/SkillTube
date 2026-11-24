create function public.follow_by_username(p_username text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  dev_id uuid;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select id into dev_id from public.profiles
   where lower(github_username) = lower(btrim(p_username))
     and gate_ok and not blocked;
  if not found then raise exception 'DEVELOPER_NOT_FOUND'; end if;
  return public.toggle_follow(dev_id);
end;
$$;

create function public.mark_developer_seen_by_username(p_username text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  dev_id uuid;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select id into dev_id from public.profiles
   where lower(github_username) = lower(btrim(p_username))
     and gate_ok and not blocked;
  if not found then raise exception 'DEVELOPER_NOT_FOUND'; end if;
  perform public.mark_developer_seen(dev_id);
end;
$$;

revoke all on function public.follow_by_username(text) from public, anon;
revoke all on function public.mark_developer_seen_by_username(text) from public, anon;
grant execute on function public.follow_by_username(text) to authenticated, service_role;
grant execute on function public.mark_developer_seen_by_username(text) to authenticated, service_role;
