# Security model

SkillTube uses a strict CSP, GitHub OAuth, closed Supabase tables, server-side
RPC validation and Edge Functions for GitHub ownership and image processing.
The public browser key is publishable only. Secrets remain outside the browser.
User- and repository-supplied descriptions are escaped as text on public
Worker pages; authored blog Markdown is rendered at commit time with the
vendored `marked` parser and sanitized with vendored DOMPurify. The blog
sanitizer allows only text formatting and safe links, without images or frames.
The site stores no IP address and uses no analytics or tracking cookies.
