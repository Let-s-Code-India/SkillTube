// =====================================================================
// SkillTube | Cloudflare Worker  (version 1)
//
// Draws the public pages that Google, AI tools and visitors without login
// can read. The pages are made on request from the database "window"
// functions (public_skill, public_developer, public_search, public_sitemap).
// They never contain the download link, the repository link, a country or
// any private data. People and robots get exactly the same page.
//
//   /skill/<id>          one skill          (/skill/<id>.md = plain text version)
//   /dev/<username>      one developer      (/dev/<username>.md)
//   /developers/?q=      search form + results   (@name opens the developer)
//   /sitemap.xml, /sitemap-pages.xml, /sitemap-skills-N.xml, /sitemap-devs-N.xml
//   /robots.txt, /llms.txt
//
// Everything else (the app, images, css, js) is served as static files.
// Pages are cached at Cloudflare, so Supabase is asked only now and then.
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const SITEMAP_PAGE = 5000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    try {
      let m;
      if (path === "/robots.txt") return robots(env, url);
      if (path === "/llms.txt") return llms(env, url);
      if (path === "/sitemap.xml" || path.startsWith("/sitemap-")) return cached(request, ctx, () => sitemap(env, url, path), 3600);
      if ((m = path.match(/^\/topic\/([A-Za-z0-9-]+)\/?$/))) return cached(request, ctx, () => topicPage(env, url, m[1]), 600);
      if (path === "/leaderboard" || path === "/leaderboard/") return cached(request, ctx, () => leaderboardPage(env, url), 600);
      if (path === "/badges" || path === "/badges/") return cached(request, ctx, () => badgesPage(env, url), 600);
      if ((m = path.match(/^\/skill\/([0-9a-fA-F-]{36})(\.md)?$/))) return cached(request, ctx, () => skillPage(env, url, m[1], !!m[2]), 900);
      if ((m = path.match(/^\/dev\/([A-Za-z0-9-]{1,39})(\.md)?$/))) return cached(request, ctx, () => devPage(env, url, m[1], !!m[2]), 900);
      if (path === "/developers" || path === "/developers/") return developers(request, env, ctx, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return new Response("SkillTube is busy for a moment. Please try again in a minute.", {
        status: 503, headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  },
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bytesToHex = (b) => Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
const clip = (s, n) => { const a = Array.from(String(s ?? "").replace(/\s+/g, " ").trim()); return a.length <= n ? a.join("") : a.slice(0, n - 1).join("") + "…"; };
const site = (env, url) => (env.SITE_URL || url.origin).replace(/\/$/, "");
const num = (n) => Number(n ?? 0).toLocaleString("en-US");

async function rpc(env, fn, args) {
  const key = env.SUPABASE_ANON_KEY || "";
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args ?? {}) });
  if (!r.ok) throw new Error(fn + " " + r.status);
  return r.json();
}

// serve from the Cloudflare cache when possible
async function cached(request, ctx, make, ttl) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
  const res = await make();
  if (res.status === 200 || res.status === 404) {
    const copy = new Response(res.body, res);
    const age = res.status === 200 ? ttl : 60;
    copy.headers.set("Cache-Control", `public, max-age=300, s-maxage=${age}`);
    ctx.waitUntil(cache.put(key, copy.clone()));
    return request.method === "HEAD" ? new Response(null, copy) : copy;
  }
  return res;
}

const SEC = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
function html(env, body, status = 200) {
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  body = body.replaceAll("__CSP_NONCE__", nonce);
  return new Response(body, {
    status,
    headers: {
      ...SEC,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; script-src-elem 'nonce-${nonce}'; style-src 'self'; img-src 'self' ${env.SUPABASE_URL} https://avatars.githubusercontent.com data:; connect-src 'self' ${env.SUPABASE_URL}; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    },
  });
}
function plain(body, type, status = 200) {
  return new Response(body, { status, headers: { ...SEC, "Content-Type": type + "; charset=utf-8" } });
}

const imgUrl = (env, p) => (p ? `${env.SUPABASE_URL}/storage/v1/object/public/skilltube-images/${p}` : null);

// badge / tick picture files come from /image/catalog.json (so the files can be renamed without code changes)
let CAT = null, CAT_AT = 0;
async function catalog(env, url) {
  if (CAT && Date.now() - CAT_AT < 600000) return CAT;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/image/catalog.json", url).toString()));
    if (r.ok) {
      const c = await r.json(); const map = {};
      for (const k of ["badges", "weekly", "ticks"]) for (const b of c[k] || []) map[b.key] = "/image/" + b.file;
      CAT = map; CAT_AT = Date.now();
    }
  } catch (_) { /* pictures are optional */ }
  return CAT || {};
}

function layout(env, url, o) {
  const base = site(env, url);
  const canon = o.canonical ? base + o.canonical : null;
  return html(env, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
${o.noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
${o.md ? `<link rel="alternate" type="text/markdown" href="${esc(base + o.md)}">` : ""}
<meta property="og:type" content="${o.ogType || "website"}"><meta property="og:site_name" content="SkillTube"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">
${canon ? `<meta property="og:url" content="${esc(canon)}">` : ""}<meta property="og:image" content="${esc(o.image || base + "/og-image.png")}">
<meta property="og:image:width" content="2658"><meta property="og:image:height" content="1634">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(o.image || base + "/og-image.png")}">
<link rel="icon" href="/image/app/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/worker.css">
${o.ld ? `<script nonce="__CSP_NONCE__" type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, "\\u003c")}</script>` : ""}
</head><body>
<header><a class="brand" href="/">SkillTube</a><nav><a href="/developers/">Developers</a><a href="/">Sign in</a></nav></header>
<main>${o.body}</main>
<footer>© 2026 Let's Code India. <a href="/legal/privacy/">Privacy</a> · <a href="/legal/terms/">Terms</a> · <a href="/legal/community-guidelines/">Community Guidelines</a> · <a href="/legal/cookies/">Cookies</a> · <a href="/legal/security/">Security</a> · <a href="/brand/">Licenses</a> · <a href="/contact/">Contact</a> · <a href="/faq/">FAQ</a> · <a href="/why-skilltube/">Why SkillTube</a><br>Source code under the MIT License.</footer>
</body></html>`, o.status || 200);
}

function frame(env, im, name) {
  const u = imgUrl(env, im && im.path);
  if (!u) return `<div class="frame"><div class="ph">${esc(Array.from(name || "?")[0] || "?")}</div></div>`;
  return `<div class="frame"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy"></div>`;
}

function skillCard(env, s) {
  return `<a class="card" href="/skill/${esc(s.id)}">${frame(env, s.image, s.name)}<div class="body"><b>${esc(s.name)}</b>
<span class="mut">${esc(clip(s.short_desc, 110))}</span><br><small class="mut">by @${esc(s.developer.username)} · ${num(s.views)} views</small></div></a>`;
}

const paras = (t) => String(t ?? "").split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");

// ------------------------------------------------------------ skill page
async function skillPage(env, url, id, md) {
  if (!UUID_RE.test(id)) return notFound(env, url);
  const s = await rpc(env, "public_skill", { p_skill: id.toLowerCase() });
  if (!s) return notFound(env, url);
  const base = site(env, url), canon = `/skill/${s.id}`, dev = s.developer;
  const tags = [...(s.tags?.t1 || []), ...(s.tags?.t2 || []), ...(s.tags?.t3 || [])];
  if (md) {
    return plain(`# ${s.name}\n\n${s.short_desc}\n\nBy ${dev.name || dev.username} (@${dev.username}) - ${base}/dev/${dev.username}\n\nViews: ${s.views} | Stars: ${s.stars}\n\n## About\n\n${s.long_desc}\n\n## Topics\n\n${tags.join(", ")}\n\nPage: ${base}${canon}\n`, "text/markdown");
  }
  const im = imgUrl(env, s.image && s.image.path);
  const typeText = tags.join(" ").toLowerCase();
  const ldType = /dataset|database|vector store|embedding|benchmark/.test(typeText) ? "Dataset" : "SoftwareSourceCode";
  const ld = {
    "@context": "https://schema.org", "@type": ldType, name: s.name, description: s.short_desc,
    url: base + canon,
    author: { "@type": "Person", name: dev.name || dev.username, alternateName: "@" + dev.username, url: `${base}/dev/${dev.username}` },
    keywords: tags.join(", "), dateCreated: s.created_at, dateModified: s.updated_at,
    ...(im ? { image: im } : {}),
    interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: s.views }],
  };
  const chip = (t) => `<a href="/developers/?q=${encodeURIComponent(t)}">${esc(t)}</a>`;
  const body = `<article>
<div class="hero"><div class="skill-detail-image">${frame(env, s.image, s.name)}</div>
<div class="skill-detail-copy"><h1>${esc(s.name)}</h1>
<p class="mut">by <a href="/dev/${esc(dev.username)}">${esc(dev.name || dev.username)}</a> (@${esc(dev.username)})</p>
<p>${esc(s.short_desc)}</p>
<p class="mut">${num(s.views)} views · ${num(s.stars)} stars · ${num(s.comments)} comments${s.verified ? " · owner verified" : ""}</p></div></div>
<h2>About this skill</h2>${paras(s.long_desc)}
${["t1", "t2", "t3"].map((k, i) => (s.tags?.[k]?.length ? `<h2>${["Topics", "Subtopics", "Details"][i]}</h2><div class="chips">${s.tags[k].map(chip).join("")}</div>` : "")).join("")}
<div class="cta"><b>Want to use it?</b><p class="mut">Sign in with GitHub to open this skill's download link. It is free.</p><a class="btn" href="/app/#/skill/${esc(s.id)}">Sign in with GitHub</a></div>
</article>`;
  return layout(env, url, { title: `${s.name} - skill by @${dev.username} | SkillTube`, desc: clip(s.short_desc, 155), canonical: canon, md: canon + ".md", image: im, ld, body, ogType: "article" });
}

// -------------------------------------------------------- developer page
async function devPage(env, url, name, md) {
  if (!USER_RE.test(name)) return notFound(env, url);
  const d = await rpc(env, "public_developer", { p_username: name });
  if (!d) return notFound(env, url);
  const base = site(env, url), canon = `/dev/${d.username}`;
  const label = d.name || d.username;
  if (md) {
    const lines = (d.skills || []).map((s) => `- ${s.name}: ${s.short_desc} (${base}/skill/${s.id})`).join("\n");
    return plain(`# ${label} (@${d.username})\n\n${d.bio || ""}\n\nFollowers: ${d.followers} | Following: ${d.following} | Skills: ${d.skills_count}\n\n## Skills\n\n${lines}\n\nPage: ${base}${canon}\n`, "text/markdown");
  }
  const files = await catalog(env, url);
  const tick = d.tick && files[d.tick] ? `<img class="tick" src="${esc(files[d.tick])}" alt="${d.tick === "tick-master-gold" ? "Master Tick" : "Blue Tick"}">` : "";
  const logo = imgUrl(env, d.logo && d.logo.path);
  const badges = (d.badges || []).map((b) => `<div class="bd">${files[b.key] ? `<img src="${esc(files[b.key])}" alt="${esc(b.name)}" loading="lazy">` : ""}<div><b>${esc(b.name)}</b><small>${esc(b.tier)}${b.weekly ? " · weekly rank" : ""}</small><small>${esc(b.reason || "")}</small></div></div>`).join("");
  const ld = {
    "@context": "https://schema.org", "@type": "ProfilePage", url: base + canon,
    mainEntity: {
      "@type": "Person", name: label, alternateName: "@" + d.username, description: d.bio || undefined,
      url: base + canon, sameAs: [`https://github.com/${d.username}`], ...(logo ? { image: logo } : {}),
      interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/FollowAction", userInteractionCount: d.followers }],
    },
  };
  const body = `<div class="hero"><div class="logo">${logo ? `<img src="${esc(logo)}" alt="${esc(label)}">` : `<div class="ph">${esc(Array.from(label)[0] || "?")}</div>`}</div>
<div><h1>${esc(label)} ${tick}</h1><p class="mut">@${esc(d.username)}</p>${d.bio ? `<p>${esc(d.bio)}</p>` : ""}
<p class="mut">${num(d.followers)} followers · ${num(d.following)} following · ${num(d.skills_count)} skills</p></div></div>
${badges ? `<h2>Badges</h2><div class="badges">${badges}</div>` : ""}
<h2>Skills</h2>${(d.skills || []).length ? `<div class="grid">${d.skills.map((s) => skillCard(env, { ...s, developer: { username: d.username } })).join("")}</div>` : `<p class="mut">No skills yet.</p>`}
<div class="cta"><a class="btn" href="/app/#/dev/${esc(d.username)}">Follow on SkillTube</a></div>`;
  return layout(env, url, { title: `${label} (@${d.username}) - developer on SkillTube`, desc: clip(d.bio || `${label} publishes ${d.skills_count} AI skills on SkillTube.`, 155), canonical: canon, md: canon + ".md", image: logo, ld, body, ogType: "profile" });
}

function notFound(env, url) {
  return layout(env, url, { title: "Not found | SkillTube", desc: "This page does not exist.", noindex: true, status: 404,
    body: `<h1>Not found</h1><p class="mut">This skill or developer is not available.</p><p><a href="/developers/">Search SkillTube</a></p>` });
}

// ------------------------------------------------- search / developers
async function developers(request, env, ctx, url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.min(Math.max(parseInt(url.searchParams.get("page") || "0", 10) || 0, 0), 50);

  // "@name" + Enter opens the developer (exact username)
  if (q.startsWith("@")) {
    const name = q.slice(1).trim();
    if (USER_RE.test(name)) {
      const r = await rpc(env, "public_search", { p_q: "@" + name, p_page: 0 });
      if (r && r.developer && r.developer.username) {
        return new Response(null, { status: 302, headers: { Location: `/dev/${r.developer.username}`, "Cache-Control": "public, max-age=60" } });
      }
    }
    return searchPage(env, url, q, page, [], `No developer named ${q}. Type the full username after @.`);
  }
  const make = async () => {
    const [r, tt] = await Promise.all([rpc(env, "public_search", { p_q: q, p_page: page }), q || page ? Promise.resolve([]) : rpc(env, "trending_tags", {}).catch(() => [])]);
    return searchPage(env, url, q, page, (r && r.items) || [], null, Array.isArray(tt) ? tt : []);
  };
  return cached(request, ctx, make, q ? 120 : 600);
}

function searchPage(env, url, q, page, items, notice, trending = []) {
  const searching = !!q || page > 0;
  const next = items.length >= 20 ? `<p><a href="/developers/?q=${encodeURIComponent(q)}&page=${page + 1}" rel="nofollow">More results</a></p>` : "";
  const tags = (trending || []).slice(0, 20).map((t) => { const label = typeof t === "string" ? t : t.label || t.slug || ""; return label ? `<a href="/developers/?q=${encodeURIComponent(label)}">${esc(label)}</a>` : ""; }).join("");
  const body = `<h1>Developers and AI resources</h1>
<form class="s" method="get" action="/developers/"><input name="q" value="${esc(q)}" placeholder="Skill name or tag. Type @username for a developer" maxlength="80" aria-label="Search"><button type="submit">Search</button></form>
<section class="card"><h2>For developers and AI tools</h2><h3>Be found by people and by AI assistants</h3>
<p>AI crawlers can find repositories on GitHub, but a SkillTube channel gives them your profile and every listing as clean, structured, complete pages.</p>
<p>Publish AI skills, MCP servers, datasets, databases, prompts, agents and AI tools as structured listings. Your code, repository history and licence stay on GitHub.</p></section>
${notice ? `<p class="mut">${esc(notice)}</p>` : ""}
${tags ? `<h2>Trending topics</h2><div class="chips">${tags}</div>` : ""}
<h2>${q ? `Results for "${esc(q)}"` : "Skills"}</h2>
${items.length ? `<div class="grid">${items.map((s) => skillCard(env, s)).join("")}</div>${next}` : `<p class="mut">${q ? "No skills found." : "No skills yet."}</p>`}`;
  return layout(env, url, { title: q ? `Search: ${q} | SkillTube` : "Developers and skills | SkillTube", desc: "Search AI skills by name or topic, or find a developer with @username.", canonical: "/developers/", noindex: searching, body });
}

async function topicPage(env, url, tag) {
  const r = await rpc(env, "public_search", { p_q: tag, p_page: 0 });
  const items = (r && r.items) || [];
  const body = `<h1>${esc(tag)} AI resources</h1><p class="mut">AI skills, MCP servers, datasets, databases, prompts, agents and AI tools tagged ${esc(tag)}.</p>
${items.length ? `<div class="grid">${items.map((s) => skillCard(env, s)).join("")}</div>` : `<p class="mut">No listings found for this topic.</p>`}`;
  const ld = { "@context":"https://schema.org", "@type":"CollectionPage", name:`${tag} AI resources`, description:`AI skills, MCP servers, datasets, databases, prompts, agents and AI tools tagged ${tag}.`, url:site(env,url)+`/topic/${tag}/` };
  return layout(env, url, { title: `${tag} AI resources | SkillTube`, desc: `Discover AI resources tagged ${tag}.`, canonical: `/topic/${tag}/`, ld, body });
}

async function leaderboardPage(env, url) {
  const d = await rpc(env, "dashboard", {}).catch(() => null);
  const rows = d?.top || [];
  const ranked = Array.isArray(rows) ? rows.slice(0,50) : [];
  const bandRows = ranked.map((r) => {
    const rank = Number(r.rank || 0);
    const band = rank <= 10 ? "Apex 10" : rank <= 20 ? "Contender 20" : rank <= 30 ? "Challenger 30" : rank <= 40 ? "Climber 40" : "Rise 50";
    return `<li><span class="mut">${esc(band)}</span> · <a href="/dev/${esc(r.username)}">@${esc(r.username)}</a> — ${esc(r.name || r.username)} · ${num(r.score)}</li>`;
  }).join("");
  const body = `<h1>Weekly leaderboard</h1><p class="mut">The top 50 developers by weekly score.</p>
${d?.state === "live" && ranked.length ? `<ol>${bandRows}</ol>` : `<p class="mut">Weekly rankings are not available yet.</p>`}`;
  return layout(env, url, { title: "Weekly leaderboard | SkillTube", desc: "The weekly top 50 SkillTube developer rankings.", canonical: "/leaderboard/", body });
}

async function badgesPage(env, url) {
  const badges = await rpc(env, "badge_catalog", {}).catch(() => []);
  const files = await catalog(env, url);
  const body = `<h1>Badge catalog</h1><p class="mut">Badges come from real activity rules. They cannot be bought.</p>
<div class="badges">${(Array.isArray(badges) ? badges : []).map((b) => `<article class="bd">${files[b.key] ? `<img src="${esc(files[b.key])}" alt="">` : ""}<div><b>${esc(b.name)}</b><small>${esc(b.how || "")}</small></div></article>`).join("")}</div>`;
  return layout(env, url, { title: "Badges | SkillTube", desc: "Explore SkillTube badges and how to earn them.", canonical: "/badges/", body });
}

// --------------------------------------------------------------- sitemap
async function sitemap(env, url, path) {
  const base = site(env, url);
  const xml = (inner, root) => plain(`<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${inner}</${root}>`, "application/xml");
  if (path === "/sitemap.xml") {
    const [a, b] = await Promise.all([rpc(env, "public_sitemap", { p_kind: "skill", p_page: 0 }), rpc(env, "public_sitemap", { p_kind: "dev", p_page: 0 })]);
    const n = (t) => Math.max(1, Math.ceil((t || 0) / SITEMAP_PAGE));
    let out = `<sitemap><loc>${base}/sitemap-pages.xml</loc></sitemap>`;
    for (let i = 1; i <= n(a.total); i++) out += `<sitemap><loc>${base}/sitemap-skills-${i}.xml</loc></sitemap>`;
    for (let i = 1; i <= n(b.total); i++) out += `<sitemap><loc>${base}/sitemap-devs-${i}.xml</loc></sitemap>`;
    return xml(out, "sitemapindex");
  }
  if (path === "/sitemap-pages.xml") {
    const pages = ["/","/developers/","/leaderboard/","/badges/","/faq/","/why-skilltube/","/about/","/help/","/contact/","/changelog/","/brand/","/status/","/legal/privacy/","/legal/terms/","/legal/community-guidelines/","/legal/acceptable-use/","/legal/copyright/","/legal/content-license/","/legal/cookies/","/legal/disclaimer/","/legal/grievance/","/legal/security/"];
    return xml(pages.map((p) => `<url><loc>${base}${p}</loc></url>`).join(""), "urlset");
  }
  const m = path.match(/^\/sitemap-(skills|devs)-(\d{1,4})\.xml$/);
  if (!m) return notFound(env, url);
  const r = await rpc(env, "public_sitemap", { p_kind: m[1] === "skills" ? "skill" : "dev", p_page: Number(m[2]) - 1 });
  const out = (r.items || []).map((it) => `<url><loc>${base}/${m[1] === "skills" ? "skill" : "dev"}/${esc(it.k)}</loc>${it.t ? `<lastmod>${esc(String(it.t).slice(0, 10))}</lastmod>` : ""}</url>`).join("");
  return xml(out, "urlset");
}

function robots(env, url) {
  const base = site(env, url);
  return plain(`User-agent: *\nAllow: /\nDisallow: /developers/?*q=\nDisallow: /developers/?*page=\n\nSitemap: ${base}/sitemap.xml\n`, "text/plain");
}

function llms(env, url) {
  const base = site(env, url);
  return plain(`# SkillTube

> SkillTube is a free, open discovery layer for AI skills, MCP servers, datasets, databases, prompts, agents and AI tools. Every listing lives in its own public GitHub repository. Pages here show the name, description, topics, views and the developer. Download links are shown only after signing in with GitHub.

## Where to read
- [All skills and search](${base}/developers/): search by skill name or topic; type @username to find a developer
- [Sitemap](${base}/sitemap.xml): every public skill and developer page
- Every skill page is /skill/<id> and every developer page is /dev/<username>. Add .md to either address for a plain-text version.

## Rules for readers and robots
- The public pages contain the same content for people and for robots.
- Please do not try to sign in or scrape download links; they are intentionally not public.
`, "text/plain");
}
