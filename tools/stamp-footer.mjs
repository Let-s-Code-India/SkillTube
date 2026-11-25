/*
 * Purpose: Apply or verify the shared footer across static HTML pages.
 * Called by: the corresponding npm generator or repository check.
 * Security: Writes only generated footer markup under public/ and never embeds runtime secrets.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { footerMarkup } from "../public/js/footer.js";

// Find public HTML pages that need the shared footer.
async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (
      entry.name === "index.html" ||
      entry.name === "404.html" ||
      entry.name === "offline.html"
    )
      out.push(full);
  }
  return out;
}
// Add or verify shared footer markup in each public page.
async function stamp() {
  const check = process.argv.includes("--check");
  let failed = false;
  for (const file of await htmlFiles("public")) {
    const text = await readFile(file, "utf8");
    const footerPattern = /<footer class="footer">[\s\S]*?<\/footer>/i;
    const existing = text.match(footerPattern)?.[0];
    if (existing !== footerMarkup()) {
      if (check) {
        console.error(`Missing or outdated footer: ${file}`);
        failed = true;
      } else if (existing) {
        await writeFile(file, text.replace(footerPattern, footerMarkup()));
      } else {
        await writeFile(
          file,
          text.replace(/<\/body>/i, `${footerMarkup()}\n</body>`),
        );
      }
    }
  }
  if (failed) process.exit(1);
  console.log(check ? "Footers are stamped." : "Footers stamped.");
}
stamp();
