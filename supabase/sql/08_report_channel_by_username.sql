create function public.file_report_channel_by_username(
  p_username text,
  p_reason text,
  p_note text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  channel_user uuid;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select id into channel_user from public.profiles
   where lower(github_username) = lower(btrim(p_username))
     and gate_ok and not blocked;
  if not found then raise exception 'DEVELOPER_NOT_FOUND'; end if;
  perform public.file_report(null, channel_user, p_reason, p_note);
end;
$$;

revoke all on function public.file_report_channel_by_username(text, text, text) from public, anon;
grant execute on function public.file_report_channel_by_username(text, text, text) to authenticated, service_role;
