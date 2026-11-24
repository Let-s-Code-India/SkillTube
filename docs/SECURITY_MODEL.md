# Security model

SkillTube uses a strict CSP, GitHub OAuth, closed Supabase tables, server-side
RPC validation and Edge Functions for GitHub ownership and image processing.
The public browser key is publishable only. Secrets remain outside the browser.
Untrusted text is never inserted as HTML. Markdown is sanitized. The site stores
no IP address and uses no analytics or tracking cookies.
