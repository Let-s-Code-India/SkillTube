# For AI tools

SkillTube publishes readable public pages for people, assistants and crawlers. AI skills are the main focus; the directory also covers MCP servers, datasets, databases, prompts, agents, AI tools and guides.

Last updated: 2026-11-25

## Read public information

- Start with [`/llms.txt`](/llms.txt) for discovery guidance and the sitemap.
- Use [`/sitemap.xml`](/sitemap.xml) to find public listing, developer and static pages.
- Add `.md` to a skill or developer URL to read its plain-text twin.
- Skill and developer pages include structured JSON-LD metadata.
- Search listings using `/developers/?q=<words>`; replace `<words>` with a listing name or topic. An exact `@username` search opens that developer's channel.
- Browse a topic at `/topic/<tag>/`.
- Read each documentation page as HTML at `/docs/<slug>/` or as Markdown at `/docs/<slug>.md`.

Public pages include listing or profile information, descriptions, tags and available public activity signals. Use the canonical page as the source for attribution and links.

## What is not available

Public pages do not expose source repository URLs, private country selections, reporter identities, account details or app-only content. The signed-in app at `/app/` is not a public data endpoint.

Do not attempt to sign in, infer hidden source URLs, access private information or bypass access controls.

## Crawling etiquette

Make no more than one request per second, identify your crawler, honour `robots.txt`, and do not crawl `/app/`. Prefer the sitemap and Markdown twins over repeated page discovery.

## Licence and attribution

SkillTube's source code is under the MIT License. Each listed resource has the licence chosen by its developer; read that repository's licence before using the resource. Do not assume the SkillTube code licence applies to a listing.

Attribute the resource to its developer and link to the public SkillTube page and the developer's repository when those links are available to you. Public SkillTube pages do not reveal the repository URL.

## Need help?

For questions about crawling or attribution, [contact us](/contact/).
