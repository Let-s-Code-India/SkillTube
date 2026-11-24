# Architecture

Cloudflare Workers Assets serves the app shell and static pages. The Worker
handles public developer, skill, topic and directory routes before falling back
to assets. The browser calls Supabase only through `public/js/api.js`, using
exposed RPCs and Edge Functions; it never reads tables directly.

The public blog is authored in `content/why/` and indexed by
`public/why-skilltube/posts.json`. `tools/make-post.mjs` renders each article at
commit time with the vendored Markdown parser and DOMPurify, then writes static
HTML. Visitors do not fetch or render Markdown. The Worker reads the same
metadata file to include all article URLs in `sitemap-pages.xml`.
