-- =====================================================================
-- SkillTube | SQL 5 : list of public pages for sitemap.xml (used by the Cloudflare Worker)
--
-- Run AFTER files 1, 2, 3, 4. Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Expected answer: "Success. No rows returned". Safe to run again.
-- Gives out only skill ids / usernames and dates that are already public.
-- =====================================================================
create or replace function public.public_sitemap(p_kind text, p_page int default 0)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare per int := 5000; pg int := greatest(coalesce(p_page, 0), 0); total bigint; items jsonb;
begin
  if p_kind = 'skill' then
    select count(*) into total from public.skills s join public.profiles p on p.id = s.owner_id
     where s.status = 'active' and s.deleted_at is null and p.gate_ok and not p.blocked and not p.hide_public;
    select coalesce(jsonb_agg(jsonb_build_object('k', x.id, 't', x.updated_at)), '[]'::jsonb) into items from (
      select s.id, s.updated_at from public.skills s join public.profiles p on p.id = s.owner_id
       where s.status = 'active' and s.deleted_at is null and p.gate_ok and not p.blocked and not p.hide_public
       order by s.created_at, s.id offset pg * per limit per) x;
  elsif p_kind = 'dev' then
    select count(*) into total from public.profiles p
     where p.gate_ok and not p.blocked and not p.hide_public and p.skills_count > 0;
    select coalesce(jsonb_agg(jsonb_build_object('k', x.github_username, 't', x.created_at)), '[]'::jsonb) into items from (
      select p.github_username, p.created_at from public.profiles p
       where p.gate_ok and not p.blocked and not p.hide_public and p.skills_count > 0 and p.github_username is not null
       order by p.created_at, p.id offset pg * per limit per) x;
  else
    return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('total', total, 'items', items);
end;
$$;

revoke all on function public.public_sitemap(text, int) from public, anon, authenticated;
grant execute on function public.public_sitemap(text, int) to anon, authenticated, service_role;
