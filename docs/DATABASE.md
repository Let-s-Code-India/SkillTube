# Database contract

The browser never reads Supabase tables. It may call only the public RPC functions
and Edge Functions documented here. Private tables and storage operations stay
behind Supabase Row Level Security or deployed Edge Functions.

## Anonymous RPC functions

- `public_search(p_q text, p_page int default 0)` — public search results.
- `public_skill(p_skill uuid)` — public listing details.
- `public_developer(p_username text)` — public developer channel.
- `public_settings()` — public settings, including image rules.
- `public_stats()` — public directory totals.
- `trending_tags()` — public trending tags.
- `dashboard()` — public signed-in dashboard data.
  Returns JSON with `state` (`empty` or `live`), `week`, `top` (ranked
  public developers), and `me` for a signed-in ready account. `me.state`
  is `no_skill`, `waiting` (with `live_on` and `days_left`) or `live`
  (with `rank`, `score`, and `best_band`). This function is callable
  anonymously and by logged-in users; use `top` for the public leaderboard
  and `me` for the app dashboard.
- `badge_catalog()` — public badge rules.
- `public_sitemap(p_kind text, p_page int default 0)` — public sitemap records.

Call anonymous functions only through `public/js/api.js`.

## Signed-in RPC functions

The SQL source of truth includes account, publishing, community, report, update,
badge, ranking and admin functions. Frontend calls must use the exact SQL names
and arguments. High-level groups include `me`, `create_skill`, `edit_skill`,
`delete_skill`, `set_country`, `update_my_profile`, `toggle_star`, `toggle_follow`,
`add_comment`, `list_comments`, `file_report`, `dev_answer_report`, `my_skills`,
`my_updates_feed`, `mark_all_seen`, `record_view`, and `get_download_link`.

`dashboard()` is public callable per the backend summary. Admin operations require
`is_admin` or `is_admin_writer` server-side checks.

## Follow and seen-by-username RPCs

- `follow_by_username(p_username text)` — signed-in users only. Resolves an
  eligible developer by case-insensitive GitHub username and returns the same
  JSON as `toggle_follow(p_dev uuid)`.
- `mark_developer_seen_by_username(p_username text)` — signed-in users only.
  Resolves an eligible developer and marks their followed updates seen.
- `file_report_channel_by_username(p_username text, p_reason text, p_note text
  default null)` — signed-in users only. Resolves an eligible developer and
  records a channel report with the same validation and anonymous reporter
  handling as `file_report`.

Both functions require authentication, reject missing/blocked developers with
`DEVELOPER_NOT_FOUND`, and grant execute only to `authenticated` and
`service_role`. Use these when the UI has a username but must not expose the
developer UUID.

## Edge Functions

- `account-gate` — POST, user JWT. Captures GitHub account age and account status.
- `set-country` — POST, user JWT. Changes private country with a 90-day lock.
- `add-skill` — POST, user JWT. Validates GitHub ownership and creates a listing.
- `save-image` — POST `multipart/form-data`, user JWT. Uploads or removes an
  approved profile or listing image.

The provider token is captured from `session.provider_token` and kept in memory
or sessionStorage. It is sent only to `add-skill` and account-gate.

## Backend requests

- Store the 18+ and Terms/Privacy acceptance timestamp on the profile. The
  frontend currently keeps this convenience flag in localStorage only.
- Store age/Terms acceptance server-side if the product later requires a
  durable audit record instead of the current localStorage convenience flag.
