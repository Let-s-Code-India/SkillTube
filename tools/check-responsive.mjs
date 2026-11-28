/*
 * Purpose: Check responsive breakpoints, touch targets, and comment limits.
 * Called by: npm scripts and GitHub checks for check responsive.
 * Security: Reads local repository content and does not transmit source files or use production credentials.
 */
import { readFile } from "node:fs/promises";

const files = [
  "public/css/base.css",
  "public/css/layout.css",
  "public/css/components.css",
  "public/css/pages.css",
  "public/js/components/comments.js",
];
const source = (
  await Promise.all(
    files.map(
      /* Build a display value for each file. */
      (file) => readFile(file, "utf8"),
    ),
  )
).join("\n");
const compactSource = source.replace(/\s+/g, "");
const requirements = [
  ["375px breakpoint", /@media\(max-width:375px\)/],
  ["900px breakpoint", /@media\(max-width:900px\)/],
  ["44px button targets", /min-height:44px/],
  ["drawer touch targets", /\.drawernava(?:,\.drawer-row)?\{[^}]*min-height:44px/],
  [
    "single-column listing grid",
    /\.listing-grid,\.badge-grid\{grid-template-columns:minmax\(0,1fr\)/,
  ],
  ["comment character limits", /input\.maxLength=200/],
  ["comment text wrapping", /\.commentp\{[^}]*overflow-wrap:anywhere/],
  ["reduced-motion support", /prefers-reduced-motion/],
];
const failures = requirements
  .filter(
    /* Keep item values that match the current view. */
    ([, pattern]) => !pattern.test(compactSource),
  )
  .map(
    /* Build a display value for each item. */
    ([name]) => name,
  );
if (failures.length) {
  console.error(`Responsive checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(
  "Responsive CSS includes 375px/900px layouts, 44px targets, and reduced-motion support.",
);
