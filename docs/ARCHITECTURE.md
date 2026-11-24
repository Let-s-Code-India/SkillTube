# Architecture

Browser static assets are hosted by Cloudflare Workers Assets. The Worker renders
public server-side pages and falls back to static assets. The browser calls
Supabase only through `public/js/api.js`, and only RPC or Edge Functions exposed
by the backend. Supabase tables remain closed to direct browser access.
