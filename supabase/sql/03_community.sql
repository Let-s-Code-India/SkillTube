-- =====================================================================
-- SkillTube | SQL 3 of 4 : comments, reports and notices, admin panel functions
--
-- Run this AFTER skilltube-sql-2-functions.sql finished with "Success".
-- Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Expected answer: "Success. No rows returned"
-- (Safe to run again: it only replaces functions.)
-- =====================================================================

-- two small additions to the profile table
alter table public.profiles add column if not exists alerts_seen_at timestamptz not null default now();
alter table public.profiles add column if not exists last_seen_touch timestamptz;

-- ---------------------------------------------------------------------
-- 1. SMALL HELPERS
-- ---------------------------------------------------------------------
create or replace function public.admin_only(p_write boolean default false)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_write then
    if not exists (select 1 from public.admins where user_id = u and role in ('owner','admin')) then
      raise exception 'NOT_ADMIN_WRITER';
    end if;
  else
    if not exists (select 1 from public.admins where user_id = u) then raise exception 'NOT_ADMIN'; end if;
  end if;
  return u;
end;
$$;

create or replace function public.audit(p_actor uuid, p_action text, p_target text, p_detail jsonb default null)
returns void language sql security definer set search_path = ''
as $$ insert into public.audit_log (actor, action, target, detail) values (p_actor, p_action, p_target, p_detail) $$;

-- the app calls this when it opens (at most once per hour per person): drives "monthly active" numbers
create or replace function public.touch_seen()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if u is null then return; end if;
  update public.profiles set last_seen_at = now(), last_seen_touch = now()
   where id = u and (last_seen_touch is null or last_seen_touch < now() - interval '1 hour');
end;
$$;

-- ---------------------------------------------------------------------
-- 2. COMMENTS
-- ---------------------------------------------------------------------
create or replace function public.comments_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid uuid := coalesce(new.skill_id, old.skill_id);
begin
  update public.skills s
     set comment_count = (select count(*) from public.comments c where c.skill_id = sid and not c.hidden and c.parent_id is null)
   where s.id = sid;
  return null;
end;
$$;
drop trigger if exists comments_sync_trg on public.comments;
create trigger comments_sync_trg after insert or delete or update of hidden on public.comments
  for each row execute function public.comments_sync();

create or replace function public.add_comment(p_skill uuid, p_body text, p_parent uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := public.me(); body text := btrim(coalesce(p_body, '')); cid uuid; par public.comments;
  is_reply boolean := p_parent is not null; cap int := public.s_int('comment_daily_total', 30);
  maxlen int;
begin
  maxlen := case when p_parent is not null then 100 else 200 end;
  perform public.writable();
  if not exists (select 1 from public.skills where id = p_skill and status = 'active' and deleted_at is null) then
    raise exception 'SKILL_NOT_FOUND';
  end if;
  if char_length(body) < 1 then raise exception 'COMMENT_EMPTY'; end if;
  if char_length(body) > maxlen then raise exception 'COMMENT_TOO_LONG:%', maxlen; end if;
  if body ~* '(https?:|www\.|\.[a-z]{2,6}/|@[a-z0-9_-]+\.[a-z]{2,})' then raise exception 'NO_LINKS'; end if;

  if is_reply then
    select * into par from public.comments where id = p_parent and skill_id = p_skill and parent_id is null and not hidden;
    if not found then raise exception 'PARENT_NOT_FOUND'; end if;
  end if;

  -- one comment and one reply per skill per rolling 24 hours
  if exists (select 1 from public.comments
              where author_id = u and skill_id = p_skill and (parent_id is not null) = is_reply
                and created_at > now() - interval '24 hours') then
    raise exception 'COMMENT_LIMIT_SKILL';
  end if;
  -- and a daily total
  if (select count(*) from public.comments
       where author_id = u and (parent_id is not null) = is_reply and created_at > now() - interval '24 hours') >= cap then
    raise exception 'COMMENT_LIMIT_DAY';
  end if;

  insert into public.comments (skill_id, author_id, parent_id, body) values (p_skill, u, p_parent, body)
  returning id into cid;
  return cid;
end;
$$;

-- visible = not hidden and (pinned or younger than 5 days). The skill owner also sees hidden ones.
create or replace function public.list_comments(p_skill uuid, p_page int default 0)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  u uuid := public.me(); life int := public.s_int('comment_life_hours', 120);
  own uuid; pg int := greatest(coalesce(p_page, 0), 0);
begin
  select owner_id into own from public.skills where id = p_skill and status = 'active' and deleted_at is null;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'parent_id', c.parent_id, 'body', c.body, 'pinned', c.pinned, 'hidden', c.hidden,
             'created_at', c.created_at, 'mine', c.author_id = u,
             'expires_at', case when c.pinned then null else c.created_at + make_interval(hours => life) end,
             'author', jsonb_build_object('username', p.github_username, 'name', p.display_name,
                'logo', jsonb_build_object('path', p.logo_path, 'zoom', p.logo_zoom, 'x', p.logo_x, 'y', p.logo_y)))
           order by c.parent_id nulls first, c.pinned desc, c.created_at desc)
      from (
        select c1.* from public.comments c1
         where c1.skill_id = p_skill
           and (own = u or not c1.hidden)
           and (c1.pinned or c1.created_at > now() - make_interval(hours => life))
           and (c1.parent_id is null or exists (
                 select 1 from public.comments pc where pc.id = c1.parent_id
                    and (pc.pinned or pc.created_at > now() - make_interval(hours => life))))
         order by c1.pinned desc, c1.created_at desc
         limit 100 offset pg * 100
      ) c join public.profiles p on p.id = c.author_id), '[]'::jsonb);
end;
$$;

-- skill owner: pin / unpin / hide / unhide / delete. Anyone: delete their own comment.
create or replace function public.comment_action(p_comment uuid, p_action text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); c public.comments; own uuid;
begin
  perform public.writable();
  select * into c from public.comments where id = p_comment;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
  select owner_id into own from public.skills where id = c.skill_id;

  if p_action = 'delete_mine' then
    if c.author_id <> u then raise exception 'NOT_YOURS'; end if;
    delete from public.comments where id = p_comment;
    return;
  end if;

  if own is distinct from u then raise exception 'NOT_YOUR_SKILL'; end if;
  if p_action = 'pin' then
    if c.parent_id is not null then raise exception 'PIN_ONLY_COMMENTS'; end if;
    if (select count(*) from public.comments where skill_id = c.skill_id and pinned) >= public.s_int('comment_max_pins', 3) then
      raise exception 'PIN_LIMIT';
    end if;
    update public.comments set pinned = true where id = p_comment;
  elsif p_action = 'unpin' then update public.comments set pinned = false where id = p_comment;
  elsif p_action = 'hide' then update public.comments set hidden = true where id = p_comment;
  elsif p_action = 'unhide' then update public.comments set hidden = false where id = p_comment;
  elsif p_action = 'delete' then delete from public.comments where id = p_comment;
  else raise exception 'BAD_ACTION';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. REPORTS AND NOTICES
-- ---------------------------------------------------------------------
create or replace function public.file_report(p_skill uuid, p_channel uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); sr boolean; own uuid;
begin
  perform public.writable();
  if (p_skill is null) = (p_channel is null) then raise exception 'REPORT_ONE_TARGET'; end if;
  if p_reason not in ('malware','hacking_tool','illegal','violence_terror','copyright','spam_fake','other') then
    raise exception 'BAD_REASON';
  end if;
  if p_note is not null and char_length(p_note) > 150 then raise exception 'NOTE_TOO_LONG'; end if;

  if p_skill is not null then
    select owner_id into own from public.skills where id = p_skill and deleted_at is null and status in ('active','under_review');
    if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  else
    own := p_channel;
    if not exists (select 1 from public.profiles where id = p_channel and gate_ok and not blocked) then
      raise exception 'DEVELOPER_NOT_FOUND';
    end if;
  end if;
  if own = u then raise exception 'CANNOT_REPORT_OWN'; end if;

  if exists (select 1 from public.reports
              where reporter_id = u and created_at > now() - interval '24 hours'
                and ((p_skill is not null and skill_id = p_skill) or (p_channel is not null and channel_id = p_channel))) then
    raise exception 'REPORT_LIMIT_TARGET';
  end if;
  if (select count(*) from public.reports where reporter_id = u and created_at > now() - interval '24 hours')
       >= public.s_int('report_daily_total', 10) then
    raise exception 'REPORT_LIMIT_DAY';
  end if;

  sr := p_reason in ('malware','hacking_tool','illegal','violence_terror');
  insert into public.reports (skill_id, channel_id, reporter_id, reason, note, serious, respond_by)
  values (p_skill, p_channel, u, p_reason, nullif(btrim(p_note), ''), sr,
          now() + make_interval(days => public.s_int('report_answer_days', 10)));

  -- serious reports hide the skill at once (copyright never does: both sides can lie)
  if sr and p_skill is not null then
    update public.skills set status = 'under_review' where id = p_skill and status = 'active';
  end if;
end;
$$;

-- the developer sees what was reported, NOT who reported
create or replace function public.my_notices()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', case when r.skill_id is not null then 'skill' else 'channel' end,
      'skill_id', r.skill_id, 'skill_name', s.name, 'reason', r.reason, 'note', r.note, 'serious', r.serious,
      'status', r.status, 'created_at', r.created_at, 'respond_by', r.respond_by,
      'days_left', greatest(0, ceil(extract(epoch from (r.respond_by - now())) / 86400.0)::int),
      'dev_choice', r.dev_choice, 'dev_reply', r.dev_reply, 'dev_replied_at', r.dev_replied_at,
      'admin_decision', r.admin_decision, 'admin_note', r.admin_note,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_role, 'body', m.body, 'at', m.created_at) order by m.created_at)
                              from public.report_messages m where m.report_id = r.id), '[]'::jsonb))
      order by r.created_at desc)
      from public.reports r
      left join public.skills s on s.id = r.skill_id
     where (s.owner_id = u or r.channel_id = u)
       and r.created_at > now() - interval '90 days'), '[]'::jsonb);
end;
$$;

create or replace function public.dev_answer_report(p_report uuid, p_choice text, p_reply text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); r public.reports; own uuid; new_status text;
begin
  perform public.writable();
  select * into r from public.reports where id = p_report;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.skill_id is not null then select owner_id into own from public.skills where id = r.skill_id; else own := r.channel_id; end if;
  if own is distinct from u then raise exception 'NOT_YOURS'; end if;
  if r.status not in ('open','answered') then raise exception 'REPORT_CLOSED'; end if;
  if p_choice not in ('fixed','removed','disagree','fork_credit','report_false','need_info') then raise exception 'BAD_CHOICE'; end if;
  if p_reply is not null and char_length(p_reply) > 1500 then raise exception 'REPLY_TOO_LONG'; end if;

  -- accepting ends the case (for serious cases a "fixed" claim still needs the admin to look)
  new_status := case
    when p_choice = 'removed' then 'accepted'
    when p_choice in ('fixed','fork_credit') and not r.serious then 'accepted'
    else 'answered' end;

  update public.reports
     set dev_choice = p_choice, dev_reply = nullif(btrim(p_reply), ''), dev_replied_at = now(), status = new_status
   where id = p_report;

  if p_choice = 'removed' and r.skill_id is not null then
    -- self-removal after accepting a report: the picture goes, the badge it earned is revoked
    update public.skills set deleted_at = now(), status = 'hidden' where id = r.skill_id;
    update public.user_badges set revoked_at = now(), revoked_reason = 'removed after report'
     where source_skill_id = r.skill_id and revoked_at is null;
    insert into public.removed_records (github_id, kind, ref, reason)
    select p.github_id, 'skill_removed_by_owner', r.skill_id::text, r.reason from public.profiles p where p.id = u;
  elsif new_status = 'accepted' and r.skill_id is not null then
    update public.skills set status = 'active' where id = r.skill_id and status = 'under_review';
  end if;
end;
$$;

create or replace function public.dev_report_message(p_report uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me(); r public.reports; own uuid;
begin
  perform public.writable();
  select * into r from public.reports where id = p_report;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.skill_id is not null then select owner_id into own from public.skills where id = r.skill_id; else own := r.channel_id; end if;
  if own is distinct from u then raise exception 'NOT_YOURS'; end if;
  if r.status not in ('open','answered') then raise exception 'REPORT_CLOSED'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1500 then raise exception 'BAD_LENGTH'; end if;
  insert into public.report_messages (report_id, from_role, body) values (p_report, 'developer', btrim(p_body));
  update public.reports set status = 'answered' where id = p_report and status = 'open';
end;
$$;

-- red dot numbers: report notices waiting for an answer, new badges since the person last looked
create or replace function public.my_alert_count()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me(); seen timestamptz;
begin
  select alerts_seen_at into seen from public.profiles where id = u;
  return jsonb_build_object(
    'reports', (select count(*) from public.reports r left join public.skills s on s.id = r.skill_id
                 where r.status = 'open' and (s.owner_id = u or r.channel_id = u)),
    'badges',  (select count(*) from public.user_badges where user_id = u and earned_at > seen and revoked_at is null),
    'follow_dots', public.unread_updates_count());
end;
$$;

create or replace function public.mark_alerts_seen()
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  update public.profiles set alerts_seen_at = now() where id = u;
end;
$$;

-- "what you achieved" lines for the Updates menu
create or replace function public.my_achievements(p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := public.me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', ub.badge_key, 'name', bd.name, 'tier', bd.tier,
             'earned_at', ub.earned_at, 'reason', ub.reason, 'revoked', ub.revoked_at is not null)
             order by ub.earned_at desc)
      from (select * from public.user_badges where user_id = u order by earned_at desc limit least(greatest(p_limit, 1), 50)) ub
      join public.badge_definitions bd on bd.key = ub.badge_key), '[]'::jsonb);
end;
$$;

-- channel page: red dot while a channel report is open
create or replace function public.developer_json(p public.profiles, p_viewer uuid)
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
    'under_review', exists (select 1 from public.reports r where r.channel_id = p.id and r.status in ('open','answered')),
    'is_me', (p_viewer is not null and p_viewer = p.id),
    'is_following', (p_viewer is not null and exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p.id)));
end;
$$;

-- ---------------------------------------------------------------------
-- 4. REMOVAL AND BLOCK (used by admin decisions and the nightly job)
-- ---------------------------------------------------------------------
create or replace function public.block_account_internal(p_user uuid, p_reason text, p_actor uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare gid bigint;
begin
  select github_id into gid from public.profiles where id = p_user;
  update public.profiles set blocked = true where id = p_user;
  update public.skills set status = 'removed' where owner_id = p_user and status <> 'removed';
  if gid is not null then
    insert into public.blocked_accounts (github_id, reason) values (gid, left(p_reason, 500)) on conflict do nothing;
  end if;
  insert into public.removed_records (github_id, kind, ref, reason) values (gid, 'account_blocked', p_user::text, left(p_reason, 500));
  perform public.audit(p_actor, 'block_account', p_user::text, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.remove_skill_internal(p_skill uuid, p_reason text, p_count boolean, p_actor uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare o uuid; gid bigint; n int;
begin
  update public.skills set status = 'removed' where id = p_skill returning owner_id into o;
  if o is null then return; end if;
  select github_id into gid from public.profiles where id = o;
  update public.user_badges set revoked_at = now(), revoked_reason = 'skill removed by admin'
   where source_skill_id = p_skill and revoked_at is null;
  insert into public.removed_records (github_id, kind, ref, reason) values (gid, 'skill_removed', p_skill::text, left(p_reason, 500));
  perform public.audit(p_actor, 'remove_skill', p_skill::text, jsonb_build_object('reason', p_reason));
  if p_count then
    update public.profiles set removed_count = removed_count + 1 where id = o returning removed_count into n;
    if n >= public.s_int('blocked_after_removals', 3) then
      perform public.block_account_internal(o, 'too many removed skills', p_actor);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. ADMIN PANEL (read: any admin, write: owner / admin only; always checked here)
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return jsonb_build_object(
    'users', (select count(*) from public.profiles where gate_ok),
    'mau', (select count(*) from public.profiles where last_seen_at > now() - interval '30 days'),
    'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'skills', (select count(*) from public.skills where status = 'active' and deleted_at is null),
    'contributors', (select count(distinct owner_id) from public.skills where status = 'active' and deleted_at is null),
    'open_reports', (select count(*) from public.reports where status in ('open','answered')),
    'blocked', (select count(*) from public.blocked_accounts),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc)
                            from (select country, count(*) n from public.profiles where country is not null group by country order by n desc limit 40) c), '[]'::jsonb),
    'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d)
                            from (select created_at::date d, count(*) n from public.profiles where created_at > now() - interval '30 days' group by 1) z), '[]'::jsonb),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects where bucket_id = 'skilltube-images'), 0));
exception when undefined_column then
  return jsonb_build_object('error', 'storage metadata not readable');
end;
$$;

create or replace function public.admin_users_search(p_q text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare q text := lower(btrim(coalesce(p_q, '')));
begin
  perform public.admin_only(false);
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'username', github_username, 'github_id', github_id, 'name', display_name, 'country', country,
             'followers', followers_count, 'skills', skills_count, 'blocked', blocked, 'removed_count', removed_count,
             'blue_tick', blue_tick, 'master_tick', master_tick, 'created_at', created_at, 'last_seen_at', last_seen_at))
      from (select * from public.profiles
             where lower(github_username) like replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_') || '%'
                or lower(display_name) like '%' || replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_') || '%'
             order by followers_count desc limit 20) z), '[]'::jsonb);
end;
$$;

create or replace function public.admin_settings_get()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((select jsonb_agg(jsonb_build_object('key', key, 'value', value, 'note', note) order by key) from public.settings), '[]'::jsonb);
end;
$$;

create or replace function public.admin_settings_set(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true); cur jsonb;
begin
  select value into cur from public.settings where key = p_key;
  if not found then raise exception 'UNKNOWN_SETTING'; end if;
  if jsonb_typeof(cur) <> jsonb_typeof(p_value) then raise exception 'WRONG_TYPE'; end if;
  update public.settings set value = p_value where key = p_key;
  perform public.audit(u, 'setting', p_key, jsonb_build_object('from', cur, 'to', p_value));
end;
$$;

-- report queue for the admin: who reported (admin sees), both sides' words
create or replace function public.admin_report_queue(p_filter text default 'needs_decision')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', case when r.skill_id is not null then 'skill' else 'channel' end,
      'skill_id', r.skill_id, 'skill_name', s.name, 'repo_url', s.repo_url, 'skill_status', s.status,
      'channel_id', r.channel_id, 'target_username', coalesce(po.github_username, pc.github_username),
      'reason', r.reason, 'note', r.note, 'serious', r.serious, 'status', r.status,
      'reporter', rp.github_username, 'created_at', r.created_at, 'respond_by', r.respond_by,
      'days_left', ceil(extract(epoch from (r.respond_by - now())) / 86400.0)::int,
      'dev_choice', r.dev_choice, 'dev_reply', r.dev_reply, 'dev_replied_at', r.dev_replied_at,
      'admin_decision', r.admin_decision, 'admin_note', r.admin_note,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_role, 'body', m.body, 'at', m.created_at) order by m.created_at)
                              from public.report_messages m where m.report_id = r.id), '[]'::jsonb))
      order by r.serious desc, r.respond_by)
      from public.reports r
      left join public.skills s on s.id = r.skill_id
      left join public.profiles po on po.id = s.owner_id
      left join public.profiles pc on pc.id = r.channel_id
      left join public.profiles rp on rp.id = r.reporter_id
     where case p_filter
             when 'needs_decision' then r.status in ('answered','expired')
             when 'open' then r.status = 'open'
             when 'closing_soon' then r.status = 'open' and r.respond_by < now() + interval '3 days'
             else true end
     limit 200), '[]'::jsonb);
end;
$$;

-- decisions: remove_skill | block_account | dismiss
create or replace function public.admin_decide_report(p_report uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true); r public.reports; own uuid;
begin
  select * into r from public.reports where id = p_report;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if r.skill_id is not null then select owner_id into own from public.skills where id = r.skill_id; else own := r.channel_id; end if;

  if p_decision = 'remove_skill' then
    if r.skill_id is null then raise exception 'NOT_A_SKILL_REPORT'; end if;
    perform public.remove_skill_internal(r.skill_id, p_note, true, u);
  elsif p_decision = 'block_account' then
    perform public.block_account_internal(own, p_note, u);
  elsif p_decision = 'dismiss' then
    if r.skill_id is not null then
      update public.skills set status = 'active' where id = r.skill_id and status = 'under_review';
    end if;
  else raise exception 'BAD_DECISION';
  end if;

  update public.reports
     set status = 'closed_by_admin', admin_decision = p_decision, admin_note = left(btrim(p_note), 1500),
         decided_by = u, decided_at = now()
   where id = p_report;
  insert into public.report_messages (report_id, from_role, body) values (p_report, 'admin', left(btrim(p_note), 1500));
  perform public.audit(u, 'decide_report', p_report::text, jsonb_build_object('decision', p_decision));
end;
$$;

-- admin starts an action himself (remove a skill / block an account): the developer gets a
-- 10-day notice with a blue dot and may answer; then the same decision step closes it.
create or replace function public.admin_start_action(p_skill uuid, p_channel uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true);
begin
  if (p_skill is null) = (p_channel is null) then raise exception 'ONE_TARGET'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 150 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.reports (skill_id, channel_id, reporter_id, reason, note, serious, respond_by)
  values (p_skill, p_channel, null, 'other', btrim(p_reason), false,
          now() + make_interval(days => public.s_int('report_answer_days', 10)));
  perform public.audit(u, 'start_action', coalesce(p_skill, p_channel)::text, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_unblock(p_github_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true);
begin
  delete from public.blocked_accounts where github_id = p_github_id;
  update public.profiles set blocked = false, removed_count = 0 where github_id = p_github_id;
  perform public.audit(u, 'unblock', p_github_id::text);
end;
$$;

create or replace function public.admin_blocked_list()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((select jsonb_agg(jsonb_build_object('github_id', github_id, 'reason', reason, 'at', blocked_at) order by blocked_at desc)
                     from public.blocked_accounts), '[]'::jsonb);
end;
$$;

create or replace function public.admin_revoke_badge(p_user uuid, p_key text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true);
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  update public.user_badges set revoked_at = now(), revoked_reason = left(p_reason, 300)
   where user_id = p_user and badge_key = p_key and revoked_at is null;
  perform public.audit(u, 'revoke_badge', p_user::text || ':' || p_key, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_audit(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((select jsonb_agg(row_to_json(a)::jsonb) from (
           select at, actor, action, target, detail from public.audit_log order by at desc limit least(greatest(p_limit,1),500)) a), '[]'::jsonb);
end;
$$;

-- admin people: only the owner adds/removes; the owner can never be removed
create or replace function public.admin_list()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'username', p.github_username, 'role', a.role) order by a.created_at)
                     from public.admins a left join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_add(p_username text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true); target uuid;
begin
  if not exists (select 1 from public.admins where user_id = u and role = 'owner') then raise exception 'OWNER_ONLY'; end if;
  if p_role not in ('admin','viewer') then raise exception 'BAD_ROLE'; end if;
  select id into target from public.profiles where lower(github_username) = lower(btrim(p_username));
  if target is null then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.admins (user_id, role) values (target, p_role)
  on conflict (user_id) do update set role = excluded.role where public.admins.role <> 'owner';
  perform public.audit(u, 'admin_add', target::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_remove(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true);
begin
  if not exists (select 1 from public.admins where user_id = u and role = 'owner') then raise exception 'OWNER_ONLY'; end if;
  delete from public.admins where user_id = p_user and role <> 'owner';
  perform public.audit(u, 'admin_remove', p_user::text);
end;
$$;

-- announcements: Markdown up to 100 KB, one per day, with start/end to the minute
create or replace function public.admin_announce(p_title text, p_body text, p_pinned boolean, p_starts timestamptz, p_ends timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true); id uuid;
begin
  if octet_length(coalesce(p_body, '')) > 102400 then raise exception 'ANNOUNCEMENT_TOO_BIG'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 1 then raise exception 'TITLE_REQUIRED'; end if;
  if p_ends is not null and p_ends <= coalesce(p_starts, now()) then raise exception 'BAD_TIMES'; end if;
  if exists (select 1 from public.announcements where created_at::date = current_date) then raise exception 'ONE_PER_DAY'; end if;
  insert into public.announcements (title, body_md, pinned, starts_at, ends_at, created_by)
  values (btrim(p_title), coalesce(p_body, ''), coalesce(p_pinned, false), coalesce(p_starts, now()), p_ends, u)
  returning announcements.id into id;
  perform public.audit(u, 'announce', id::text);
  return id;
end;
$$;

create or replace function public.admin_announcement_delete(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare u uuid := public.admin_only(true);
begin
  delete from public.announcements where id = p_id;
  perform public.audit(u, 'announcement_delete', p_id::text);
end;
$$;

create or replace function public.admin_announcements()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_only(false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body_md', body_md, 'pinned', pinned,
                      'starts_at', starts_at, 'ends_at', ends_at, 'created_at', created_at) order by created_at desc)
                     from public.announcements), '[]'::jsonb);
end;
$$;

-- what every signed-in person sees: running announcements, pinned first
create or replace function public.active_announcements()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.me();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body_md', body_md, 'pinned', pinned,
                      'starts_at', starts_at, 'ends_at', ends_at) order by pinned desc, starts_at desc)
                     from public.announcements
                    where starts_at <= now() and (ends_at is null or ends_at > now())), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. THINGS THE NIGHTLY JOB AND THE NOTIFY FUNCTION NEED
-- ---------------------------------------------------------------------
-- reports still unanswered 3 days before the deadline (the single push to the reported developer)
create or replace function public.reports_needing_push()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'user_id', coalesce(s.owner_id, r.channel_id))), '[]'::jsonb)
    from public.reports r left join public.skills s on s.id = r.skill_id
   where r.status = 'open' and not r.push_sent and r.respond_by < now() + interval '3 days'
$$;

create or replace function public.mark_report_push_sent(p_ids uuid[])
returns void language sql security definer set search_path = ''
as $$ update public.reports set push_sent = true where id = any (p_ids) $$;

-- unanswered after the deadline:
--   serious skill report  -> the skill is removed;   channel report -> the channel is deleted;
--   copyright and the rest -> the admin decides (status "expired")
create or replace function public.expire_reports()
returns int language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select * from public.reports where status = 'open' and respond_by < now() loop
    if r.skill_id is not null and r.serious then
      perform public.remove_skill_internal(r.skill_id, 'no answer to a serious report', false, null);
      update public.reports set status = 'closed_by_admin', admin_decision = 'auto_removed',
             admin_note = 'Developer did not answer within the time limit.', decided_at = now() where id = r.id;
    elsif r.channel_id is not null then
      insert into public.removed_records (github_id, kind, ref, reason)
      select github_id, 'channel_deleted', r.channel_id::text, 'no answer to a channel report' from public.profiles where id = r.channel_id;
      update public.reports set status = 'closed_by_admin', admin_decision = 'auto_channel_deleted', decided_at = now() where id = r.id;
      delete from auth.users where id = r.channel_id;
    else
      update public.reports set status = 'expired' where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. WHO MAY CALL WHAT
-- ---------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.public_search(text, int), public.public_skill(uuid), public.public_developer(text),
  public.public_settings(), public.public_stats(), public.trending_tags()
  to anon, authenticated;

grant execute on function
  public.is_admin(), public.is_admin_writer(), public.me_state(), public.my_skills(), public.skill_detail(uuid),
  public.get_developer(text), public.search_app(text, int), public.for_you_feed(int),
  public.tag_picker(int, text), public.edit_skill(uuid, text, text, jsonb, numeric, int, int),
  public.delete_skill(uuid), public.restore_skill(uuid), public.announce_update(uuid, text),
  public.update_my_profile(text, text, text[], numeric, int, int), public.set_hide_public(boolean),
  public.redeem_invite(text), public.skip_invite_prompt(), public.delete_my_account(),
  public.record_view(uuid), public.get_download_link(uuid), public.toggle_star(uuid), public.toggle_follow(uuid),
  public.my_following(), public.my_updates_feed(int, timestamptz), public.mark_developer_seen(uuid),
  public.mark_all_seen(), public.unread_updates_count(), public.set_interests(text[]), public.clear_interests(),
  public.touch_seen(),
  public.add_comment(uuid, text, uuid), public.list_comments(uuid, int), public.comment_action(uuid, text),
  public.file_report(uuid, uuid, text, text), public.my_notices(), public.dev_answer_report(uuid, text, text),
  public.dev_report_message(uuid, text), public.my_alert_count(), public.mark_alerts_seen(),
  public.my_achievements(int), public.active_announcements(),
  public.admin_overview(), public.admin_users_search(text), public.admin_settings_get(),
  public.admin_settings_set(text, jsonb), public.admin_report_queue(text),
  public.admin_decide_report(uuid, text, text), public.admin_start_action(uuid, uuid, text),
  public.admin_unblock(bigint), public.admin_blocked_list(), public.admin_revoke_badge(uuid, text, text),
  public.admin_audit(int), public.admin_list(), public.admin_add(text, text), public.admin_remove(uuid),
  public.admin_announce(text, text, boolean, timestamptz, timestamptz),
  public.admin_announcement_delete(uuid), public.admin_announcements()
  to authenticated;

grant execute on all functions in schema public to service_role;

-- Done. Next: skilltube-sql-4-badges-jobs.sql (badge rules, weekly ranking, nightly jobs).
