# Architecture

SkillTube serves a static web application and public content through an edge
host. A separate data service provides controlled operations to the browser and
public page renderer. Access to stored data is restricted; privileged actions
are validated and authorized on the server.

Public articles are built from repository content before deployment, then
published as static pages. This keeps content rendering predictable and avoids
runtime Markdown processing for those pages.

## Decisions

- Keep public content static where practical for accessibility, speed, and
  predictable deployment.
- Route browser data changes through controlled operations with server-side
  validation and authorization.
- Keep database and server implementation details outside the public source
  tree.
