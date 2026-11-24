# Error code table

The frontend maps every server code through `public/js/errors.js`. Raw server text
must not be shown. SQL and Edge Functions may add codes; they must be added here
and to `errors.js` before a UI surfaces them.

## Authentication and account

- `LOGIN_REQUIRED` — Please sign in with GitHub first.
- `ACCOUNT_NOT_READY` — Finish account setup and try again.
- `ACCOUNT_BLOCKED` — Account blocked.
- `UNDER_AGE` — SkillTube is for people aged 18 or older.
- `NO_GITHUB` — This account is not linked to GitHub.
- `GITHUB_MISMATCH` — GitHub account mismatch.
- `GITHUB_UNAVAILABLE` — GitHub could not answer.
- `GITHUB_TOKEN_MISSING` — GitHub session expired.

## Country

- `COUNTRY_MISMATCH`
- `COUNTRY_UNVERIFIED`
- `COUNTRY_LOCKED:n`
- `BAD_COUNTRY`

## Publishing and editing

- `PUBLISH_LIMIT:n`, `REPO_ALREADY_LISTED`, `EDIT_LOCKED:n`,
  `NOT_YOUR_SKILL`, `TAGS_COUNT`, `TAGS_DUPLICATE`, `TAGS_BAD_TOPIC`,
  `PICK_THREE_TOPICS`, `READ_ONLY`, `SIGNUPS_PAUSED`

## Community

- `COMMENT_*`, `REPORT_*`, `STAR_LIMIT`, `FOLLOW_LIMIT`,
  `CANNOT_REPORT_OWN`, `NOT_YOURS`, `NOT_YOUR_SKILL`

## Administration

- `NOT_ADMIN`, `NOT_ADMIN_WRITER`, `INVITE_*`, `BAD_REASON`, `BAD_ACTION`
