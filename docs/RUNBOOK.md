# Runbook

Cloudflare Workers Builds deploys the static assets and Worker from `main`.
The catalog workflow runs every six hours and also supports manual dispatch; it
needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` repository secrets. Do not
run or redeploy the existing Supabase SQL or Edge Functions. Before enabling
the backup schedule, configure its repository secrets and a private backup
repository.

## Local checks

The site has no visitor-side build step. Optional Node tooling supports the
commit-time blog generator and repository checks:

```sh
npm ci
npm run check:posts
npm run check:schema
npm run check:links
npm run check:responsive
npm run check:docs
npm run check:worker
npm run check:security
node tools/stamp-footer.mjs --check
node tools/check-public-location.mjs
```

After editing a Markdown article or `public/why-skilltube/posts.json`, run
`npm run generate:posts`, then rerun the checks. GitHub Actions runs the schema
and link workflows on pushes and pull requests.

Workers Builds runs `npm run generate:llms-source` before deploying. Run the
same command locally after FAQ, article, guide or topic changes to inspect the
generated public metadata consumed by `/llms.txt`.
