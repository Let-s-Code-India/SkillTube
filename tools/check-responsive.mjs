import { readFile } from "node:fs/promises";

const files = [
  "public/css/base.css",
  "public/css/layout.css",
  "public/css/components.css",
  "public/css/pages.css",
];
const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
const requirements = [
  ["375px breakpoint", /@media\(max-width:375px\)/],
  ["900px breakpoint", /@media\(max-width:900px\)/],
  ["44px button targets", /min-height:\s*44px/],
  ["drawer touch targets", /\.drawer nav a\s*\{[^}]*min-height:\s*44px/s],
  ["single-column listing grid", /\.listing-grid,[^}]*grid-template-columns:minmax\(0,1fr\)/s],
  ["reduced-motion support", /prefers-reduced-motion/],
];
const failures = requirements.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (failures.length) {
  console.error(`Responsive checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Responsive CSS includes 375px/900px layouts, 44px targets, and reduced-motion support.");
