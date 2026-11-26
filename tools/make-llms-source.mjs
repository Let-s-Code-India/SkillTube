/*
 * Purpose: Build the data source used to generate SkillTube's complete llms.txt.
 * Called by: npm run generate:llms-source before deploying static assets.
 * Security: Reads public repository content only and writes a validated public JSON asset.
 */
import { readFile, writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { topicSlugs } from "../public/js/topics.js";

const outputFile = "public/llms-source.json";
const check = process.argv.includes("--check");
const [faqHtml, postsJson, docsJson] = await Promise.all([
  readFile("public/faq/index.html", "utf8"),
  readFile("public/why-skilltube/posts.json", "utf8"),
  readFile("public/docs/docs.json", "utf8"),
]);
const dom = new JSDOM(faqHtml);
const faq = Array.from(
  dom.window.document.querySelectorAll(".faq-group"),
).flatMap((group) =>
  Array.from(group.querySelectorAll("details.faq-item"), (item) => ({
    group: group.querySelector("h2")?.textContent.trim() || "FAQ",
    question: item.querySelector("summary")?.textContent.trim() || "",
    answer:
      item.querySelector("p")?.textContent.trim().replace(/\s+/g, " ") || "",
  })),
);
dom.window.close();

const posts = JSON.parse(postsJson);
const docs = JSON.parse(docsJson);
if (!faq.length || faq.some((item) => !item.question || !item.answer)) {
  throw new Error(
    "Every public FAQ item must have a question and short answer.",
  );
}
if (
  !Array.isArray(posts) ||
  posts.some((post) => !post.slug || !post.title || !post.summary || !post.date)
) {
  throw new Error(
    "Every Why SkillTube post needs a slug, title, summary, and date.",
  );
}
if (
  !Array.isArray(docs) ||
  docs.some((doc) => !doc.slug || !doc.title || !doc.summary || !doc.updated)
) {
  throw new Error(
    "Every documentation guide needs a slug, title, summary, and update date.",
  );
}
const dates = [
  ...posts.map((post) => post.date),
  ...docs.map((doc) => doc.updated),
];
if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
  throw new Error("FAQ source metadata includes an invalid content date.");
}
const expected = `${JSON.stringify(
  {
    faq,
    posts: posts.map(({ slug, title, summary }) => ({ slug, title, summary })),
    docs: docs.map(({ slug, title, summary }) => ({ slug, title, summary })),
    topics: topicSlugs,
    lastUpdated: dates.sort().at(-1),
  },
  null,
  2,
)}\n`;

if (check) {
  const actual = await readFile(outputFile, "utf8");
  if (actual !== expected)
    throw new Error(
      `${outputFile} is stale; run npm run generate:llms-source.`,
    );
} else {
  await writeFile(outputFile, expected);
}
console.log(
  `${check ? "Checked" : "Generated"} llms source for ${faq.length} FAQ items, ${posts.length} posts, and ${docs.length} guides.`,
);
