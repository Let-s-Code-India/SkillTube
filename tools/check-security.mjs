/*
 * Purpose: Exercise security policies, URL validation, Markdown sanitization, and Worker headers.
 * Called by: npm scripts and GitHub checks for check security.
 * Security: Reads local repository content and does not transmit source files or use production credentials.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { safeUrl } from "../public/js/safe-url.js";
import worker from "../worker/index.js";

const headers = await readFile("public/_headers", "utf8");
const csp = headers.match(/^\s+Content-Security-Policy:\s*(.+)$/m)?.[1];
assert.ok(csp, "Cloudflare Pages must apply a Content-Security-Policy.");
for (const directive of [
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
]) {
  assert.ok(csp.includes(directive), `Static CSP is missing ${directive}.`);
}
for (const header of [
  "Strict-Transport-Security:",
  "X-Frame-Options: DENY",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy:",
  "Permissions-Policy:",
]) {
  assert.ok(
    headers.includes(header),
    `Static security headers are missing ${header}.`,
  );
}

const dom = new JSDOM('<!doctype html><div id="content"></div>', {
  url: "https://skilltube.test/",
  runScripts: "dangerously",
});
dom.window.eval(await readFile("public/vendor/marked.min.js", "utf8"));
dom.window.eval(await readFile("public/vendor/dompurify.min.js", "utf8"));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.location = dom.window.location;

assert.equal(
  safeUrl("https://example.com/resource"),
  "https://example.com/resource",
);
assert.equal(safeUrl("/app/#/home"), "/app/#/home");
for (const value of [
  "javascript:alert(1)",
  "//attacker.test/path",
  "http://example.com",
  "https://user:pass@example.com",
]) {
  assert.equal(safeUrl(value), null, `Unsafe URL was accepted: ${value}`);
}

const { renderMarkdown } = await import("../public/js/components/markdown.js");
const container = document.querySelector("#content");
renderMarkdown(
  container,
  `# Heading

[safe link](https://example.com/)
[unsafe link](javascript:alert(1))

<img src=x onerror=alert(1)>
<iframe src="https://attacker.test"></iframe>`,
);
assert.equal(
  container.querySelector("h1"),
  null,
  "User Markdown must not add another page-level heading.",
);
assert.ok(
  container.querySelector("h2"),
  "Markdown heading should remain visible.",
);
assert.equal(
  container.querySelector("script, img, iframe, [onerror]"),
  null,
  "Executable or embedded HTML survived sanitization.",
);
assert.equal(
  container.querySelector('a[href^="javascript:"]'),
  null,
  "A javascript: link survived sanitization.",
);
const safeLink = container.querySelector('a[href="https://example.com/"]');
assert.ok(safeLink, "Safe HTTPS links should remain available.");
assert.equal(safeLink.target, "_blank");
assert.equal(safeLink.rel, "noopener noreferrer nofollow ugc");
dom.window.close();

const originalFetch = globalThis.fetch;
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
globalThis.fetch =
  /* Mock a successful backend response during Worker security checks. */
  async () => new Response("null", { status: 200 });
globalThis.caches = {
  default: {
    match:
      /* Mock cache lookup for Worker security tests. */
      async () => null,
    put:
      /* Mock cache writes for Worker security tests. */
      async () => {},
  },
};
try {
  const response = await worker.fetch(
    new Request(
      "https://skilltube.test/skill/00000000-0000-0000-0000-000000000000",
    ),
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-key",
      SITE_URL: "https://skilltube.test",
    },
    {
      waitUntil:
        /* Keep the background cache write observable to the test harness. */
        () => {},
    },
  );
  assert.equal(response.status, 404);
  const workerCsp = response.headers.get("content-security-policy") || "";
  assert.match(workerCsp, /nonce-[a-f0-9]+/);
  assert.ok(workerCsp.includes("object-src 'none'"));
  assert.ok(workerCsp.includes("upgrade-insecure-requests"));
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const rejectedMethod = await worker.fetch(
    new Request("https://skilltube.test/robots.txt", { method: "POST" }),
    {},
    {},
  );
  assert.equal(rejectedMethod.status, 405);
  assert.equal(
    rejectedMethod.headers.get("strict-transport-security"),
    "max-age=31536000",
  );

  const redirect = await worker.fetch(
    new Request("https://skilltube.test/licenses/BRAND.md"),
    {},
    {},
  );
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("x-frame-options"), "DENY");

  globalThis.fetch =
    /* Mock an upstream failure to verify the Worker error response. */
    async () => new Response("upstream failure", { status: 500 });
  const failure = await worker.fetch(
    new Request(
      "https://skilltube.test/skill/00000000-0000-0000-0000-000000000000",
    ),
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-key",
      SITE_URL: "https://skilltube.test",
    },
    {
      waitUntil:
        /* Keep the background cache write observable to the test harness. */
        () => {},
    },
  );
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("x-content-type-options"), "nosniff");
} finally {
  globalThis.fetch = originalFetch;
  if (originalCaches)
    Object.defineProperty(globalThis, "caches", originalCaches);
  else delete globalThis.caches;
}

console.log(
  "Security policy, URL validation, Markdown sanitization, and Worker headers passed.",
);
