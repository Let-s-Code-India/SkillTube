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
  `CANNOT_REPORT_OWN`, `CANNOT_STAR_OWN`, `CANNOT_FOLLOW_SELF`,
  `NOT_YOURS`, `NOT_YOUR_SKILL`, `REPORT_ONE_TARGET`, `BAD_REASON`,
  `NOTE_TOO_LONG`, `BAD_CHOICE`, `REPLY_TOO_LONG`, `REPORT_CLOSED`,
  `REPORT_NOT_FOUND`, `PARENT_NOT_FOUND`, `PIN_LIMIT`, `PIN_ONLY_COMMENTS`

## Administration

- `NOT_ADMIN`, `NOT_ADMIN_WRITER`, `INVITE_*`, `BAD_REASON`, `BAD_ACTION`
- `OWNER_ONLY`, `REASON_REQUIRED`, `NOT_A_SKILL_REPORT`, `BAD_DECISION`,
  `ONE_TARGET`, `UNKNOWN_SETTING`, `WRONG_TYPE`, `USER_NOT_FOUND`, `BAD_ROLE`
