-- =====================================================================
-- SkillTube | SQL 2 of 3 : triggers and the safe functions the website uses
--
-- Run this AFTER skilltube-sql-1-tables.sql finished with "Success".
-- Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Expected answer: "Success. No rows returned"
--
-- The website never touches tables. It calls these functions only.
-- Download links leave the database in ONE place: get_download_link().
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SMALL HELPERS
-- ---------------------------------------------------------------------
create function public.s_int(k text, d int)
returns int language sql stable security definer set search_path = ''
as $$ select coalesce((select (value #>> '{}')::int from public.settings where key = k), d) $$;

create function public.s_bool(k text, d boolean)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select (value #>> '{}')::boolean from public.settings where key = k), d) $$;

-- the signed-in person, only if the 3-month GitHub check passed and not blocked
create function public.me()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'LOGIN_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = u and gate_ok and not blocked) then
    raise exception 'ACCOUNT_NOT_READY';
  end if;
  return u;
end;
$$;

-- stops every write while you flip "read_only_mode" in the admin panel
create function public.writable()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.s_bool('read_only_mode', false) then raise exception 'READ_ONLY'; end if;
end;
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

create function public.is_admin_writer()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid() and role in ('owner','admin')) $$;

-- 'a  B c' -> 'a b c'
create function public.norm_tag(t text)
returns text language sql immutable set search_path = ''
as $$ select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))) $$;

-- ---------------------------------------------------------------------
-- 2. TRIGGERS
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger skills_set_updated_at
  before update of name, short_desc, long_desc, image_path, image_zoom, image_x, image_y
  on public.skills for each row execute function public.set_updated_at();

-- first GitHub sign-in creates the profile; blocked people and paused signups are refused
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  gid bigint; uname text; dname text; code text; tries int := 0;
begin
  begin
    gid := coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub')::bigint;
  exception when others then gid := null;
  end;

  if gid is not null and exists (select 1 from public.blocked_accounts where github_id = gid) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;
  if public.s_bool('signup_paused', false) then
    raise exception 'SIGNUPS_PAUSED';
  end if;

  uname := coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username');
  dname := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', uname, '')), 30);
  if char_length(dname) < 2 then dname := left(coalesce(nullif(uname, ''), 'developer'), 30); end if;
  if char_length(dname) < 2 then dname := 'developer'; end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    exit when not exists (select 1 from public.profiles where invite_code = code);
    tries := tries + 1;
    exit when tries > 10;
  end loop;

  insert into public.profiles (id, github_id, github_username, display_name, avatar_url, invite_code)
  values (new.id, gid, uname, dname, new.raw_user_meta_data ->> 'avatar_url', code)
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- GitHub username change follows the person on next login
create function public.handle_user_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username');
  if uname is not null then
    update public.profiles
       set github_username = uname,
           avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
     where id = new.id and (github_username is distinct from uname);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_update();

-- invitee count -> extra skill slots for the inviter
create function public.refresh_inviter(p_inviter uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles
     set extra_slots = (select count(*) from public.invites where inviter_id = p_inviter and is_active)
                       / greatest(public.s_int('invitees_per_slot', 10), 1)
   where id = p_inviter;
end;
$$;

-- skills_count, first_skill_at, invitee activation
create function public.skills_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare o uuid;
begin
  foreach o in array array[case when tg_op <> 'INSERT' then old.owner_id end,
                           case when tg_op <> 'DELETE' then new.owner_id end]
  loop
    continue when o is null;
    update public.profiles p
       set skills_count = (select count(*) from public.skills s
                            where s.owner_id = p.id and s.deleted_at is null
                              and s.status in ('active','hidden','under_review')),
           first_skill_at = case when p.first_skill_at is null and tg_op = 'INSERT' then now() else p.first_skill_at end
     where p.id = o;
  end loop;

  if tg_op = 'INSERT' and new.owner_id is not null then
    update public.invites set is_active = true where invitee_id = new.owner_id and not is_active;
    perform public.refresh_inviter((select inviter_id from public.invites where invitee_id = new.owner_id));
  end if;
  return null;
end;
$$;

create trigger skills_sync_trg
  after insert or update of deleted_at, status, owner_id or delete on public.skills
  for each row execute function public.skills_sync();

create function public.stars_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid; d int; own uuid;
begin
  sid := coalesce(new.skill_id, old.skill_id);
  d := case when tg_op = 'INSERT' then 1 else -1 end;
  update public.skills set star_count = greatest(star_count + d, 0) where id = sid returning owner_id into own;
  if own is not null then
    update public.profiles set total_stars = greatest(total_stars + d, 0) where id = own;
  end if;
  return null;
end;
$$;
create trigger stars_sync_trg after insert or delete on public.stars
  for each row execute function public.stars_sync();

create function public.follows_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d int; a uuid; b uuid;
begin
  d := case when tg_op = 'INSERT' then 1 else -1 end;
  a := coalesce(new.following_id, old.following_id);
  b := coalesce(new.follower_id,  old.follower_id);
  update public.profiles set followers_count = greatest(followers_count + d, 0) where id = a;
  update public.profiles set following_count = greatest(following_count + d, 0) where id = b;
  return null;
end;
$$;
create trigger follows_sync_trg after insert or delete on public.follows
  for each row execute function public.follows_sync();

-- ---------------------------------------------------------------------
-- 3. INTEREST CARD (rule based, ~200 bytes per person)
-- ---------------------------------------------------------------------
create function public.bump_interest(p_user uuid, p_topic text, p_weight numeric)
returns void language plpgsql security definer set search_path = ''
as $$
declare cur jsonb; last_at timestamptz; decay numeric; fresh jsonb;
begin
  if p_user is null or p_topic is null then return; end if;
  select scores, updated_at into cur, last_at from public.user_interests where user_id = p_user;
  if not found then cur := '{}'::jsonb; last_at := now(); end if;
  decay := power(0.5, greatest(extract(epoch from (now() - last_at)) / 86400.0, 0) / 30.0);  -- half-life 30 days
  select coalesce(jsonb_object_agg(t.key, round(least(t.value::numeric * decay, 100), 2)), '{}'::jsonb)
    into fresh from jsonb_each_text(cur) as t(key, value);
  fresh := jsonb_set(fresh, array[p_topic],
             to_jsonb(round(greatest(least(coalesce((fresh ->> p_topic)::numeric, 0) + p_weight, 100), 0), 2)), true);
  insert into public.user_interests (user_id, scores, updated_at) values (p_user, fresh, now())
  on conflict (user_id) do update set scores = excluded.scores, updated_at = now();
end;
$$;

-- gives every main topic of a skill the same weight
create function public.bump_skill_topics(p_user uuid, p_skill uuid, p_weight numeric)
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in select t.slug from public.skill_tags st join public.tags t on t.id = st.tag_id
            where st.skill_id = p_skill and t.level = 1
  loop
    perform public.bump_interest(p_user, r.slug, p_weight);
  end loop;
end;
$$;

create function public.set_interests(p_topics text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); s text;
begin
  perform public.writable();
  if cardinality(p_topics) <> 3 then raise exception 'PICK_THREE_TOPICS'; end if;
  foreach s in array p_topics loop
    if not exists (select 1 from public.tags where level = 1 and slug = s) then raise exception 'BAD_TOPIC'; end if;
    perform public.bump_interest(u, s, 5);
  end loop;
end;
$$;

create function public.clear_interests()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  delete from public.user_interests where user_id = u;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. TAGS: validate exactly 3 + 9 + 27 and write them
-- ---------------------------------------------------------------------
create function public.write_skill_tags(p_skill uuid, p_tags jsonb, p_touch boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  lv int; need int; arr text[]; x text; tid bigint; i int;
  affected bigint[] := '{}';
  old_ids bigint[];
begin
  select coalesce(array_agg(tag_id), '{}') into old_ids from public.skill_tags where skill_id = p_skill;

  -- validate everything first (nothing is written if one tag is wrong)
  for lv in 1..3 loop
    need := case lv when 1 then 3 when 2 then 9 else 27 end;
    select coalesce(array_agg(public.norm_tag(v)), '{}') into arr
      from jsonb_array_elements_text(coalesce(p_tags -> ('t' || lv), '[]'::jsonb)) as v;
    if cardinality(arr) <> need then raise exception 'TAGS_COUNT:level % needs exactly % tags', lv, need; end if;
    if (select count(distinct a) from unnest(arr) a) <> need then raise exception 'TAGS_DUPLICATE:level %', lv; end if;
    foreach x in array arr loop
      if lv = 1 then
        if not exists (select 1 from public.tags where level = 1 and slug = x) then
          raise exception 'TAGS_BAD_TOPIC:%', x;
        end if;
      else
        if char_length(x) not between 1 and 15 or x !~ '^[a-z0-9][a-z0-9 +#.-]*$' or x like '%http%' or x like '%www.%' then
          raise exception 'TAGS_BAD_TEXT:%', x;
        end if;
      end if;
    end loop;
  end loop;

  delete from public.skill_tags where skill_id = p_skill;

  for lv in 1..3 loop
    select array_agg(public.norm_tag(v)) into arr
      from jsonb_array_elements_text(p_tags -> ('t' || lv)) as v;
    foreach x in array arr loop
      if lv = 1 then
        select id into tid from public.tags where level = 1 and slug = x;
      else
        insert into public.tags (level, slug, label, is_preset, last_used_at)
        values (lv, x, x, false, case when p_touch then now() end)
        on conflict (level, slug) do update
          set last_used_at = case when p_touch then now() else public.tags.last_used_at end
        returning id into tid;
      end if;
      insert into public.skill_tags (skill_id, tag_id, level) values (p_skill, tid, lv);
      affected := affected || tid;
    end loop;
  end loop;

  update public.tags t
     set uses_count = (select count(*) from public.skill_tags st where st.tag_id = t.id)
   where t.id = any (affected || old_ids);
end;
$$;

-- tag lists for the pickers: presets always, custom ones for 5 days (120 h) after last use
create function public.tag_picker(p_level int, p_q text default '')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare q text := public.norm_tag(p_q);
begin
  perform public.me();
  return coalesce((
    select jsonb_agg(jsonb_build_object('slug', slug, 'label', label, 'preset', is_preset) order by is_preset desc, uses_count desc, slug)
      from (
        select slug, label, is_preset, uses_count from public.tags
         where level = p_level
           and (is_preset or last_used_at > now() - make_interval(hours => public.s_int('custom_tag_visible_hours', 120)))
           and (q = '' or slug like replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
         order by is_preset desc, uses_count desc, slug
         limit 40
      ) z
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. PUBLISH LIMIT (start 25, +5 per ladder step, plus invitee slots)
-- ---------------------------------------------------------------------
create function public.publish_limit(p_user uuid)
returns int language plpgsql stable security definer set search_path = ''
as $$
declare
  lim int := public.s_int('skill_start_limit', 25);
  cap int := public.s_int('skill_limit_cap', 150);
  stp int := public.s_int('ladder_step_size', 5);
  vps int := public.s_int('ladder_views_per_step', 100);
  fps int := public.s_int('ladder_followers_per_step', 10);
  k int := 1; fol int; minv bigint; cnt int; extra int;
begin
  select followers_count, extra_slots into fol, extra from public.profiles where id = p_user;
  select count(*), coalesce(min(views_total), 0) into cnt, minv
    from public.skills where owner_id = p_user and deleted_at is null and status = 'active';
  while lim < cap and cnt > 0 and minv >= vps * k and fol >= fps * k loop
    lim := least(lim + stp, cap);
    k := k + 1;
  end loop;
  return lim + coalesce(extra, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. SKILL CREATE / EDIT / DELETE
-- ---------------------------------------------------------------------
-- only the add-skill Edge Function (service role) can call this
create function public.create_skill(
  p_owner uuid, p_repo_id bigint, p_node_id text, p_gh_owner_id bigint, p_gh_owner_login text,
  p_repo_full_name text, p_repo_url text, p_is_fork boolean, p_pushed_at timestamptz,
  p_name text, p_short text, p_long text, p_tags jsonb, p_verified boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid uuid; cnt int;
begin
  perform public.writable();
  if not exists (select 1 from public.profiles where id = p_owner and gate_ok and not blocked) then
    raise exception 'ACCOUNT_NOT_READY';
  end if;
  select count(*) into cnt from public.skills
   where owner_id = p_owner and deleted_at is null and status in ('active','hidden','under_review');
  if cnt >= public.publish_limit(p_owner) then raise exception 'PUBLISH_LIMIT:%', public.publish_limit(p_owner); end if;
  if exists (select 1 from public.skills where github_repo_id = p_repo_id) then raise exception 'REPO_ALREADY_LISTED'; end if;

  insert into public.skills (owner_id, github_repo_id, github_node_id, github_owner_id, github_owner_login,
                             repo_full_name, repo_url, is_fork, repo_pushed_at, name, short_desc, long_desc,
                             verified, verified_at)
  values (p_owner, p_repo_id, p_node_id, p_gh_owner_id, p_gh_owner_login, p_repo_full_name, p_repo_url,
          p_is_fork, p_pushed_at, btrim(p_name), btrim(p_short), btrim(p_long),
          coalesce(p_verified, false), case when p_verified then now() end)
  returning id into sid;

  perform public.write_skill_tags(sid, p_tags, true);
  insert into public.skill_updates (skill_id, owner_id, kind) values (sid, p_owner, 'post');
  return sid;
end;
$$;

-- what image the person may upload (size in bytes, formats). Used by save-image.
create function public.image_rules(p_user uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'skill_max_bytes', case when p.master_tick then 10240 else 3072 end,
    'skill_png',       p.master_tick,
    'logo_max_bytes',  case when p.master_tick or p.blue_tick then 10240 else 3072 end,
    'logo_png',        (p.master_tick or p.blue_tick))
  from public.profiles p where p.id = p_user
$$;

create function public.skill_edit_days_left(p_skill uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select case when s.last_edited_at is null then 0
         else greatest(0, ceil(extract(epoch from
              (s.last_edited_at + make_interval(days => public.s_int('skill_edit_days', 10)) - now())) / 86400.0)::int)
         end
    from public.skills s where s.id = p_skill
$$;

-- the owner edits: short text, long text, tags, picture position (one edit per 10 days)
create function public.edit_skill(
  p_skill uuid, p_short text, p_long text, p_tags jsonb, p_zoom numeric, p_x int, p_y int)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); s public.skills; left_days int;
begin
  perform public.writable();
  select * into s from public.skills where id = p_skill and owner_id = u and deleted_at is null;
  if not found then raise exception 'NOT_YOUR_SKILL'; end if;
  left_days := public.skill_edit_days_left(p_skill);
  if left_days > 0 then raise exception 'EDIT_LOCKED:%', left_days; end if;

  update public.skills
     set short_desc = coalesce(btrim(p_short), short_desc),
         long_desc  = coalesce(btrim(p_long), long_desc),
         image_zoom = coalesce(p_zoom, image_zoom),
         image_x    = coalesce(p_x, image_x),
         image_y    = coalesce(p_y, image_y),
         last_edited_at = now()
   where id = p_skill;
  if p_tags is not null then perform public.write_skill_tags(p_skill, p_tags, false); end if;
  insert into public.skill_updates (skill_id, owner_id, kind) values (p_skill, u, 'edit')
  on conflict (skill_id, kind, event_day) do nothing;
end;
$$;

-- save-image (service role) calls this after it checked and stored a skill picture
create function public.apply_skill_image(p_skill uuid, p_user uuid, p_path text, p_is_new boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare left_days int;
begin
  if not exists (select 1 from public.skills where id = p_skill and owner_id = p_user and deleted_at is null) then
    raise exception 'NOT_YOUR_SKILL';
  end if;
  if not p_is_new then
    left_days := public.skill_edit_days_left(p_skill);
    if left_days > 0 then raise exception 'EDIT_LOCKED:%', left_days; end if;
    update public.skills set image_path = p_path, last_edited_at = now() where id = p_skill;
    insert into public.skill_updates (skill_id, owner_id, kind) values (p_skill, p_user, 'edit')
    on conflict (skill_id, kind, event_day) do nothing;
  else
    update public.skills set image_path = p_path where id = p_skill;
  end if;
end;
$$;

create function public.apply_logo(p_user uuid, p_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare last_edit timestamptz; wait int := public.s_int('profile_edit_days', 30);
begin
  select last_profile_edit into last_edit from public.profiles where id = p_user;
  if last_edit is not null and last_edit + make_interval(days => wait) > now() then
    raise exception 'EDIT_LOCKED:%', ceil(extract(epoch from (last_edit + make_interval(days => wait) - now())) / 86400.0)::int;
  end if;
  update public.profiles set logo_path = p_path, last_profile_edit = now() where id = p_user;
end;
$$;

create function public.delete_skill(p_skill uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  perform public.writable();
  update public.skills set deleted_at = now() where id = p_skill and owner_id = u and deleted_at is null;
  if not found then raise exception 'NOT_YOUR_SKILL'; end if;
end;
$$;

create function public.restore_skill(p_skill uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  perform public.writable();
  update public.skills set deleted_at = null
   where id = p_skill and owner_id = u and deleted_at is not null
     and deleted_at > now() - make_interval(hours => public.s_int('delete_undo_hours', 12));
  if not found then raise exception 'UNDO_EXPIRED'; end if;
end;
$$;

-- a developer announces "new version" (second kind of update)
create function public.announce_update(p_skill uuid, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  perform public.writable();
  if not exists (select 1 from public.skills where id = p_skill and owner_id = u and deleted_at is null) then
    raise exception 'NOT_YOUR_SKILL';
  end if;
  insert into public.skill_updates (skill_id, owner_id, kind, note)
  values (p_skill, u, 'update', left(btrim(p_note), 140))
  on conflict (skill_id, kind, event_day) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. PROFILE: edit (30 days), country (90 days), 3-month gate, invites
-- ---------------------------------------------------------------------
create function public.update_my_profile(
  p_name text, p_bio text, p_self_tags text[], p_zoom numeric, p_x int, p_y int)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); last_edit timestamptz; wait int := public.s_int('profile_edit_days', 30);
        tags text[]; x text;
begin
  perform public.writable();
  select last_profile_edit into last_edit from public.profiles where id = u;
  if last_edit is not null and last_edit + make_interval(days => wait) > now() then
    raise exception 'EDIT_LOCKED:%', ceil(extract(epoch from (last_edit + make_interval(days => wait) - now())) / 86400.0)::int;
  end if;
  if p_self_tags is not null then
    select coalesce(array_agg(distinct public.norm_tag(v)), '{}') into tags from unnest(p_self_tags) v;
    if cardinality(tags) > 5 then raise exception 'TOO_MANY_TAGS'; end if;
    foreach x in array tags loop
      if char_length(x) not between 1 and 15 or x !~ '^[a-z0-9][a-z0-9 +#.-]*$' then raise exception 'TAGS_BAD_TEXT:%', x; end if;
    end loop;
  end if;
  update public.profiles
     set display_name = coalesce(btrim(p_name), display_name),
         bio          = case when p_bio is null then bio else btrim(p_bio) end,
         self_tags    = coalesce(tags, self_tags),
         logo_zoom    = coalesce(p_zoom, logo_zoom),
         logo_x       = coalesce(p_x, logo_x),
         logo_y       = coalesce(p_y, logo_y),
         last_profile_edit = now()
   where id = u;
end;
$$;

-- privacy switch (no waiting time)
create function public.set_hide_public(p_hide boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  perform public.writable();
  update public.profiles set hide_public = coalesce(p_hide, false) where id = u;
end;
$$;

-- service role only: the Cloudflare/Edge check says "this IP is really in country X"
create function public.set_country(p_user uuid, p_country text)
returns void language plpgsql security definer set search_path = ''
as $$
declare cur char(2); at timestamptz; wait int := public.s_int('country_change_days', 90);
begin
  p_country := upper(btrim(p_country));
  if p_country !~ '^[A-Z]{2}$' then raise exception 'BAD_COUNTRY'; end if;
  select country, country_set_at into cur, at from public.profiles where id = p_user;
  if cur is not null and cur = p_country then return; end if;
  if cur is not null and at + make_interval(days => wait) > now() then
    raise exception 'COUNTRY_LOCKED:%', ceil(extract(epoch from (at + make_interval(days => wait) - now())) / 86400.0)::int;
  end if;
  update public.profiles set country = p_country, country_set_at = now() where id = p_user;
end;
$$;

-- service role only: after login the account-gate function reads the real GitHub account age
create function public.gate_pass(p_user uuid, p_github_created_at timestamptz)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare need int := public.s_int('min_github_age_days', 90); days_old int; ok boolean; gid bigint;
begin
  days_old := floor(extract(epoch from (now() - p_github_created_at)) / 86400)::int;
  ok := days_old >= need;
  select github_id into gid from public.profiles where id = p_user;
  if gid is not null and exists (select 1 from public.blocked_accounts where github_id = gid) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  update public.profiles set github_created_at = p_github_created_at, gate_ok = ok where id = p_user;
  return jsonb_build_object('ok', ok, 'days_old', days_old, 'needed', need);
end;
$$;

create function public.redeem_invite(p_code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); inv uuid;
begin
  perform public.writable();
  if (select invite_prompt_done from public.profiles where id = u) then raise exception 'INVITE_ALREADY_HANDLED'; end if;
  select id into inv from public.profiles where invite_code = upper(btrim(p_code)) and not blocked;
  if inv is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if inv = u then raise exception 'INVITE_SELF'; end if;
  insert into public.invites (invitee_id, inviter_id) values (u, inv) on conflict do nothing;
  update public.profiles set invited_by = inv, invite_prompt_done = true where id = u;
end;
$$;

create function public.skip_invite_prompt()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  update public.profiles set invite_prompt_done = true where id = u;
end;
$$;

create function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); gid bigint;
begin
  if u is null then raise exception 'LOGIN_REQUIRED'; end if;
  select github_id into gid from public.profiles where id = u;
  insert into public.removed_records (github_id, kind, ref) values (gid, 'account_deleted', u::text);
  delete from auth.users where id = u;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. JSON BUILDERS (the only shapes the website ever receives)
--    A skill card never contains the link or the country.
-- ---------------------------------------------------------------------
create function public.display_badges(p_user uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with best_weekly as (
    select ub.badge_key
      from public.user_badges ub join public.badge_definitions bd on bd.key = ub.badge_key
     where ub.user_id = p_user and ub.revoked_at is null and bd.is_weekly
     order by bd.band asc limit 1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', bd.key, 'name', bd.name, 'tier', bd.tier, 'weekly', bd.is_weekly,
           'earned_at', ub.earned_at, 'reason', ub.reason)
           order by ub.earned_at desc), '[]'::jsonb)
    from public.user_badges ub
    join public.badge_definitions bd on bd.key = ub.badge_key and bd.active
   where ub.user_id = p_user and ub.revoked_at is null
     and (not bd.is_weekly or ub.badge_key = (select badge_key from best_weekly))
$$;

create function public.skill_json(p_id uuid, p_detail boolean)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare s public.skills; p public.profiles; j jsonb; tg jsonb;
begin
  select * into s from public.skills where id = p_id;
  if not found then return null; end if;
  select * into p from public.profiles where id = s.owner_id;
  j := jsonb_build_object(
    'id', s.id, 'name', s.name, 'short_desc', s.short_desc,
    'image', jsonb_build_object('path', s.image_path, 'zoom', s.image_zoom, 'x', s.image_x, 'y', s.image_y),
    'views', s.views_total, 'stars', s.star_count, 'comments', s.comment_count,
    'verified', s.verified, 'created_at', s.created_at, 'updated_at', s.updated_at,
    'developer', jsonb_build_object(
        'username', p.github_username, 'name', p.display_name,
        'logo', jsonb_build_object('path', p.logo_path, 'zoom', p.logo_zoom, 'x', p.logo_x, 'y', p.logo_y)));
  if p_detail then
    select jsonb_build_object(
             't1', coalesce(jsonb_agg(t.label order by t.label) filter (where st.level = 1), '[]'::jsonb),
             't2', coalesce(jsonb_agg(t.label order by t.label) filter (where st.level = 2), '[]'::jsonb),
             't3', coalesce(jsonb_agg(t.label order by t.label) filter (where st.level = 3), '[]'::jsonb))
      into tg
      from public.skill_tags st join public.tags t on t.id = st.tag_id where st.skill_id = s.id;
    j := j || jsonb_build_object('long_desc', s.long_desc, 'tags', tg);
  end if;
  return j;
end;
$$;

-- a developer page. Never contains country, email, GitHub id.
create function public.developer_json(p public.profiles, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare cards jsonb; tick text;
begin
  select coalesce(jsonb_agg(public.skill_json(s.id, false) order by s.popularity desc, s.created_at desc), '[]'::jsonb)
    into cards
    from public.skills s
   where s.owner_id = p.id and s.status = 'active' and s.deleted_at is null;
  tick := case when p.master_tick then 'tick-master-gold' when p.blue_tick then 'tick-blue' end;
  return jsonb_build_object(
    'username', p.github_username, 'name', p.display_name, 'bio', p.bio, 'self_tags', to_jsonb(p.self_tags),
    'logo', jsonb_build_object('path', p.logo_path, 'zoom', p.logo_zoom, 'x', p.logo_x, 'y', p.logo_y),
    'followers', p.followers_count, 'following', p.following_count, 'skills_count', p.skills_count,
    'tick', tick, 'badges', public.display_badges(p.id), 'skills', cards,
    'is_me', (p_viewer is not null and p_viewer = p.id),
    'is_following', (p_viewer is not null and exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p.id)));
end;
$$;

-- ---------------------------------------------------------------------
-- 9. SEARCH (3 levels of tags, name, short text) with the 50 / 30 / 20 mix
-- ---------------------------------------------------------------------
create function public.core_search(p_q text, p_page int, p_public boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  q text := public.norm_tag(p_q);
  lq text;
  lim int := 20; hq int := 10; mq int := 6; lq_n int := 4;
  pg int := greatest(coalesce(p_page, 0), 0);
  res jsonb;
begin
  lq := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');

  -- remember what was searched (only signed-in people, only the first page)
  if pg = 0 and q <> '' and auth.uid() is not null then
    insert into public.tag_search_buckets (tag_id, bucket, n)
    select t.id, date_bin('6 hours', now(), timestamptz '2026-01-01'), 1
      from public.tags t where t.slug = q
    on conflict (tag_id, bucket) do update set n = public.tag_search_buckets.n + 1;
  end if;

  with matched as (
    select s.*,
           exists (select 1 from public.skill_tags st join public.tags t on t.id = st.tag_id
                    where st.skill_id = s.id and t.slug = q) as tag_hit
      from public.skills s
      join public.profiles p on p.id = s.owner_id
     where s.status = 'active' and s.deleted_at is null and p.gate_ok and not p.blocked
       and (not p_public or not p.hide_public)
       and (q = ''
            or s.name ilike '%' || lq || '%'
            or s.short_desc ilike '%' || lq || '%'
            or exists (select 1 from public.skill_tags st join public.tags t on t.id = st.tag_id
                        where st.skill_id = s.id and t.slug = q))
  ), tiered as (
    select m.*, case when m.created_at > now() - interval '7 days' then 2 else m.strength_tier end as et
      from matched m
  ), ranked as (
    select t.*, row_number() over (partition by t.et order by t.tag_hit desc, t.popularity desc, t.created_at desc) as rn
      from tiered t
  )
  select coalesce(jsonb_agg(public.skill_json(r.id, false) order by r.rn, r.et desc), '[]'::jsonb)
    into res
    from (
      select * from ranked
       where (et = 3 and rn >  pg * hq   and rn <= (pg + 1) * hq)
          or (et = 2 and rn >  pg * mq   and rn <= (pg + 1) * mq)
          or (et = 1 and rn >  pg * lq_n and rn <= (pg + 1) * lq_n)
    ) r;
  return res;
end;
$$;

-- "@name" = find a developer (exact username). Otherwise skills by name or tag.
create function public.search_all(p_q text, p_page int default 0, p_public boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare q text := btrim(coalesce(p_q, '')); p public.profiles; viewer uuid := auth.uid();
begin
  if left(q, 1) = '@' then
    select * into p from public.profiles
     where lower(github_username) = lower(btrim(substr(q, 2)))
       and gate_ok and not blocked and (not p_public or not hide_public);
    if not found then return jsonb_build_object('kind', 'developer', 'developer', null); end if;
    return jsonb_build_object('kind', 'developer', 'developer', public.developer_json(p, viewer));
  end if;
  return jsonb_build_object('kind', 'skills', 'items', public.core_search(q, p_page, p_public));
end;
$$;

-- signed-in version
create function public.search_app(p_q text, p_page int default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform public.me();
  return public.search_all(p_q, p_page, false);
end;
$$;

-- logged-out version (no download link, no country, no comments, hidden profiles removed)
create function public.public_search(p_q text, p_page int default 0)
returns jsonb language sql security definer set search_path = ''
as $$ select public.search_all(p_q, p_page, true) $$;

create function public.public_skill(p_skill uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare s public.skills;
begin
  select s2.* into s from public.skills s2 join public.profiles p on p.id = s2.owner_id
   where s2.id = p_skill and s2.status = 'active' and s2.deleted_at is null and not p.hide_public and p.gate_ok and not p.blocked;
  if not found then return null; end if;
  return public.skill_json(s.id, true);
end;
$$;

create function public.public_developer(p_username text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.profiles;
begin
  select * into p from public.profiles
   where lower(github_username) = lower(btrim(p_username)) and gate_ok and not blocked and not hide_public;
  if not found then return null; end if;
  return public.developer_json(p, null);
end;
$$;

-- the strip of 20 trending tags: detail-level tags searched most in the last 6-12 hours
create function public.trending_tags()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare n int := public.s_int('trending_tags_count', 20); res jsonb;
begin
  with recent as (
    select b.tag_id, sum(b.n) as hits from public.tag_search_buckets b
     where b.bucket >= date_bin('6 hours', now(), timestamptz '2026-01-01') - interval '6 hours'
     group by b.tag_id),
  visible as (
    select t.id, t.slug, t.label, coalesce(r.hits, 0) as hits, t.uses_count
      from public.tags t left join recent r on r.tag_id = t.id
     where t.level = 3
       and (t.is_preset or t.last_used_at > now() - make_interval(hours => public.s_int('custom_tag_visible_hours', 120)))
       and t.uses_count > 0)
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'label', label) order by hits desc, uses_count desc, slug), '[]'::jsonb)
    into res
    from (select * from visible order by hits desc, uses_count desc, slug limit n) z;
  return res;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. "FOR YOU" FEED: 35 interest, 25 followed developer, 20 popularity, 10 freshness, 10 quality+variety
-- ---------------------------------------------------------------------
create function public.for_you_feed(p_page int default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); sc jsonb; maxpop numeric; res jsonb; pg int := greatest(coalesce(p_page, 0), 0);
begin
  select coalesce(scores, '{}'::jsonb) into sc from public.user_interests where user_id = u;
  sc := coalesce(sc, '{}'::jsonb);
  select greatest(max(popularity), 1) into maxpop from public.skills where status = 'active' and deleted_at is null;

  select coalesce(jsonb_agg(public.skill_json(x.id, false) order by x.score desc), '[]'::jsonb) into res
  from (
    select s.*,
      0.35 * least(1, coalesce((select sum(coalesce((sc ->> t.slug)::numeric, 0))
                                  from public.skill_tags st join public.tags t on t.id = st.tag_id
                                 where st.skill_id = s.id and t.level = 1), 0) / 100.0)
    + 0.25 * (case when exists (select 1 from public.follows f where f.follower_id = u and f.following_id = s.owner_id) then 1 else 0 end)
    + 0.20 * (s.popularity::numeric / maxpop)
    + 0.10 * power(0.5, extract(epoch from (now() - s.created_at)) / 86400.0 / 14.0)
    + 0.10 * (0.5 * least(1, s.star_count::numeric / greatest(s.views_total, 1) * 10)
            + 0.5 * ((abs(hashtext(s.id::text || current_date::text)) % 1000) / 1000.0)) as score
      from public.skills s
      join public.profiles p on p.id = s.owner_id
     where s.status = 'active' and s.deleted_at is null and p.gate_ok and not p.blocked
       and s.owner_id is distinct from u
     order by score desc
     limit 20 offset pg * 20
  ) x;
  return res;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. VIEWS, DOWNLOADS, STARS, FOLLOWS
-- ---------------------------------------------------------------------
-- called when the big card is opened. One view per person per skill per 6 hours.
create function public.record_view(p_skill uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := public.me(); s public.skills; c char(2); counted int; age_min numeric;
begin
  perform public.writable();
  select * into s from public.skills where id = p_skill and status = 'active' and deleted_at is null;
  if not found or s.owner_id = u then return false; end if;

  insert into public.skill_views_recent as v (user_id, skill_id, viewed_at) values (u, p_skill, now())
  on conflict (user_id, skill_id) do update set viewed_at = now()
    where v.viewed_at < now() - make_interval(hours => public.s_int('view_repeat_hours', 6));
  get diagnostics counted = row_count;
  if counted = 0 then return false; end if;

  update public.skills set views_total = views_total + 1 where id = p_skill;
  update public.profiles set total_views = total_views + 1 where id = s.owner_id;
  insert into public.skill_daily_stats (skill_id, day, views) values (p_skill, current_date, 1)
  on conflict (skill_id, day) do update set views = public.skill_daily_stats.views + 1;

  select country into c from public.profiles where id = u;
  if c is not null then
    insert into public.skill_country_views (skill_id, country, n) values (p_skill, c, 1)
    on conflict (skill_id, country) do update set n = public.skill_country_views.n + 1;
  end if;

  age_min := extract(epoch from (now() - s.created_at)) / 60.0;
  if age_min <= 168 * 60 then
    insert into public.skill_early_views (skill_id, v60, v24h, v72h, v168h)
    values (p_skill,
            (age_min <= 60)::int, (age_min <= 24 * 60)::int, (age_min <= 72 * 60)::int, 1)
    on conflict (skill_id) do update set
      v60   = public.skill_early_views.v60   + (age_min <= 60)::int,
      v24h  = public.skill_early_views.v24h  + (age_min <= 24 * 60)::int,
      v72h  = public.skill_early_views.v72h  + (age_min <= 72 * 60)::int,
      v168h = public.skill_early_views.v168h + 1;
  end if;

  perform public.bump_skill_topics(u, p_skill, 1);
  return true;
end;
$$;

-- the ONLY place a download link leaves the database
create function public.get_download_link(p_skill uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); url text; own uuid;
begin
  perform public.writable();
  select repo_url, owner_id into url, own from public.skills
   where id = p_skill and status = 'active' and deleted_at is null;
  if url is null then raise exception 'SKILL_NOT_FOUND'; end if;
  update public.skills set downloads_total = downloads_total + 1 where id = p_skill;
  insert into public.skill_daily_stats (skill_id, day, downloads) values (p_skill, current_date, 1)
  on conflict (skill_id, day) do update set downloads = public.skill_daily_stats.downloads + 1;
  if own is distinct from u then perform public.bump_skill_topics(u, p_skill, 3); end if;
  return url;
end;
$$;

create function public.toggle_star(p_skill uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); own uuid; now_starred boolean; n int;
begin
  perform public.writable();
  select owner_id into own from public.skills where id = p_skill and status = 'active' and deleted_at is null;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  if own = u then raise exception 'CANNOT_STAR_OWN'; end if;

  delete from public.stars where user_id = u and skill_id = p_skill;
  if found then
    now_starred := false;
    perform public.bump_skill_topics(u, p_skill, -4);
  else
    if (select count(*) from public.stars where user_id = u) >= public.s_int('star_limit', 300) then
      raise exception 'STAR_LIMIT';
    end if;
    insert into public.stars (user_id, skill_id) values (u, p_skill);
    now_starred := true;
    perform public.bump_skill_topics(u, p_skill, 4);
  end if;
  select star_count into n from public.skills where id = p_skill;
  return jsonb_build_object('starred', now_starred, 'stars', n);
end;
$$;

create function public.toggle_follow(p_dev uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); now_following boolean; n int; r record;
begin
  perform public.writable();
  if p_dev = u then raise exception 'CANNOT_FOLLOW_SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_dev and gate_ok and not blocked) then
    raise exception 'DEVELOPER_NOT_FOUND';
  end if;

  delete from public.follows where follower_id = u and following_id = p_dev;
  if found then
    now_following := false;
  else
    if (select count(*) from public.follows where follower_id = u) >= public.s_int('follow_limit', 200) then
      raise exception 'FOLLOW_LIMIT';
    end if;
    insert into public.follows (follower_id, following_id) values (u, p_dev);
    now_following := true;
    for r in select t.slug
               from public.skills s join public.skill_tags st on st.skill_id = s.id
               join public.tags t on t.id = st.tag_id and t.level = 1
              where s.owner_id = p_dev and s.deleted_at is null
              group by t.slug order by count(*) desc limit 3
    loop
      perform public.bump_interest(u, r.slug, 2);
    end loop;
  end if;
  select followers_count into n from public.profiles where id = p_dev;
  return jsonb_build_object('following', now_following, 'followers', n);
end;
$$;

-- ---------------------------------------------------------------------
-- 12. UPDATES PAGE AND BLUE DOTS
-- ---------------------------------------------------------------------
create function public.my_following()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'username', p.github_username, 'name', p.display_name, 'dev_id', p.id,
             'logo', jsonb_build_object('path', p.logo_path, 'zoom', p.logo_zoom, 'x', p.logo_x, 'y', p.logo_y),
             'unseen', exists (select 1 from public.skill_updates su
                                where su.owner_id = p.id and su.created_at > f.last_seen_at))
             order by (select max(created_at) from public.skill_updates su where su.owner_id = p.id) desc nulls last)
      from public.follows f join public.profiles p on p.id = f.following_id
     where f.follower_id = u), '[]'::jsonb);
end;
$$;

create function public.my_updates_feed(p_limit int default 30, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return coalesce((
    select jsonb_agg(row_to_json(z)::jsonb order by z.created_at desc) from (
      select su.id, su.kind, su.note, su.created_at,
             s.id as skill_id, s.name as skill_name,
             p.github_username as username, p.display_name as dev_name, p.id as dev_id,
             (su.created_at > f.last_seen_at) as unseen
        from public.follows f
        join public.skill_updates su on su.owner_id = f.following_id
        join public.skills s on s.id = su.skill_id and s.status = 'active' and s.deleted_at is null
        join public.profiles p on p.id = su.owner_id
       where f.follower_id = u and (p_before is null or su.created_at < p_before)
       order by su.created_at desc
       limit least(greatest(p_limit, 1), 100)
    ) z), '[]'::jsonb);
end;
$$;

create function public.mark_developer_seen(p_dev uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  update public.follows set last_seen_at = now() where follower_id = u and following_id = p_dev;
end;
$$;

create function public.mark_all_seen()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  update public.follows set last_seen_at = now() where follower_id = u;
end;
$$;

create function public.unread_updates_count()
returns int language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return (select count(*)::int from public.follows f
           where f.follower_id = u
             and exists (select 1 from public.skill_updates su
                          where su.owner_id = f.following_id and su.created_at > f.last_seen_at));
end;
$$;

-- ---------------------------------------------------------------------
-- 13. PAGES FOR "ME" AND THE LANDING PAGE
-- ---------------------------------------------------------------------
create function public.me_state()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  u uuid := auth.uid(); p public.profiles; wait_c int := public.s_int('country_change_days', 90);
  wait_p int := public.s_int('profile_edit_days', 30);
begin
  if u is null then return null; end if;
  select * into p from public.profiles where id = u;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', p.id, 'username', p.github_username, 'name', p.display_name, 'bio', p.bio, 'self_tags', to_jsonb(p.self_tags),
    'logo', jsonb_build_object('path', p.logo_path, 'zoom', p.logo_zoom, 'x', p.logo_x, 'y', p.logo_y),
    'gate_ok', p.gate_ok, 'blocked', p.blocked, 'country', p.country, 'hide_public', p.hide_public,
    'country_days_left', case when p.country_set_at is null then 0
        else greatest(0, ceil(extract(epoch from (p.country_set_at + make_interval(days => wait_c) - now())) / 86400.0)::int) end,
    'profile_days_left', case when p.last_profile_edit is null then 0
        else greatest(0, ceil(extract(epoch from (p.last_profile_edit + make_interval(days => wait_p) - now())) / 86400.0)::int) end,
    'followers', p.followers_count, 'following', p.following_count, 'skills_count', p.skills_count,
    'publish_limit', case when p.gate_ok then public.publish_limit(p.id) end,
    'invite_code', p.invite_code, 'invite_prompt_done', p.invite_prompt_done,
    'tick', case when p.master_tick then 'tick-master-gold' when p.blue_tick then 'tick-blue' end,
    'image_rules', public.image_rules(p.id),
    'is_admin', public.is_admin(), 'admin_can_write', public.is_admin_writer());
end;
$$;

create function public.my_skills()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return coalesce((
    select jsonb_agg(public.skill_json(s.id, true) || jsonb_build_object(
             'status', s.status, 'deleted_at', s.deleted_at,
             'edit_days_left', public.skill_edit_days_left(s.id),
             'downloads', s.downloads_total)
           order by s.created_at desc)
      from public.skills s where s.owner_id = u and (s.deleted_at is null or s.deleted_at > now() - interval '1 day')), '[]'::jsonb);
end;
$$;

create function public.skill_detail(p_skill uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me(); s public.skills;
begin
  select * into s from public.skills where id = p_skill and status = 'active' and deleted_at is null;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  return public.skill_json(s.id, true) || jsonb_build_object(
    'starred', exists (select 1 from public.stars where user_id = u and skill_id = p_skill),
    'mine', s.owner_id = u);
end;
$$;

create function public.get_developer(p_username text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me(); p public.profiles;
begin
  select * into p from public.profiles where lower(github_username) = lower(btrim(p_username)) and gate_ok and not blocked;
  if not found then return null; end if;
  return public.developer_json(p, u);
end;
$$;

create function public.public_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'signup_paused', public.s_bool('signup_paused', false),
    'read_only',     public.s_bool('read_only_mode', false),
    'show_real_counts', public.s_bool('show_real_counts', true))
$$;

-- landing page numbers (real counts only if you allow it in the admin panel)
create function public.public_stats()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.s_bool('show_real_counts', true) then
    return jsonb_build_object('real', false);
  end if;
  return jsonb_build_object(
    'real', true,
    'skills', (select count(*) from public.skills where status = 'active' and deleted_at is null),
    'developers', (select count(distinct owner_id) from public.skills where status = 'active' and deleted_at is null),
    'members', (select count(*) from public.profiles where gate_ok and not blocked));
end;
$$;

-- ---------------------------------------------------------------------
-- 14. WHO MAY CALL WHAT
-- ---------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

-- open to everybody (logged out too): the safe public window
grant execute on function
  public.public_search(text, int), public.public_skill(uuid), public.public_developer(text),
  public.public_settings(), public.public_stats(), public.trending_tags()
  to anon, authenticated;

-- signed-in people
grant execute on function
  public.is_admin(), public.is_admin_writer(), public.me_state(), public.my_skills(), public.skill_detail(uuid),
  public.get_developer(text), public.search_app(text, int), public.for_you_feed(int),
  public.tag_picker(int, text), public.edit_skill(uuid, text, text, jsonb, numeric, int, int),
  public.delete_skill(uuid), public.restore_skill(uuid), public.announce_update(uuid, text),
  public.update_my_profile(text, text, text[], numeric, int, int), public.set_hide_public(boolean),
  public.redeem_invite(text), public.skip_invite_prompt(), public.delete_my_account(),
  public.record_view(uuid), public.get_download_link(uuid), public.toggle_star(uuid), public.toggle_follow(uuid),
  public.my_following(), public.my_updates_feed(int, timestamptz), public.mark_developer_seen(uuid),
  public.mark_all_seen(), public.unread_updates_count(), public.set_interests(text[]), public.clear_interests()
  to authenticated;

-- Edge Functions only (service role). Nobody in a browser can call these.
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- 15. REPAIR: people who already signed in before (their login account exists,
--     but file 1 rebuilt the profile table). Give each a fresh profile.
--     (Runs on every execution, does nothing when nothing is missing.)
-- ---------------------------------------------------------------------
do $$
declare r record; gid bigint; uname text; dname text; code text;
begin
  for r in select u.id, u.raw_user_meta_data as m from auth.users u
            where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    begin
      gid := coalesce(r.m ->> 'provider_id', r.m ->> 'sub')::bigint;
    exception when others then gid := null;
    end;
    uname := coalesce(r.m ->> 'user_name', r.m ->> 'preferred_username');
    dname := left(btrim(coalesce(r.m ->> 'full_name', r.m ->> 'name', uname, '')), 30);
    if char_length(dname) < 2 then dname := left(coalesce(nullif(uname, ''), 'developer'), 30); end if;
    if char_length(dname) < 2 then dname := 'developer'; end if;
    code := upper(substr(md5(random()::text || clock_timestamp()::text || r.id::text), 1, 10));
    insert into public.profiles (id, github_id, github_username, display_name, avatar_url, invite_code)
    values (r.id, gid, uname, dname, r.m ->> 'avatar_url', code)
    on conflict do nothing;
  end loop;
end
$$;

-- Done. Next: skilltube-sql-3-community.sql (comments, reports, badges, admin, scheduled jobs).
