-- =====================================================================
-- SkillTube | SQL 1 of 3 : clean start, all tables, security rules, storage
--
-- !! This file REBUILDS every SkillTube table from zero. !!
-- Run it only BEFORE real users exist (right now, while testing).
-- After launch we use small "update" files, never this one.
--
-- How: Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- Then run  skilltube-sql-2-functions.sql  (second file).
-- Expected answer: "Success. No rows returned"
--
-- Big rule of this design: the website (anon / signed-in) can NOT read
-- tables directly. It reads only through the safe functions and views of
-- file 2. So a bug in the website can never leak a download link, a country
-- or a reporter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. CLEAN SLATE
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  -- views first
  for r in select schemaname, viewname from pg_views
            where schemaname = 'public'
              and viewname in ('skill_cards','developer_cards','my_following','my_updates_feed','category_counts')
  loop
    execute format('drop view if exists %I.%I cascade', r.schemaname, r.viewname);
  end loop;
  -- every function we ever created in public (names are ours only)
  for r in select p.oid::regprocedure::text as sig
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.prokind = 'f'
              and not exists (select 1 from pg_depend d
                               where d.objid = p.oid and d.deptype = 'e')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end
$$;

drop table if exists
  public.settings, public.admins, public.audit_log, public.announcements,
  public.blocked_accounts, public.removed_records,
  public.push_subscriptions, public.invites,
  public.user_badges, public.badge_definitions, public.weekly_ranks,
  public.report_messages, public.reports, public.comments,
  public.tag_search_buckets, public.skill_early_views, public.skill_views_recent,
  public.skill_country_views, public.skill_daily_stats,
  public.user_interests, public.skill_updates, public.stars, public.follows,
  public.skill_tags, public.tags, public.skills, public.profiles, public.categories
  cascade;

drop policy if exists "images: owner can list own folder"  on storage.objects;
drop policy if exists "images: owner can delete own files" on storage.objects;
drop policy if exists "skill avatars: owner can upload"    on storage.objects;
drop policy if exists "skill avatars: owner can view own"  on storage.objects;
drop policy if exists "skill avatars: owner can update"    on storage.objects;
drop policy if exists "skill avatars: owner can delete"    on storage.objects;

-- ---------------------------------------------------------------------
-- 1. SETTINGS (every number you may want to change later lives here;
--    the admin panel edits this table, nobody else can)
-- ---------------------------------------------------------------------
create table public.settings (
  key   text primary key,
  value jsonb not null,
  note  text
);

insert into public.settings (key, value, note) values
  ('min_github_age_days',     '90',   'GitHub account must be at least this old'),
  ('skill_start_limit',       '25',   'skills a new developer may publish'),
  ('skill_limit_cap',         '150',  'maximum skills per developer after all ladder steps'),
  ('ladder_step_size',        '5',    'extra skill slots per ladder step'),
  ('ladder_views_per_step',   '100',  'step k needs every skill to have this x k views'),
  ('ladder_followers_per_step','10',  'step k needs this x k followers'),
  ('invitees_per_slot',       '10',   'active invitees needed for +1 skill slot'),
  ('view_repeat_hours',       '6',    'one view per person per skill per this many hours'),
  ('comment_life_hours',      '120',  'unpinned comments disappear after this'),
  ('comment_max_pins',        '3',    'pinned comments per skill'),
  ('comment_daily_total',     '30',   'comments + replies one person may write per rolling 24 h'),
  ('report_daily_total',      '10',   'reports one person may file per rolling 24 h'),
  ('report_answer_days',      '10',   'days the developer has to answer a report'),
  ('skill_edit_days',         '10',   'days between two edits of one skill'),
  ('profile_edit_days',       '30',   'days between two edits of the channel'),
  ('country_change_days',    '90',   'days between two country changes'),
  ('delete_undo_hours',       '12',   'a deleted skill can be restored within this'),
  ('custom_tag_visible_hours','120',  'custom tag stays in the pickers this long after last use'),
  ('follow_limit',           '200',   'people one account may follow'),
  ('star_limit',             '300',   'skills one account may star'),
  ('trending_tags_count',    '20',    'tags in the trending strip'),
  ('show_real_counts',       'true',  'landing page shows the real numbers'),
  ('signup_paused',          'false', 'true = new people cannot create an account'),
  ('read_only_mode',         'false', 'true = nobody can write anything'),
  ('push_min_views',         '10000', 'receiver needs a skill with this many views for push'),
  ('push_min_followers',     '100',   'and this many followers'),
  ('push_daily_max',         '3',     'push messages per person per day'),
  ('blue_tick_followers',    '1000000','followers for Blue Tick'),
  ('master_tick_blue_followers','100','Blue-Tick followers needed for Master Tick'),
  ('master_tick_countries',  '10',    'different countries those followers must come from'),
  ('public_dashboard_months','3',     'months after first skill before the public ranking shows'),
  ('blocked_after_removals', '3',     'admin-removed skills before the account is blocked');

-- ---------------------------------------------------------------------
-- 2. ADMINS (you add yourself in file 3; the website never writes here)
-- ---------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PROFILES = the developer's "channel"
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  github_id       bigint unique,
  github_username text,
  github_created_at timestamptz,               -- filled by the account-gate function
  gate_ok         boolean not null default false, -- true only after the 3-month check passed
  display_name    text check (display_name is null or char_length(display_name) between 2 and 30),
  bio             text check (bio is null or char_length(bio) <= 150),
  self_tags       text[] not null default '{}'
                  check (cardinality(self_tags) <= 5),
  avatar_url      text,                        -- GitHub photo link (not shown by default)
  logo_path       text,                        -- uploaded logo (set only by save-image function)
  logo_zoom       numeric(3,2) not null default 1 check (logo_zoom between 1 and 3),
  logo_x          int not null default 0 check (logo_x between -100 and 100),
  logo_y          int not null default 0 check (logo_y between -100 and 100),

  country         char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  country_set_at  timestamptz,
  hide_public     boolean not null default false,  -- hide from public search / Google

  followers_count int    not null default 0,
  following_count int    not null default 0,
  skills_count    int    not null default 0,
  total_stars     int    not null default 0,
  total_views     bigint not null default 0,
  first_skill_at  timestamptz,                     -- starts the 3-month clock for rank badges

  blue_tick       boolean not null default false,
  master_tick     boolean not null default false,
  best_weekly_band int check (best_weekly_band is null or best_weekly_band in (10,20,30,40,50)),

  invite_code     text unique,
  invited_by      uuid references public.profiles(id) on delete set null,
  invite_prompt_done boolean not null default false,
  extra_slots     int not null default 0,          -- from invitees

  blocked         boolean not null default false,
  removed_count   int not null default 0,          -- admin-removed skills
  last_profile_edit timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index profiles_username_idx on public.profiles (lower(github_username));
create index profiles_followers_idx on public.profiles (followers_count desc);

-- ---------------------------------------------------------------------
-- 4. TAGS (15 fixed main topics + free custom tags on levels 2 and 3)
--    level 1 = topic (3 per skill), level 2 = subtopic (9), level 3 = detail (27)
-- ---------------------------------------------------------------------
create table public.tags (
  id           bigint generated always as identity primary key,
  level        smallint not null check (level between 1 and 3),
  slug         text not null check (slug ~ '^[a-z0-9][a-z0-9 +#.-]{0,29}$'),
  label        text not null check (char_length(label) between 1 and 30),
  is_preset    boolean not null default false,   -- preset tags are always visible
  uses_count   int not null default 0,
  last_used_at timestamptz,
  unique (level, slug)
);
create index tags_picker_idx on public.tags (level, is_preset, last_used_at desc);

insert into public.tags (level, slug, label, is_preset) values
  (1, 'programming',  'Programming Languages',     true),
  (1, 'web-frontend', 'Web & Frontend',            true),
  (1, 'backend-api',  'Backend & APIs',            true),
  (1, 'mobile-desktop','Mobile & Desktop Apps',    true),
  (1, 'ai-agents',    'AI & Agents',               true),
  (1, 'data-db',      'Data & Databases',          true),
  (1, 'devops-cloud', 'DevOps & Cloud',            true),
  (1, 'security',     'Security & Privacy',        true),
  (1, 'automation',   'Automation & Productivity', true),
  (1, 'writing',      'Writing & Content',         true),
  (1, 'documents',    'Documents & Files',         true),
  (1, 'design',       'Design & Creative',         true),
  (1, 'research',     'Research & Learning',       true),
  (1, 'business',     'Business & Finance',        true),
  (1, 'education',    'Education & Teaching',      true);

-- ---------------------------------------------------------------------
-- 5. SKILLS
--    Rows are CREATED only by the add-skill function (it checks GitHub).
-- ---------------------------------------------------------------------
create table public.skills (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references public.profiles(id) on delete cascade,

  github_repo_id     bigint not null unique,
  github_node_id     text   not null,
  github_owner_id    bigint not null,
  github_owner_login text,
  repo_full_name     text   not null,
  repo_url           text   not null
    check (repo_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  is_fork            boolean not null default false,
  repo_pushed_at     timestamptz,

  name        text not null check (char_length(name)       between 2  and 15),
  short_desc  text not null check (char_length(short_desc) between 10 and 150),
  long_desc   text not null check (char_length(long_desc)  between 30 and 1500),

  image_path  text,
  image_zoom  numeric(3,2) not null default 1 check (image_zoom between 1 and 3),
  image_x     int not null default 0 check (image_x between -100 and 100),
  image_y     int not null default 0 check (image_y between -100 and 100),

  star_count      int    not null default 0,
  views_total     bigint not null default 0,
  downloads_total bigint not null default 0,
  comment_count   int    not null default 0,
  popularity      int    not null default 0,   -- refreshed by cron
  strength_tier   smallint not null default 2 check (strength_tier in (1,2,3)), -- 3 high, 2 mid, 1 low

  verified      boolean not null default false,  -- "Owner verified"
  verified_at   timestamptz,
  status        text not null default 'active'
                check (status in ('active', 'hidden', 'under_review', 'removed')),
  missing_count int  not null default 0,
  last_checked  timestamptz,

  last_edited_at timestamptz,
  deleted_at     timestamptz,                    -- soft delete (12-hour undo)

  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_desc, ''))
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skills_owner_idx      on public.skills (owner_id) where deleted_at is null;
create index skills_owner_gh_idx   on public.skills (github_owner_id);
create index skills_popularity_idx on public.skills (popularity desc) where status = 'active' and deleted_at is null;
create index skills_tier_idx       on public.skills (strength_tier, popularity desc) where status = 'active' and deleted_at is null;
create index skills_created_idx    on public.skills (created_at desc);
create index skills_search_idx     on public.skills using gin (search);
create index skills_deleted_idx    on public.skills (deleted_at) where deleted_at is not null;

create table public.skill_tags (
  skill_id uuid   not null references public.skills(id) on delete cascade,
  tag_id   bigint not null references public.tags(id)   on delete cascade,
  level    smallint not null check (level between 1 and 3),
  primary key (skill_id, tag_id)
);
create index skill_tags_tag_idx on public.skill_tags (tag_id, skill_id);

-- ---------------------------------------------------------------------
-- 6. SOCIAL
-- ---------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, created_at desc);

create table public.stars (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  skill_id   uuid not null references public.skills(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
create index stars_skill_idx on public.stars (skill_id);

-- Updates page: only three kinds
create table public.skill_updates (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.skills(id)   on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('post', 'edit', 'update')),
  note       text check (note is null or char_length(note) <= 140),
  event_day  date not null default current_date,
  created_at timestamptz not null default now(),
  unique (skill_id, kind, event_day)
);
create index skill_updates_owner_idx on public.skill_updates (owner_id, created_at desc);

-- tiny private "interest card": one score per main topic slug
create table public.user_interests (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  scores     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. COMMENTS (200 chars, reply 100, unpinned ones expire)
-- ---------------------------------------------------------------------
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.skills(id)   on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 200),
  pinned     boolean not null default false,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_skill_idx  on public.comments (skill_id, created_at desc);
create index comments_author_idx on public.comments (author_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. VIEWS AND COUNTERS (small, short-lived)
-- ---------------------------------------------------------------------
-- remembers who looked at what for the last few hours (rows older than 6 h are purged)
create table public.skill_views_recent (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  skill_id  uuid not null references public.skills(id)   on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
create index skill_views_recent_at_idx on public.skill_views_recent (viewed_at);

-- views of a skill per viewer country (numbers only, no person)
create table public.skill_country_views (
  skill_id uuid not null references public.skills(id) on delete cascade,
  country  char(2) not null,
  n        bigint not null default 0,
  primary key (skill_id, country)
);

-- first-7-day windows, cumulative, deleted after the badge check
create table public.skill_early_views (
  skill_id uuid primary key references public.skills(id) on delete cascade,
  v60  int not null default 0,     -- views in the first 60 minutes
  v24h int not null default 0,     -- first 24 hours
  v72h int not null default 0,
  v168h int not null default 0
);

create table public.skill_daily_stats (
  skill_id  uuid not null references public.skills(id) on delete cascade,
  day       date not null,
  downloads int  not null default 0,
  views     int  not null default 0,
  primary key (skill_id, day)
);

-- what people searched: one counter per tag per 6-hour bucket
create table public.tag_search_buckets (
  tag_id bigint not null references public.tags(id) on delete cascade,
  bucket timestamptz not null,
  n      int not null default 0,
  primary key (tag_id, bucket)
);
create index tag_search_bucket_idx on public.tag_search_buckets (bucket);

-- ---------------------------------------------------------------------
-- 9. REPORTS (reporter stays hidden from the developer)
-- ---------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  skill_id    uuid references public.skills(id)   on delete cascade,
  channel_id  uuid references public.profiles(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason      text not null check (reason in
              ('malware','hacking_tool','illegal','violence_terror','copyright','spam_fake','other')),
  note        text check (note is null or char_length(note) <= 150),
  serious     boolean not null default false,       -- serious = skill hidden at once
  status      text not null default 'open'
              check (status in ('open','answered','accepted','closed_by_admin','expired')),
  respond_by  timestamptz not null,
  push_sent   boolean not null default false,       -- the single "3 days left" push
  dev_choice  text check (dev_choice is null or dev_choice in
              ('fixed','removed','disagree','fork_credit','report_false','need_info')),
  dev_reply   text check (dev_reply is null or char_length(dev_reply) <= 1500),
  dev_replied_at timestamptz,
  admin_decision text,
  admin_note  text check (admin_note is null or char_length(admin_note) <= 1500),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((skill_id is not null)::int + (channel_id is not null)::int = 1)
);
create index reports_skill_idx    on public.reports (skill_id, created_at desc);
create index reports_channel_idx  on public.reports (channel_id, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_open_idx     on public.reports (respond_by) where status in ('open','answered');

-- extra messages in a report conversation (developer follow-up, admin note)
create table public.report_messages (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  from_role  text not null check (from_role in ('developer','admin')),
  body       text not null check (char_length(body) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index report_messages_idx on public.report_messages (report_id, created_at);

-- ---------------------------------------------------------------------
-- 10. BADGES
-- ---------------------------------------------------------------------
create table public.badge_definitions (
  key       text primary key,
  name      text not null,
  tier      text not null check (tier in ('gold','platinum','heroic','diamond','master')),
  field     text not null,
  is_weekly boolean not null default false,
  band      int check (band is null or band in (10,20,30,40,50)),
  rule      jsonb not null default '{}'::jsonb,   -- thresholds, filled in file 3
  active    boolean not null default true
);

create table public.user_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_key  text not null references public.badge_definitions(key),
  earned_at  timestamptz not null default now(),
  reason     text,                                -- "what he did" shown when the badge is clicked
  source_skill_id uuid,                           -- skill that earned it (for revoke after removal)
  revoked_at timestamptz,
  revoked_reason text,
  primary key (user_id, badge_key)
);
create index user_badges_skill_idx on public.user_badges (source_skill_id) where source_skill_id is not null;

-- weekly leaderboard snapshots (kept 8 weeks)
create table public.weekly_ranks (
  week_no int  not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank    int  not null,
  score   bigint not null default 0,
  primary key (week_no, user_id)
);
create index weekly_ranks_rank_idx on public.weekly_ranks (week_no, rank);

-- ---------------------------------------------------------------------
-- 11. REFERRALS, PUSH, ANNOUNCEMENTS, ADMIN RECORDS
-- ---------------------------------------------------------------------
create table public.invites (
  invitee_id uuid primary key references public.profiles(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_active  boolean not null default false,     -- becomes true when invitee publishes a skill
  check (invitee_id <> inviter_id)
);
create index invites_inviter_idx on public.invites (inviter_id);

create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body_md    text not null check (char_length(body_md) <= 100000),
  pinned     boolean not null default false,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.blocked_accounts (
  github_id  bigint primary key,
  reason     text,
  blocked_at timestamptz not null default now()
);

-- minimal legal record after removal or deletion (purged after 180 days)
create table public.removed_records (
  id         uuid primary key default gen_random_uuid(),
  github_id  bigint,
  kind       text not null,
  ref        text,
  reason     text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  uuid,
  action text not null,
  target text,
  detail jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------
-- 12. SECURITY: nobody reads or writes tables directly from the website.
--     (RLS on + no grants + no policies = closed. File 2 adds safe functions.)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 13. IMAGE STORAGE: one public bucket, max 10 KB (Master Tick holders
--     are the biggest allowed). The save-image function enforces the real
--     per-person limit (3 KB normal, 10 KB for ticks) and checks every file.
--     Files are written ONLY by that function; a person may list/delete
--     only inside their own folder.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'skilltube-images',
  'skilltube-images',
  true,
  10240,
  array['image/svg+xml', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "images: owner can list own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'skilltube-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "images: owner can delete own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'skilltube-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Done. Now run skilltube-sql-2-functions.sql
