# Documentation

## Visitor guides

The public guides at `/docs/` are authored in `content/docs/*.md` and generated
as static HTML, Markdown twins and `public/docs/docs.json` by
`npm run generate:docs`. Run `npm run check:docs` to verify generated files.

## Public product and developer guidance

- [Architecture](ARCHITECTURE.md) — system boundaries and design decisions.
- [Frontend specification](FRONTEND_SPEC.md) — browser application structure and requirements.
- [Security model](SECURITY_MODEL.md) — security and privacy principles.
- [Security checklist](SECURITY_CHECKLIST.md) — repository and owner/live checks.
- [Error codes](ERROR_CODES.md) — user-facing handling for server error codes.
- [Runbook](RUNBOOK.md) — deployment notes and repository checks.

The database schema and Edge Functions are maintained privately and are not
included in this public repository.
