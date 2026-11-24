-- =====================================================================
-- SkillTube | SQL 4 of 4 : badge rules, ticks, weekly ranking, dashboard,
--                          popularity and the automatic clean-up jobs
--
-- Run this AFTER files 1, 2 and 3 all finished with "Success".
-- Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Expected answer: "Success. No rows returned"
-- (Safe to run again: it only replaces functions and refreshes the badge list.)
--
-- Times of the scheduled jobs are UTC. India = UTC + 5:30.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TWO SMALL NEW TABLES (closed like all others)
-- ---------------------------------------------------------------------
-- views per country in the first 7 days of a skill (for the "countries in 24 h / 168 h" badges)
create table if not exists public.skill_early_countries (
  skill_id uuid not null references public.skills(id) on delete cascade,
  country  char(2) not null,
  n24      int not null default 0,
  n168     int not null default 0,
  primary key (skill_id, country)
);

-- picture files of deleted skills; a later job removes the real files from storage
create table if not exists public.storage_trash (
  path text primary key,
  at   timestamptz not null default now()
);

alter table public.skill_early_countries enable row level security;
alter table public.storage_trash          enable row level security;
revoke all on public.skill_early_countries from anon, authenticated;
revoke all on public.storage_trash          from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. record_view now also remembers the country of early views
-- ---------------------------------------------------------------------
create or replace function public.record_view(p_skill uuid)
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

  if age_min <= 168 * 60 and c is not null then
    insert into public.skill_early_countries as e (skill_id, country, n24, n168)
    values (p_skill, c, (age_min <= 24 * 60)::int, 1)
    on conflict (skill_id, country) do update set
      n24  = e.n24  + (age_min <= 24 * 60)::int,
      n168 = e.n168 + 1;
  end if;

  perform public.bump_skill_topics(u, p_skill, 1);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. THE 55 BADGES AND THEIR RULES  (numbers live in the "rule" column;
--    you can change a number later with one UPDATE, no code change)
-- ---------------------------------------------------------------------
insert into public.badge_definitions (key, name, tier, field, is_weekly, band, rule) values
('badge-01','Velocity Spark','gold','velocity',false,null,'{"how": "1,000 views within 7 days of publishing a skill", "v168h": 1000}'::jsonb),
('badge-02','Surge Node','gold','velocity',false,null,'{"how": "5,000 views within 7 days of publishing a skill", "v168h": 5000}'::jsonb),
('badge-03','Rapid Traction','platinum','velocity',false,null,'{"how": "25,000 views within 7 days of publishing a skill", "v168h": 25000}'::jsonb),
('badge-04','Traffic Storm','heroic','velocity',false,null,'{"how": "100,000 views within 7 days of publishing a skill", "v168h": 100000}'::jsonb),
('badge-05','Multi-Post Velocity','gold','velocity',false,null,'{"how": "3 skills with 1,000+ views each in the same week", "week_skills": 3, "week_per_skill": 1000}'::jsonb),
('badge-06','The 1M Collective','diamond','velocity',false,null,'{"how": "1,000,000 views in one week across 5 skills", "week_views": 1000000, "week_skills": 5, "week_per_skill": 1000}'::jsonb),
('badge-07','Viral Velocity','heroic','velocity',false,null,'{"how": "50,000 views within 3 days of publishing a skill", "v72h": 50000}'::jsonb),
('badge-08','Blitzscale Node','platinum','velocity',false,null,'{"how": "10,000 views within 24 hours of publishing a skill", "v24h": 10000}'::jsonb),
('badge-09','Omni-Traffic Master','master','velocity',false,null,'{"how": "2,500,000 views in one week across 10 skills", "week_views": 2500000, "week_skills": 10, "week_per_skill": 1000}'::jsonb),
('badge-10','Apex Wave','platinum','velocity',false,null,'{"how": "Number 1 in the weekly ranking", "weekly_rank": 1}'::jsonb),
('badge-11','Initial Circle','gold','network',false,null,'{"how": "100 followers", "followers": 100}'::jsonb),
('badge-12','The 1k Node','gold','network',false,null,'{"how": "1,000 followers", "followers": 1000}'::jsonb),
('badge-13','Substantial Base','heroic','network',false,null,'{"how": "10,000 followers", "followers": 10000}'::jsonb),
('badge-14','Elite Network I','platinum','network',false,null,'{"how": "1,000 followers, 100 of them with 1,000+ views", "followers": 1000, "influential": 100}'::jsonb),
('badge-15','Professional Authority','heroic','network',false,null,'{"how": "10,000 followers, 1,000 of them professional creators (3+ skills, 1,000+ views)", "followers": 10000, "pro": 1000}'::jsonb),
('badge-16','Mentor Circuit','gold','network',false,null,'{"how": "500 followers who also publish skills", "creators": 500}'::jsonb),
('badge-17','High-Signal Followers','heroic','network',false,null,'{"how": "50 followers who are creators with 10,000+ views", "highview": 50}'::jsonb),
('badge-18','Gravity Node','heroic','network',false,null,'{"how": "50,000 followers, 5,000 of them creators", "followers": 50000, "creators": 5000}'::jsonb),
('badge-19','Network Grandmaster','platinum','network',false,null,'{"how": "1,000 views within the first hour of publishing a skill", "v60": 1000}'::jsonb),
('badge-20','SkillTube Luminary','diamond','network',false,null,'{"how": "100,000 followers, 10,000 of them creators", "followers": 100000, "creators": 10000}'::jsonb),
('badge-21','Cross-Border Node','gold','global',false,null,'{"how": "Followers from 5 countries (2+ per country)", "fol_countries": 5, "per_country": 2}'::jsonb),
('badge-22','Global Citizen','gold','global',false,null,'{"how": "100 followers from 5 countries", "followers": 100, "fol_countries": 5, "per_country": 1}'::jsonb),
('badge-23','Multinational Authority','platinum','global',false,null,'{"how": "1,000 followers from 10 countries", "followers": 1000, "fol_countries": 10, "per_country": 1}'::jsonb),
('badge-24','Blue Tick Creator','diamond','global',false,null,'{"how": "Blue Tick earned (1,000,000 followers)", "blue": true}'::jsonb),
('badge-25','Elite Blue Tick','diamond','global',false,null,'{"how": "Blue Tick plus 500,000 views", "blue": true, "total_views": 500000}'::jsonb),
('badge-26','Global Master Tick','master','global',false,null,'{"how": "Master Tick earned (100 Blue-Tick followers from 10 countries)", "master": true}'::jsonb),
('badge-27','Pan-Global Architect','gold','global',false,null,'{"how": "Views from 20 countries (5+ views each)", "view_countries": 20, "per_country": 5}'::jsonb),
('badge-28','Elite Creator Network','diamond','global',false,null,'{"how": "Blue Tick plus 50 creators following you", "blue": true, "creators": 50}'::jsonb),
('badge-29','Global Mastermind','master','global',false,null,'{"how": "Master Tick plus 5 skills each viewed from 15 countries", "master": true, "skill_countries": 15, "skills": 5, "per_country": 5}'::jsonb),
('badge-30','Global Legend','master','global',false,null,'{"how": "Blue Tick and Master Tick plus followers from 15 countries", "blue": true, "master": true, "fol_countries": 15, "per_country": 1}'::jsonb),
('badge-31','Global Surge Node','gold','fusion',false,null,'{"how": "1,000 views in 7 days from 3 countries on one skill", "v168h": 1000, "early_countries": 3, "early_per_country": 10}'::jsonb),
('badge-32','Cross-Border Storm','platinum','fusion',false,null,'{"how": "25,000 views in 7 days from 5 countries on one skill", "v168h": 25000, "early_countries": 5, "early_per_country": 100}'::jsonb),
('badge-33','Multi-Nation Million','diamond','fusion',false,null,'{"how": "The 1M Collective plus views from 8 countries", "has": ["badge-06"], "view_countries": 8, "per_country": 100}'::jsonb),
('badge-34','Velocity Mastermind','platinum','fusion',false,null,'{"how": "Blitzscale Node plus Global Citizen", "has": ["badge-08", "badge-22"]}'::jsonb),
('badge-35','Worldwide Apex','heroic','fusion',false,null,'{"how": "Number 1 of the week plus views from 10 countries", "weekly_rank": 1, "view_countries": 10, "per_country": 50}'::jsonb),
('badge-36','Pan-Global Flash','master','fusion',false,null,'{"how": "Master Tick plus a week with 50,000 views", "master": true, "week_views": 50000}'::jsonb),
('badge-37','International Velocity Elite','heroic','fusion',false,null,'{"how": "Three velocity badges plus views from 15 countries", "velocity_badges": 3, "view_countries": 15, "per_country": 50}'::jsonb),
('badge-38','Collective Cross-Node','diamond','fusion',false,null,'{"how": "The 1M Collective plus Multinational Authority", "has": ["badge-06", "badge-23"]}'::jsonb),
('badge-39','Global Blitz Architect','platinum','fusion',false,null,'{"how": "10,000 views in 24 hours from 5 countries on one skill", "v24h": 10000, "early24_countries": 5, "early_per_country": 50}'::jsonb),
('badge-40','Planetary Wave','master','fusion',false,null,'{"how": "Master Tick, a week with 500,000 views and 5,000,000 total views", "master": true, "week_views": 500000, "total_views": 5000000}'::jsonb),
('badge-41','Blue Authority','diamond','authority',false,null,'{"how": "Blue Tick plus Professional Authority", "blue": true, "has": ["badge-15"]}'::jsonb),
('badge-42','Master Tick Elite','master','authority',false,null,'{"how": "Master Tick plus 500 creators following you", "master": true, "creators": 500}'::jsonb),
('badge-43','Peer-Powered Core','platinum','authority',false,null,'{"how": "1,000 followers, 100 of them with a verified skill", "followers": 1000, "verified": 100}'::jsonb),
('badge-44','Network Luminary','diamond','authority',false,null,'{"how": "SkillTube Luminary plus Pan-Global Architect", "has": ["badge-20", "badge-27"]}'::jsonb),
('badge-45','The 1M Blue Node','master','authority',false,null,'{"how": "Blue Tick and Master Tick plus a Master-Tick follower", "blue": true, "master": true, "fol_master": 1}'::jsonb),
('badge-46','Ultimate Network Grandmaster','diamond','authority',false,null,'{"how": "Network Grandmaster plus Blue Tick", "has": ["badge-19"], "blue": true}'::jsonb),
('badge-47','Global Peer Collective','heroic','authority',false,null,'{"how": "100 followers who each have a skill with 10,000+ views", "skill10k": 100}'::jsonb),
('badge-48','Legendary Blue Node','master','authority',false,null,'{"how": "6 months with a clean record (no skill removed by the team)", "clean_days": 180}'::jsonb),
('badge-49','Supreme Curator','heroic','authority',false,null,'{"how": "5 badges in each of 3 different fields", "fields": 3, "per_field": 5}'::jsonb),
('badge-50','SkillTube Legend','master','authority',false,null,'{"how": "Blue and Master Tick plus Global Legend, Pan-Global Flash, Master Tick Elite and Legendary Blue Node", "blue": true, "master": true, "has": ["badge-30", "badge-36", "badge-42", "badge-48"]}'::jsonb),
('weekly-apex-10','Apex Ten','master','weekly-rank',true,10,'{"how": "Ranked in the weekly top 10"}'::jsonb),
('weekly-challenger-30','Challenger 30','heroic','weekly-rank',true,30,'{"how": "Ranked 21 to 30 in the weekly ranking"}'::jsonb),
('weekly-climber-40','Climber 40','platinum','weekly-rank',true,40,'{"how": "Ranked 31 to 40 in the weekly ranking"}'::jsonb),
('weekly-contender-20','Contender 20','diamond','weekly-rank',true,20,'{"how": "Ranked 11 to 20 in the weekly ranking"}'::jsonb),
('weekly-rise-50','Rising 50','gold','weekly-rank',true,50,'{"how": "Ranked 41 to 50 in the weekly ranking"}'::jsonb)
on conflict (key) do update set name = excluded.name, tier = excluded.tier, field = excluded.field,
  is_weekly = excluded.is_weekly, band = excluded.band, rule = excluded.rule, active = true;

-- shown on the "how do I earn badges" page (no personal data, safe for everyone)
create or replace function public.badge_catalog()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', key, 'name', name, 'tier', tier, 'field', field, 'weekly', is_weekly,
           'band', band, 'how', rule->>'how') order by is_weekly, key), '[]'::jsonb)
    from public.badge_definitions where active
$$;

-- ---------------------------------------------------------------------
-- 4. POPULARITY AND STRENGTH TIER (feeds the home feed order)
-- ---------------------------------------------------------------------
create or replace function public.refresh_popularity()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.skills s
     set popularity = least(
           coalesce((select sum(d.views)     from public.skill_daily_stats d where d.skill_id = s.id and d.day >= current_date - 6), 0) * 4
         + coalesce((select sum(d.downloads) from public.skill_daily_stats d where d.skill_id = s.id and d.day >= current_date - 6), 0) * 12
         + s.star_count * 5 + s.comment_count * 2 + s.views_total / 20, 2000000000)::int
   where s.deleted_at is null;

  with r as (
    select id, percent_rank() over (order by popularity) as pr,
           count(*) over () as total
      from public.skills where status = 'active' and deleted_at is null)
  update public.skills s
     set strength_tier = case when r.total < 10 then 2
                              when r.pr >= 0.8 then 3
                              when r.pr >= 0.3 then 2 else 1 end
    from r where r.id = s.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. TICKS AND BADGES FOR ONE DEVELOPER
--    A badge once earned stays (even if numbers fall later). It is only
--    removed by the team, or when the skill that earned it is removed.
-- ---------------------------------------------------------------------
create or replace function public.eval_user_badges(p_user uuid)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles; b record; rl jsonb;
  fol int; f_cre int; f_inf int; f_pro int; f_hv int; f_ver int; f_s10 int; f_blue int; f_mast int;
  blue boolean; master boolean; blue_cty int;
  ok boolean; checked boolean; src uuid; sname text; per int; v int; wsum bigint; wcnt int;
  n int := 0;
begin
  select * into p from public.profiles where id = p_user and gate_ok and not blocked;
  if not found then return 0; end if;

  select count(*),
         count(*) filter (where fp.skills_count >= 1),
         count(*) filter (where fp.total_views >= 1000),
         count(*) filter (where fp.skills_count >= 3 and fp.total_views >= 1000),
         count(*) filter (where fp.total_views >= 10000),
         count(*) filter (where exists (select 1 from public.skills x where x.owner_id = fp.id
                          and x.verified and x.status = 'active' and x.deleted_at is null)),
         count(*) filter (where exists (select 1 from public.skills x where x.owner_id = fp.id
                          and x.views_total >= 10000 and x.status = 'active' and x.deleted_at is null)),
         count(*) filter (where fp.blue_tick),
         count(*) filter (where fp.master_tick)
    into fol, f_cre, f_inf, f_pro, f_hv, f_ver, f_s10, f_blue, f_mast
    from public.follows f join public.profiles fp on fp.id = f.follower_id
   where f.following_id = p_user and fp.gate_ok and not fp.blocked;

  select count(distinct fp.country) into blue_cty
    from public.follows f join public.profiles fp on fp.id = f.follower_id
   where f.following_id = p_user and fp.blue_tick and fp.country is not null and fp.gate_ok and not fp.blocked;

  blue   := p.blue_tick   or fol >= public.s_int('blue_tick_followers', 1000000);
  master := p.master_tick or (f_blue >= public.s_int('master_tick_blue_followers', 100)
                              and blue_cty >= public.s_int('master_tick_countries', 10));
  if blue <> p.blue_tick or master <> p.master_tick then
    update public.profiles set blue_tick = blue, master_tick = master where id = p_user;
  end if;

  for b in select key, rule from public.badge_definitions where active and not is_weekly order by key
  loop
    continue when exists (select 1 from public.user_badges where user_id = p_user and badge_key = b.key);
    rl := b.rule; ok := true; checked := false; src := null; sname := null;

    if ok and rl ? 'followers'   then checked := true; ok := fol   >= (rl->>'followers')::int;   end if;
    if ok and rl ? 'creators'    then checked := true; ok := f_cre >= (rl->>'creators')::int;    end if;
    if ok and rl ? 'influential' then checked := true; ok := f_inf >= (rl->>'influential')::int; end if;
    if ok and rl ? 'pro'         then checked := true; ok := f_pro >= (rl->>'pro')::int;         end if;
    if ok and rl ? 'highview'    then checked := true; ok := f_hv  >= (rl->>'highview')::int;    end if;
    if ok and rl ? 'verified'    then checked := true; ok := f_ver >= (rl->>'verified')::int;    end if;
    if ok and rl ? 'skill10k'    then checked := true; ok := f_s10 >= (rl->>'skill10k')::int;    end if;
    if ok and rl ? 'fol_master'  then checked := true; ok := f_mast >= (rl->>'fol_master')::int; end if;
    if ok and rl ? 'blue'        then checked := true; ok := blue;   end if;
    if ok and rl ? 'master'      then checked := true; ok := master; end if;
    if ok and rl ? 'total_views' then checked := true; ok := p.total_views >= (rl->>'total_views')::bigint; end if;

    per := coalesce((rl->>'per_country')::int, 1);

    if ok and rl ? 'fol_countries' then
      checked := true;
      select count(*) into v from (
        select fp.country from public.follows f join public.profiles fp on fp.id = f.follower_id
         where f.following_id = p_user and fp.gate_ok and not fp.blocked and fp.country is not null
         group by fp.country having count(*) >= per) q;
      ok := v >= (rl->>'fol_countries')::int;
    end if;

    if ok and rl ? 'view_countries' then
      checked := true;
      select count(*) into v from (
        select c.country from public.skill_country_views c join public.skills s on s.id = c.skill_id
         where s.owner_id = p_user and s.deleted_at is null
         group by c.country having sum(c.n) >= per) q;
      ok := v >= (rl->>'view_countries')::int;
    end if;

    if ok and rl ? 'skill_countries' then
      checked := true;
      select count(*) into v from (
        select c.skill_id from public.skill_country_views c join public.skills s on s.id = c.skill_id
         where s.owner_id = p_user and s.deleted_at is null and c.n >= per
         group by c.skill_id having count(*) >= (rl->>'skill_countries')::int) q;
      ok := v >= (rl->>'skills')::int;
    end if;

    if ok and rl ? 'has' then
      checked := true;
      ok := not exists (
        select 1 from jsonb_array_elements_text(rl->'has') h(k)
         where not exists (select 1 from public.user_badges ub
                            where ub.user_id = p_user and ub.badge_key = h.k and ub.revoked_at is null));
    end if;

    if ok and rl ? 'velocity_badges' then
      checked := true;
      select count(*) into v from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key
       where ub.user_id = p_user and ub.revoked_at is null and d.field = 'velocity' and not d.is_weekly;
      ok := v >= (rl->>'velocity_badges')::int;
    end if;

    if ok and rl ? 'fields' then
      checked := true;
      select count(*) into v from (
        select d.field from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key
         where ub.user_id = p_user and ub.revoked_at is null and not d.is_weekly
         group by d.field having count(*) >= (rl->>'per_field')::int) q;
      ok := v >= (rl->>'fields')::int;
    end if;

    if ok and rl ? 'weekly_rank' then
      checked := true;
      ok := exists (select 1 from public.weekly_ranks where user_id = p_user and rank <= (rl->>'weekly_rank')::int);
    end if;

    if ok and rl ? 'clean_days' then
      checked := true;
      ok := p.first_skill_at is not null
            and p.first_skill_at <= now() - make_interval(days => (rl->>'clean_days')::int)
            and (select removed_count from public.profiles where id = p_user) = 0
            and exists (select 1 from public.skills where owner_id = p_user and status = 'active' and deleted_at is null);
    end if;

    if ok and (rl ? 'week_views' or rl ? 'week_skills') then
      checked := true;
      per := coalesce((rl->>'week_per_skill')::int, 1);
      select coalesce(sum(w), 0), count(*) filter (where w >= per) into wsum, wcnt from (
        select sum(d.views) as w from public.skill_daily_stats d join public.skills s on s.id = d.skill_id
         where s.owner_id = p_user and s.deleted_at is null and s.status = 'active' and d.day >= current_date - 6
         group by s.id) q;
      ok := wsum >= coalesce((rl->>'week_views')::bigint, 0) and wcnt >= coalesce((rl->>'week_skills')::int, 0);
    end if;

    if ok and rl ?| array['v60', 'v24h', 'v72h', 'v168h'] then
      checked := true;
      per := coalesce((rl->>'early_per_country')::int, 1);
      select s.id, s.name into src, sname
        from public.skills s join public.skill_early_views e on e.skill_id = s.id
       where s.owner_id = p_user and s.deleted_at is null and s.status = 'active'
         and e.v60   >= coalesce((rl->>'v60')::int, 0)
         and e.v24h  >= coalesce((rl->>'v24h')::int, 0)
         and e.v72h  >= coalesce((rl->>'v72h')::int, 0)
         and e.v168h >= coalesce((rl->>'v168h')::int, 0)
         and (not rl ? 'early_countries' or
              (select count(*) from public.skill_early_countries c
                where c.skill_id = s.id and c.n168 >= per) >= (rl->>'early_countries')::int)
         and (not rl ? 'early24_countries' or
              (select count(*) from public.skill_early_countries c
                where c.skill_id = s.id and c.n24 >= per) >= (rl->>'early24_countries')::int)
       order by e.v168h desc limit 1;
      ok := src is not null;
    end if;

    if ok and checked then
      insert into public.user_badges (user_id, badge_key, reason, source_skill_id)
      values (p_user, b.key,
              coalesce(rl->>'how', b.key) || case when sname is not null then ' - skill "' || sname || '"' else '' end,
              src)
      on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.run_badges()
returns int language plpgsql security definer set search_path = ''
as $$
declare u uuid; n int := 0;
begin
  perform public.refresh_popularity();
  for u in select id from public.profiles
            where gate_ok and not blocked and (skills_count > 0 or first_skill_at is not null)
            order by id
  loop
    n := n + public.eval_user_badges(u);
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. WEEKLY RANKING (Monday, for the Monday-to-Sunday week that just ended)
--    score = views + 3 x downloads + 5 x new stars + 10 x new followers
--    Only developers whose first skill is at least 3 months old take part.
--    Top 50 get a band badge; the profile shows only the best band.
-- ---------------------------------------------------------------------
create or replace function public.compute_weekly_ranks(p_end date default current_date)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  d_from date := p_end - 7; d_to date := p_end - 1;
  wk int := (extract(isoyear from (p_end - 1))::int * 100 + extract(week from (p_end - 1))::int);
  months int := public.s_int('public_dashboard_months', 3);
  r record; bk text; n int := 0;
begin
  delete from public.weekly_ranks where week_no = wk;

  insert into public.weekly_ranks (week_no, user_id, rank, score)
  select wk, x.id, row_number() over (order by x.score desc, x.first_skill_at, x.id), x.score
    from (
      select p.id, p.first_skill_at,
             coalesce(v.views, 0) + 3 * coalesce(v.dl, 0) + 5 * coalesce(st.n, 0) + 10 * coalesce(fo.n, 0) as score
        from public.profiles p
        left join (select s.owner_id as u, sum(d.views) as views, sum(d.downloads) as dl
                     from public.skill_daily_stats d join public.skills s on s.id = d.skill_id
                    where d.day between d_from and d_to and s.deleted_at is null
                    group by s.owner_id) v on v.u = p.id
        left join (select s.owner_id as u, count(*) as n
                     from public.stars x join public.skills s on s.id = x.skill_id
                    where x.created_at >= d_from and x.created_at < d_to + 1
                    group by s.owner_id) st on st.u = p.id
        left join (select following_id as u, count(*) as n from public.follows
                    where created_at >= d_from and created_at < d_to + 1 group by following_id) fo on fo.u = p.id
       where p.gate_ok and not p.blocked and p.first_skill_at is not null
         and p.first_skill_at <= now() - make_interval(months => months)
    ) x
   where x.score > 0
   order by 3
   limit 50;

  for r in select * from public.weekly_ranks where week_no = wk order by rank loop
    bk := case when r.rank <= 10 then 'weekly-apex-10'
               when r.rank <= 20 then 'weekly-contender-20'
               when r.rank <= 30 then 'weekly-challenger-30'
               when r.rank <= 40 then 'weekly-climber-40'
               else 'weekly-rise-50' end;
    insert into public.user_badges (user_id, badge_key, reason)
    values (r.user_id, bk, 'Ranked #' || r.rank || ' in the weekly top 50 (week starting ' || to_char(d_from, 'YYYY-MM-DD') || ')')
    on conflict do nothing;
    n := n + 1;
  end loop;

  update public.profiles p
     set best_weekly_band = (select min(d.band) from public.user_badges ub
                               join public.badge_definitions d on d.key = ub.badge_key
                              where ub.user_id = p.id and d.is_weekly and d.active and ub.revoked_at is null)
   where p.id in (select user_id from public.weekly_ranks where week_no = wk);

  -- keep 8 weeks
  delete from public.weekly_ranks
   where week_no < (extract(isoyear from (p_end - 57))::int * 100 + extract(week from (p_end - 57))::int);
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. DASHBOARD (anyone may call it; the "me" part appears only when signed in)
--    state: empty (no ranking yet) | live
--    me.state: no_skill | waiting (first skill is younger than 3 months) | live
-- ---------------------------------------------------------------------
create or replace function public.dashboard()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  u uuid := auth.uid(); wk int; p public.profiles; mine jsonb := null;
  months int := public.s_int('public_dashboard_months', 3); live_on timestamptz;
begin
  select max(week_no) into wk from public.weekly_ranks;

  if u is not null then
    select * into p from public.profiles where id = u and gate_ok and not blocked;
    if found then
      if p.first_skill_at is null then
        mine := jsonb_build_object('state', 'no_skill');
      elsif p.first_skill_at > now() - make_interval(months => months) then
        live_on := p.first_skill_at + make_interval(months => months);
        mine := jsonb_build_object('state', 'waiting', 'live_on', live_on::date,
                                   'days_left', ceil(extract(epoch from (live_on - now())) / 86400)::int);
      else
        mine := jsonb_build_object('state', 'live',
                  'rank',  (select rank  from public.weekly_ranks where week_no = wk and user_id = u),
                  'score', (select score from public.weekly_ranks where week_no = wk and user_id = u),
                  'best_band', p.best_weekly_band);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'state', case when wk is null then 'empty' else 'live' end,
    'week', wk,
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', r.rank, 'score', r.score, 'username', pr.github_username, 'name', pr.display_name,
               'logo', jsonb_build_object('path', pr.logo_path, 'zoom', pr.logo_zoom, 'x', pr.logo_x, 'y', pr.logo_y),
               'tick', case when pr.master_tick then 'tick-master-gold' when pr.blue_tick then 'tick-blue' end)
             order by r.rank)
        from public.weekly_ranks r join public.profiles pr on pr.id = r.user_id
       where r.week_no = wk and not pr.hide_public and not pr.blocked), '[]'::jsonb),
    'me', mine);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. CLEAN-UP (runs every hour)
-- ---------------------------------------------------------------------
create or replace function public.run_cleanup()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.expire_reports();

  delete from public.comments
   where not pinned and created_at < now() - make_interval(hours => public.s_int('comment_life_hours', 120));
  delete from public.skill_views_recent
   where viewed_at < now() - make_interval(hours => public.s_int('view_repeat_hours', 6));
  delete from public.tag_search_buckets where bucket < now() - interval '48 hours';
  delete from public.skill_updates      where created_at < now() - interval '30 days';
  delete from public.skill_daily_stats  where day < current_date - 35;
  delete from public.skill_early_views e using public.skills s
   where s.id = e.skill_id and s.created_at < now() - interval '8 days';
  delete from public.skill_early_countries e using public.skills s
   where s.id = e.skill_id and s.created_at < now() - interval '8 days';
  delete from public.removed_records where created_at < now() - interval '180 days';
  delete from public.audit_log       where at < now() - interval '365 days';

  -- deleted skills: after the undo window they are gone for good; their picture goes to the trash list
  with gone as (
    delete from public.skills
     where (deleted_at is not null and deleted_at < now() - make_interval(hours => public.s_int('delete_undo_hours', 12)))
        or (status = 'removed' and updated_at < now() - interval '180 days')
    returning image_path)
  insert into public.storage_trash (path)
  select image_path from gone where image_path is not null
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. SCHEDULE (pg_cron). If pg_cron is not enabled yet, this prints a notice:
--    Dashboard -> Database -> Extensions -> turn on "pg_cron", then run this file again.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be enabled here: %', sqlerrm;
  end;
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron is OFF. Turn it on (Database -> Extensions) and run this file again.';
  else
    perform cron.schedule('skilltube-badges',  '17 */6 * * *', 'select public.run_badges()');
    perform cron.schedule('skilltube-cleanup', '5 * * * *',    'select public.run_cleanup()');
    perform cron.schedule('skilltube-weekly',  '10 0 * * 1',   'select public.compute_weekly_ranks()');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 10. WHO MAY CALL WHAT
-- ---------------------------------------------------------------------
revoke all on function
  public.refresh_popularity(), public.eval_user_badges(uuid), public.run_badges(),
  public.compute_weekly_ranks(date), public.run_cleanup(), public.record_view(uuid),
  public.dashboard(), public.badge_catalog()
  from public, anon, authenticated;

grant execute on function public.dashboard(), public.badge_catalog() to anon, authenticated;
grant execute on function public.record_view(uuid) to authenticated;
grant execute on all functions in schema public to service_role;

-- Done. All four SQL files are in. Next: Edge Functions (add-skill, save-image, account-gate, set-country).
