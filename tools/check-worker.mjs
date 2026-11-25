import { readFile } from "node:fs/promises";
import worker from "../worker/index.js";

const posts = JSON.parse(
  await readFile("public/why-skilltube/posts.json", "utf8"),
);
const docs = JSON.parse(await readFile("public/docs/docs.json", "utf8"));
const cached = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      return cached.get(request.url);
    },
    async put(request, response) {
      cached.set(request.url, response);
    },
  },
};

const env = {
  SITE_URL: "https://skilltube.ayushgiri-ai-21.workers.dev",
  ASSETS: {
    async fetch(request) {
      if (new URL(request.url).pathname === "/why-skilltube/posts.json")
        return Response.json(posts);
      if (new URL(request.url).pathname === "/docs/docs.json")
        return Response.json(docs);
      return new Response("Not found", { status: 404 });
    },
  },
};
const waitUntil = [];
const context = {
  waitUntil(promise) {
    waitUntil.push(promise);
  },
};
cached.set(
  `${env.SITE_URL}/sitemap-pages.xml`,
  new Response("<urlset><url><loc>stale</loc></url></urlset>"),
);
const sitemap = await worker.fetch(
  new Request(`${env.SITE_URL}/sitemap-pages.xml`),
  env,
  context,
);
if (!sitemap.ok)
  throw new Error(`sitemap-pages.xml returned ${sitemap.status}`);
const xml = await sitemap.text();
if (!xml.includes(`<loc>${env.SITE_URL}/docs/</loc>`))
  throw new Error("Static sitemap omits the documentation hub.");
for (const post of posts) {
  if (!xml.includes(`<loc>${env.SITE_URL}/why-skilltube/${post.slug}/</loc>`))
    throw new Error(`Sitemap omits ${post.slug}.`);
}
for (const doc of docs) {
  if (!xml.includes(`<loc>${env.SITE_URL}/docs/${doc.slug}/</loc>`))
    throw new Error(`Sitemap omits documentation page ${doc.slug}.`);
}
if ((xml.match(/<url>/g) || []).length !== 23 + posts.length + docs.length)
  throw new Error(
    "Sitemap page count did not match static pages, posts and documentation.",
  );

const brand = await worker.fetch(
  new Request(`${env.SITE_URL}/licenses/BRAND.md`),
  env,
  context,
);
if (
  brand.status !== 302 ||
  brand.headers.get("location") !==
    "https://github.com/Let-s-Code-India/SkillTube/blob/main/licenses/BRAND.md"
)
  throw new Error("Brand license route did not redirect to the source.");

const robots = await worker.fetch(
  new Request(`${env.SITE_URL}/robots.txt`),
  env,
  context,
);
const robotsText = await robots.text();
if (!robots.ok || !robots.headers.get("content-type")?.startsWith("text/plain"))
  throw new Error("robots.txt did not return plain text.");
for (const directive of [
  "Disallow: /app/",
  "Disallow: /404.html",
  "Disallow: /offline.html",
  "Disallow: /developers/?q=",
  "Disallow: /developers/?page=",
  `Sitemap: ${env.SITE_URL}/sitemap.xml`,
]) {
  if (!robotsText.includes(directive))
    throw new Error(`robots.txt omits ${directive}.`);
}

const llms = await worker.fetch(
  new Request(`${env.SITE_URL}/llms.txt`),
  env,
  context,
);
const llmsText = await llms.text();
if (!llms.ok || !llms.headers.get("content-type")?.startsWith("text/plain"))
  throw new Error("llms.txt did not return plain text.");
for (const reference of [
  `${env.SITE_URL}/sitemap.xml`,
  `${env.SITE_URL}/docs/`,
  `<id>.md`,
  `<username>.md`,
  `${env.SITE_URL}/legal/security/`,
  `${env.SITE_URL}/.well-known/security.txt`,
]) {
  if (!llmsText.includes(reference))
    throw new Error(`llms.txt omits ${reference}.`);
}
for (const doc of docs) {
  if (
    !llmsText.includes(`${env.SITE_URL}/docs/${doc.slug}/`) ||
    !llmsText.includes(`${env.SITE_URL}/docs/${doc.slug}.md`)
  ) {
    throw new Error(
      `llms.txt omits HTML or Markdown documentation for ${doc.slug}.`,
    );
  }
}
await Promise.all(waitUntil);
console.log(
  `Verified sitemap includes ${posts.length} posts and ${docs.length} docs, plus crawler guidance and the brand-license redirect.`,
);
