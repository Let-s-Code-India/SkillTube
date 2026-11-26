/*
 * Purpose: Exercise Worker sitemap, crawler, and public route output.
 * Called by: npm scripts and GitHub checks for check worker.
 * Security: Reads local repository content and does not transmit source files or use production credentials.
 */
import { readFile } from "node:fs/promises";
import worker from "../worker/index.js";

const posts = JSON.parse(
  await readFile("public/why-skilltube/posts.json", "utf8"),
);
const docs = JSON.parse(await readFile("public/docs/docs.json", "utf8"));
const llmsSource = JSON.parse(
  await readFile("public/llms-source.json", "utf8"),
);
const wranglerConfig = await readFile("wrangler.jsonc", "utf8");
if (!wranglerConfig.includes('"command": "npm run generate:llms-source"'))
  throw new Error(
    "Worker deploy must generate the current llms content source.",
  );
if (!wranglerConfig.includes('"/llms-full.txt"'))
  throw new Error(
    "Worker must handle the /llms-full.txt redirect before assets.",
  );
if (llmsSource.topics.length !== 15)
  throw new Error("llms source must include all 15 top-level topics.");
const cached = new Map();
globalThis.caches = {
  default: {
    // Mock cache lookup for Worker route tests.
    async match(request) {
      return cached.get(request.url);
    },
    // Mock cache writes for Worker route tests.
    async put(request, response) {
      cached.set(request.url, response);
    },
  },
};

const env = {
  SITE_URL: "https://skilltube.ayushgiri-ai-21.workers.dev",
  ASSETS: {
    // Serve fixture content for static assets requested by the Worker.
    async fetch(request) {
      if (new URL(request.url).pathname === "/why-skilltube/posts.json")
        return Response.json(posts);
      if (new URL(request.url).pathname === "/docs/docs.json")
        return Response.json(docs);
      if (new URL(request.url).pathname === "/llms-source.json")
        return Response.json(llmsSource);
      return new Response("Not found", { status: 404 });
    },
  },
};
const waitUntil = [];
const context = {
  // Keep background cache writes observable to the test harness.
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
  "Crawl-delay: 1",
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
const aiAgents = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "cohere-ai",
];
if (!robotsText.includes("# Crawling welcome"))
  throw new Error("robots.txt omits the crawling welcome comment.");
for (const agent of aiAgents) {
  const block = robotsText.split(`User-agent: ${agent}`)[1]?.split("\n\n")[0];
  if (
    !block?.includes("Allow: /") ||
    !block.includes("Crawl-delay: 1") ||
    !block.includes("Disallow: /app/")
  )
    throw new Error(`robots.txt has incomplete rules for ${agent}.`);
}

const llms = await worker.fetch(
  new Request(`${env.SITE_URL}/llms.txt`),
  env,
  context,
);
const llmsText = await llms.text();
if (!llms.ok || !llms.headers.get("content-type")?.startsWith("text/plain"))
  throw new Error("llms.txt did not return plain text.");
const readableLlmsText = llmsText.replace(/\\(.)/g, "$1");
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
for (const section of [
  "## About",
  "## How to search",
  "## What each page contains",
  "## Not available on purpose",
  "## Crawling etiquette",
  "## Content licence summary",
  "## FAQ",
  "## Why SkillTube",
  "## Documentation guides",
  "## Contact",
  "Last updated:",
]) {
  if (!llmsText.includes(section))
    throw new Error(`llms.txt omits section ${section}.`);
}
for (const requiredContent of [
  "Created by Ayush Giri",
  "https://let-s-code-india.github.io",
  "/developers/?q=<words>",
  "@username",
  "/dev/<username>",
  "/topic/<tag>/",
  "at most one request per second",
  "identify your bot",
  "Never sign in",
  "never crawl /app/",
  "Source repository links are not shown on public pages.",
  "User country selections",
  "reporter identities",
  "private account details",
  "licence in each developer's repository",
  "licensed under MIT",
  'Attribute "SkillTube" when quoting',
]) {
  if (!llmsText.includes(requiredContent))
    throw new Error(`llms.txt omits required guidance: ${requiredContent}.`);
}
for (const { question, answer } of llmsSource.faq) {
  if (
    !readableLlmsText.includes(question) ||
    !readableLlmsText.includes(answer)
  )
    throw new Error(`llms.txt omits FAQ content: ${question}`);
}
for (const post of llmsSource.posts) {
  if (
    !readableLlmsText.includes(post.title) ||
    !readableLlmsText.includes(post.summary) ||
    !llmsText.includes(`${env.SITE_URL}/why-skilltube/${post.slug}/`)
  )
    throw new Error(`llms.txt omits Why SkillTube post ${post.slug}.`);
}
for (const doc of llmsSource.docs) {
  if (
    !readableLlmsText.includes(doc.title) ||
    !readableLlmsText.includes(doc.summary)
  )
    throw new Error(`llms.txt omits documentation guide ${doc.slug}.`);
}
for (const topic of llmsSource.topics) {
  if (!llmsText.includes(`${env.SITE_URL}/topic/${topic}/`))
    throw new Error(`llms.txt omits top-level topic ${topic}.`);
}
for (const email of [
  "ayushgiri.ai.21@gmail.com",
  "ayushgiri.25@icloud.com",
  "ayushgiri.dev1@outlook.com",
]) {
  if (!llmsText.includes(email))
    throw new Error(`llms.txt omits contact email ${email}.`);
}
if (llmsText.split(`](${env.SITE_URL}/docs/)`).length - 1 !== 1)
  throw new Error("llms.txt must list the documentation hub only once.");
const fullLlms = await worker.fetch(
  new Request(`${env.SITE_URL}/llms-full.txt`),
  env,
  context,
);
if (
  fullLlms.status !== 301 ||
  fullLlms.headers.get("location") !== `${env.SITE_URL}/llms.txt`
)
  throw new Error("/llms-full.txt must redirect permanently to /llms.txt.");
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
