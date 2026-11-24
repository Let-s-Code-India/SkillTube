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

## Edge Functions

- `account-gate` — POST, user JWT. Captures GitHub account age and account status.
- `set-country` — POST, user JWT. Changes private country with a 90-day lock.
- `add-skill` — POST, user JWT. Validates GitHub ownership and creates a listing.
- `save-image` — POST `multipart/form-data`, user JWT. Uploads or removes an
  approved profile or listing image.

The provider token is captured from `session.provider_token` and kept in memory
or sessionStorage. It is sent only to `add-skill` and account-gate.
