# Security model

SkillTube follows least-privilege principles. Data access is restricted, and
controlled server-side operations validate requests before changing data.
Administrative access is checked on the server; hiding controls in the
interface is not treated as authorization.

Static and Worker-rendered pages apply a restrictive Content Security Policy
and browser security headers. The site does not store IP addresses. Public
pages avoid exposing private account information. User-submitted text is
handled as untrusted input and sanitized before it is rendered as formatted
content. Secrets are kept out of browser code and public source files.
