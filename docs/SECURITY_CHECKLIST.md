# Security Verification Checklist

## Repository checks

- Run `npm run check:security` for CSP, URL, Markdown, header and Worker checks.
- Run `npm run check:links`, `npm run check:responsive`, `npm run check:worker`,
  `npm run check:docs` and `npm run check:schema`.
- Keep Supabase calls behind `public/js/api.js` and friendly mappings behind
  `public/js/errors.js`.
- Do not add database credentials, private keys or Supabase service-role secrets
  to public files or browser code.

## Owner and live-site checks

The repository owner must verify the private deployed backend and live browser
behavior:

- Supabase RLS and RPC authorization for stars, follows, comments, reports,
  admin operations and account deletion.
- Report confidentiality, anonymous reporting, developer response visibility,
  and admin decision access.
- GitHub OAuth configuration, callback URLs and sign-out/session behavior.
- Security headers, CSP reports, mixed-content redirects and cache behavior.
- Country onboarding and profile privacy behavior.
- Live badge jobs, weekly ranking jobs and invite-code limits.
