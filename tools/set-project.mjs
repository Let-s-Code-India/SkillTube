/*
 * Purpose: Point the whole site at a different Supabase project or site address in one command.
 * Use: node tools/set-project.mjs <supabase-url> <publishable-key> [site-url]
 * Security: Only the publishable (anon) key belongs here. Never pass a secret or service-role key.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [newUrl, newKey, newSite] = process.argv.slice(2);
if (!newUrl || !newKey || /service_role|sb_secret/i.test(newKey)) {
  console.error("Usage: node tools/set-project.mjs <supabase-url> <publishable-key> [site-url]");
  console.error("The key must be the PUBLISHABLE key (starts with sb_publishable_). Never a secret key.");
  process.exit(1);
}
const cfg = readFileSync("public/js/config.js", "utf8");
const pick = (name) => cfg.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1];
const pairs = [
  [pick("supabaseUrl"), newUrl.replace(/\/+$/, "")],
  [pick("supabaseAnonKey"), newKey],
];
if (newSite) pairs.push([pick("siteUrl"), newSite.replace(/\/+$/, "")]);

const skip = new Set(["node_modules", ".git"]);
const textExt = /\.(js|mjs|json|jsonc|html|md|txt|xml|yml|yaml|css|svg)$/;
let changed = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (textExt.test(name)) {
      let text = readFileSync(path, "utf8");
      const before = text;
      for (const [from, to] of pairs) if (from && to && from !== to) text = text.split(from).join(to);
      if (text !== before) {
        writeFileSync(path, text);
        changed++;
        console.log("updated", path);
      }
    }
  }
})(".");
console.log(`Done. ${changed} file(s) changed. Now run: git diff --stat`);
