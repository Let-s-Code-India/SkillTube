import { readFile, writeFile } from "node:fs/promises";

const order = [
  "tokens.css",
  "themes.css",
  "base.css",
  "layout.css",
  "components.css",
  "pages.css",
  "charts.css",
  "motion.css",
];

const css = (
  await Promise.all(order.map((file) => readFile(`public/css/${file}`, "utf8")))
).join("\n");
await writeFile("public/css/app.css", css);
console.log(`Built public/css/app.css (${Buffer.byteLength(css)} bytes).`);
