import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const footer = `<footer class="footer"><div class="container">
  <nav class="footer-links" aria-label="Footer">
    <a href="/legal/privacy/">Privacy</a><a href="/legal/terms/">Terms</a>
    <a href="/legal/community-guidelines/">Community Guidelines</a><a href="/legal/cookies/">Cookies</a>
    <a href="/legal/security/">Security</a><a href="/brand/">Licenses</a><a href="/contact/">Contact</a>
    <a href="/faq/">FAQ</a><a href="/why-skilltube/">Why SkillTube</a>
  </nav>
  <p>© 2026 Let's Code India. Source code under the MIT License.</p></div></footer>`;

async function htmlFiles(dir) {
  const out=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await htmlFiles(full));
    else if(entry.name==="index.html"||entry.name==="404.html"||entry.name==="offline.html") out.push(full);
  }
  return out;
}
async function stamp() {
  const check=process.argv.includes("--check");
  let failed=false;
  for(const file of await htmlFiles("public")) {
    const text=await readFile(file,"utf8");
    if(!/<footer class="footer">/.test(text)) {
      if(check){ console.error(`Missing footer: ${file}`); failed=true; }
      else {
        const stamped=text.replace(/<\/body>/i,`${footer}\n</body>`);
        await writeFile(file,stamped);
      }
    }
  }
  if(failed) process.exit(1);
  console.log(check?"Footers are stamped.":"Footers stamped.");
}
stamp();
