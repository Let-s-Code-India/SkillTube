/*
 * Purpose: Generate sanitized public documentation HTML, Markdown twins, and metadata.
 * Called by: the corresponding npm generator or repository check.
 * Security: Sanitize authored Markdown before HTML output; do not include private data in sources.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { siteInfo } from "../public/js/site-info.js";
import { footerMarkup } from "../public/js/footer.js";

await import("../public/vendor/marked.min.js");
await import("../public/vendor/dompurify.min.js");

// Source and output locations for the public documentation generator.
const expectedSlugs = [
  "getting-started",
  "limits-and-rules",
  "reporting-content",
  "responding-to-reports",
  "removals-and-appeals",
  "contacting-us",
  "announcements-and-updates",
  "badges-and-ranking",
  "privacy-and-data",
  "for-ai-tools",
];
const sourceDirectory = "content/docs";
const outputDirectory = "public/docs";
const baseUrl = siteInfo.siteUrl;
const check = process.argv.includes("--check");
const dom = new JSDOM("");
const purifier = globalThis.DOMPurify(dom.window);

// Markdown parsing, sanitization, and static HTML rendering.
// Escape html.
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,

    /* Format each matched value. */
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

// Parse document.
function parseDocument(slug, source) {
  const match = source.match(
    /^# (.+)\r?\n\r?\n([\s\S]+?)\r?\n\r?\nLast updated: (\d{4}-\d{2}-\d{2})\r?\n\r?\n([\s\S]+)$/,
  );
  if (!match)
    throw new Error(
      `${slug}: expected a title, introduction, update date, and Markdown body.`,
    );
  const [, title, summary, updated, body] = match;
  if (new Date(`${updated}T00:00:00Z`).toISOString().slice(0, 10) !== updated) {
    throw new Error(`${slug}: invalid last-updated date ${updated}.`);
  }
  if (/^# /m.test(body))
    throw new Error(
      `${slug}: use one page title; body headings must start at level two.`,
    );
  if (/\bdownload(?:s|ed|ing)?\b/i.test(source))
    throw new Error(`${slug}: documentation must not refer to downloading.`);
  return {
    slug,
    title: title.trim(),
    summary: summary.trim().replace(/\s+/g, " "),
    updated,
    body,
  };
}

// Serialize sanitized DOM nodes and escape text and attributes.
function serialize(node) {
  if (node.nodeType === 3) return escapeHtml(node.nodeValue);
  if (node.nodeType !== 1)
    return Array.from(node.childNodes, serialize).join("");
  const tag = node.tagName.toLowerCase();
  const attributes = Array.from(
    node.attributes,

    /* Import sanitized child nodes into the parser document. */
    (attribute) => ` ${attribute.name}="${escapeHtml(attribute.value)}"`,
  ).join("");
  const children = Array.from(node.childNodes, serialize).join("");
  return ["br", "hr"].includes(tag)
    ? `<${tag}${attributes}>`
    : `<${tag}${attributes}>${children}</${tag}>`;
}

// Create a URL-safe slug for heading.
function slugifyHeading(value, used) {
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

// Render authored Markdown through the HTML sanitizer.
function sanitizeBody(markdown) {
  const rendered = globalThis.marked.parse(markdown, {
    gfm: true,
    breaks: false,
  });
  const safe = purifier.sanitize(rendered, {
    ALLOWED_TAGS: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "em",
      "h2",
      "h3",
      "h4",
      "hr",
      "li",
      "ol",
      "p",
      "pre",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    ALLOWED_ATTR: ["href"],
    FORBID_TAGS: ["img", "iframe", "object", "embed", "style", "script"],
    ALLOW_DATA_ATTR: false,
  });
  const parsed = new dom.window.DOMParser().parseFromString(safe, "text/html");
  const used = new Set();
  const headings = [];
  for (const heading of parsed.querySelectorAll("h2, h3, h4")) {
    const text = heading.textContent.trim();
    const id = slugifyHeading(text, used);
    heading.id = id;
    headings.push({ id, text, level: Number(heading.tagName.slice(1)) });
  }
  for (const link of parsed.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (/^https:/i.test(href)) link.setAttribute("rel", "noopener noreferrer");
  }
  const helpHeading = Array.from(parsed.querySelectorAll("h2")).find(
    /* Find the heading that matches the current condition. */
    (heading) => heading.textContent.trim() === "Need help?",
  );
  if (!helpHeading)
    throw new Error(
      "Every documentation page must include a Need help? section.",
    );
  const parent = helpHeading.parentNode;
  const helpBox = parsed.createElement("aside");
  helpBox.className = "card docs-help";
  let node = helpHeading;
  let after = null;
  while (node && !(node !== helpHeading && /^H[1-6]$/.test(node.tagName))) {
    after = node.nextSibling;
    helpBox.append(node);
    node = after;
  }
  parent.insertBefore(helpBox, node);
  return {
    html: Array.from(parsed.body.childNodes, serialize).join(""),
    headings,
  };
}

// Build a table of contents from sanitized document headings.
function tableOfContents(headings) {
  return `<nav class="docs-toc" aria-label="Table of contents"><h2>On this page</h2><ol>${headings
    .map(
      /* Build a display value for each item. */
      ({ id, text, level }) =>
        `<li class="docs-toc-level-${level}"><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`,
    )
    .join("")}</ol></nav>`;
}

// Render the shared public documentation page shell.
function articleShell(document, body, headings, navigation) {
  const title = escapeHtml(document.title);
  const summary = escapeHtml(document.summary);
  const canonical = `${baseUrl}/docs/${document.slug}/`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: document.title,
    description: document.summary,
    datePublished: document.updated,
    dateModified: document.updated,
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: "Let's Code India" },
    publisher: { "@type": "Organization", name: "Let's Code India" },
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | SkillTube Documentation</title>
  <meta name="description" content="${summary}">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="text/markdown" href="${baseUrl}/docs/${document.slug}.md">
  <meta property="og:type" content="article"><meta property="og:title" content="${title} | SkillTube">
  <meta property="og:description" content="${summary}"><meta property="og:image" content="${baseUrl}/og-image.png">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${baseUrl}/og-image.png">
  <meta name="theme-color" content="#17151d">
  <link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/pages.css">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="container nav">
    <a class="brand" href="/"><img src="/logo.svg" alt="" width="36" height="36"><span>SkillTube</span></a>
    <nav class="nav-links" aria-label="Primary"><a href="/developers/">Developers</a><a href="/faq/">FAQ</a><a href="/docs/">Docs</a></nav>
  </div></header>
  <main id="main" class="reading section docs-page">
    <p class="eyebrow"><a href="/docs/">Documentation</a></p>
    <h1>${title}</h1>
    <p class="docs-intro">${summary}</p>
    <p class="mut">Last updated: <time datetime="${document.updated}">${document.updated}</time></p>
    ${tableOfContents(headings)}
    <article class="docs-content">${body}</article>
    ${navigation}
  </main>
  ${footerMarkup()}
</body>
</html>`;
}

// Build generated Markdown and HTML outputs for each documentation page.
// Build markdown.
function buildMarkdown(document, headings, previous, next) {
  const contents = headings
    .map(
      /* Build a display value for each item. */
      ({ id, text, level }) => `${"  ".repeat(level - 2)}- [${text}](#${id})`,
    )
    .join("\n");
  const links = [
    previous ? `[Previous: ${previous.title}](/docs/${previous.slug}/)` : null,
    next ? `[Next: ${next.title}](/docs/${next.slug}/)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `# ${document.title}\n\n${document.summary}\n\nLast updated: ${document.updated}\n\n## Contents\n\n${contents}\n\n${document.body.trim()}\n\n## Page navigation\n\n${links || "This is the only page in the documentation section."}\n`;
}

// Build index.
function buildIndex(documents) {
  const cards = documents
    .map(
      /* Build a display value for each document. */
      (document) =>
        `<article class="card"><p class="eyebrow">Documentation</p><h2><a href="/docs/${document.slug}/">${escapeHtml(document.title)}</a></h2><p>${escapeHtml(document.summary)}</p><p><a href="/docs/${document.slug}.md">Read Markdown</a></p><time datetime="${document.updated}">Updated ${document.updated}</time></article>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documentation | SkillTube</title>
  <meta name="description" content="Practical guides to accounts, publishing, limits, reports, privacy and AI-tool access on SkillTube.">
  <link rel="canonical" href="${baseUrl}/docs/">
  <meta property="og:type" content="website"><meta property="og:title" content="Documentation | SkillTube">
  <meta property="og:description" content="Practical guides to using SkillTube."><meta property="og:image" content="${baseUrl}/og-image.png">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${baseUrl}/og-image.png">
  <meta name="theme-color" content="#17151d">
  <link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/pages.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="container nav">
    <a class="brand" href="/"><img src="/logo.svg" alt="" width="36" height="36"><span>SkillTube</span></a>
    <nav class="nav-links" aria-label="Primary"><a href="/developers/">Developers</a><a href="/help/">Help</a></nav>
  </div></header>
  <main id="main" class="container section">
    <p class="eyebrow">Documentation</p>
    <h1>SkillTube documentation</h1>
    <p>AI skills are our main focus, alongside MCP servers, datasets, databases, prompts, agents, AI tools and guides. Read practical guides for using the service and for understanding its public pages.</p>
    <div class="docs-grid">${cards}</div>
  </main>
  ${footerMarkup()}
</body>
</html>`;
}

// Build outputs.
async function buildOutputs() {
  const sourceFiles = (await readdir(sourceDirectory))
    .filter(
      /* Keep file values that match the current view. */
      (file) => file.endsWith(".md"),
    )
    .sort();
  const expectedFiles = [...expectedSlugs].sort().map(
    /* Build a display value for each slug. */
    (slug) => `${slug}.md`,
  );
  if (JSON.stringify(sourceFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      "The documentation source directory must contain exactly the ten published Markdown guides.",
    );
  }
  const documents = [];
  for (const slug of expectedSlugs) {
    const source = await readFile(`${sourceDirectory}/${slug}.md`, "utf8");
    documents.push(parseDocument(slug, source));
  }
  const outputs = [];
  const metadata = documents.map(
    /* Build a display value for each item. */
    ({ slug, title, summary, updated }) => ({
      slug,
      title,
      summary,
      updated,
    }),
  );
  outputs.push([
    `${outputDirectory}/docs.json`,
    `${JSON.stringify(metadata, null, 2)}\n`,
  ]);
  outputs.push([`${outputDirectory}/index.html`, buildIndex(documents)]);
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    const previous = documents[index - 1];
    const next = documents[index + 1];
    const { html, headings } = sanitizeBody(document.body);
    if (!headings.length)
      throw new Error(`${document.slug}: add at least one section heading.`);
    const navigation = `<nav class="post-navigation" aria-label="Documentation navigation">${previous ? `<a href="/docs/${previous.slug}/">Previous: ${escapeHtml(previous.title)}</a>` : "<span></span>"}${next ? `<a href="/docs/${next.slug}/">Next: ${escapeHtml(next.title)}</a>` : ""}</nav>`;
    outputs.push([
      `${outputDirectory}/${document.slug}/index.html`,
      articleShell(document, html, headings, navigation),
    ]);
    outputs.push([
      `${outputDirectory}/${document.slug}.md`,
      buildMarkdown(document, headings, previous, next),
    ]);
  }
  return { documents, outputs };
}

const { documents, outputs } = await buildOutputs();
if (check) {
  const probe = sanitizeBody(
    '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))\n\n<iframe src="https://example.com"></iframe>\n\n## Need help?\n\n[Contact us](/contact/)',
  ).html;
  if (/<script|<img|onerror|javascript:|<iframe/i.test(probe))
    throw new Error("Markdown sanitizer failed its unsafe-content probe.");
}

for (const [file, expected] of outputs) {
  if (
    file.endsWith("/index.html") &&
    file.includes("/docs/") &&
    !file.endsWith("/docs/index.html")
  ) {
    if ((expected.match(/<h1\b/g) || []).length !== 1)
      throw new Error(`${file}: expected one primary heading.`);
    if (
      !expected.includes('type="text/markdown"') ||
      !expected.includes('"@type":"TechArticle"') ||
      !expected.includes('aria-label="Table of contents"') ||
      !expected.includes('class="card docs-help"') ||
      !expected.includes("Last updated:") ||
      !expected.includes('aria-label="Documentation navigation"')
    ) {
      throw new Error(
        `${file}: missing required documentation metadata or navigation.`,
      );
    }
  }
  if (check) {
    let existing;
    try {
      existing = await readFile(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      existing = null;
    }
    if (existing !== expected)
      throw new Error(`Generated documentation is stale: ${file}`);
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, expected);
  }
}

if (documents.length !== 10)
  throw new Error(
    `Expected 10 documentation pages, found ${documents.length}.`,
  );
console.log(
  check
    ? `Checked ${outputs.length} generated documentation files.`
    : `Generated ${documents.length} documentation pages.`,
);
dom.window.close();
