-- =====================================================================
-- SkillTube | SQL 6 : helper functions for the 6-hour catalog job (GitHub Actions)
--
-- Run AFTER files 1 to 5. Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Expected answer: "Success. No rows returned". Safe to run again.
-- These functions can be called ONLY with the service key (stored as a GitHub secret).
-- =====================================================================

-- a page of repositories to check (ids only, nothing private leaves)
create or replace function public.catalog_list(p_after uuid default null, p_limit int default 1000)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'node', x.github_node_id, 'owner', x.github_owner_id) order by x.id), '[]'::jsonb)
    from (select id, github_node_id, github_owner_id from public.skills
           where deleted_at is null and status in ('active', 'hidden', 'under_review')
             and (p_after is null or id > p_after)
           order by id limit least(greatest(p_limit, 1), 2000)) x
$$;

-- results from GitHub:
--   [{"id": uuid, "state": "ok", "full_name", "url", "fork", "pushed_at", "owner_id", "owner_login"} ,
--    {"id": uuid, "state": "missing"}]
-- ok       -> data refreshed, missing counter reset; if the repository now belongs to someone else the
--             "owner verified" mark is removed
-- missing  -> counter +1; the skill is deleted after 2 misses in a row (two runs = 6 to 12 hours)
create or replace function public.catalog_apply(p_results jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r jsonb; ok_n int := 0; miss_n int := 0; del_n int := 0; s public.skills; need int := 2;
begin
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into s from public.skills where id = (r->>'id')::uuid and deleted_at is null;
    continue when not found;

    if r->>'state' = 'ok' then
      update public.skills set
        repo_full_name = coalesce(nullif(r->>'full_name', ''), repo_full_name),
        repo_url = case when (r->>'url') ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then r->>'url' else repo_url end,
        is_fork = coalesce((r->>'fork')::boolean, is_fork),
        repo_pushed_at = coalesce((r->>'pushed_at')::timestamptz, repo_pushed_at),
        github_owner_login = coalesce(nullif(r->>'owner_login', ''), github_owner_login),
        github_owner_id = coalesce((r->>'owner_id')::bigint, github_owner_id),
        verified = case when (r->>'owner_id') is not null and (r->>'owner_id')::bigint <> github_owner_id then false else verified end,
        missing_count = 0, last_checked = now()
       where id = s.id;
      ok_n := ok_n + 1;

    elsif r->>'state' = 'missing' then
      if s.missing_count + 1 >= need then
        insert into public.removed_records (github_id, kind, ref, reason)
        select github_id, 'skill_repo_gone', s.id::text, 'repository missing in 2 checks' from public.profiles where id = s.owner_id;
        update public.user_badges set revoked_at = now(), revoked_reason = 'repository no longer exists'
         where source_skill_id = s.id and revoked_at is null;
        if s.image_path is not null then
          insert into public.storage_trash (path) values (s.image_path) on conflict do nothing;
        end if;
        delete from public.skills where id = s.id;
        del_n := del_n + 1;
      else
        update public.skills set missing_count = missing_count + 1, last_checked = now() where id = s.id;
      end if;
      miss_n := miss_n + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', ok_n, 'missing', miss_n, 'deleted', del_n);
end;
$$;

-- picture files waiting to be removed from storage
create or replace function public.trash_list(p_limit int default 200)
returns jsonb language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(path), '[]'::jsonb) from (select path from public.storage_trash order by at limit least(greatest(p_limit, 1), 1000)) t $$;

create or replace function public.trash_done(p_paths jsonb)
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  delete from public.storage_trash where path in (select jsonb_array_elements_text(coalesce(p_paths, '[]'::jsonb)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.catalog_list(uuid, int), public.catalog_apply(jsonb),
                       public.trash_list(int), public.trash_done(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_list(uuid, int), public.catalog_apply(jsonb),
                          public.trash_list(int), public.trash_done(jsonb) to service_role;
