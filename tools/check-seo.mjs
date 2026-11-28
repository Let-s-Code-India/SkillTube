import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
async function htmlFiles(dir) {
  const out=[]; for(const entry of await readdir(dir,{withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await htmlFiles(p));
    else if(entry.name.endsWith(".html")) out.push(p);
  } return out;
}
const files=await htmlFiles("public");
const failures=[];
for(const file of files) {
  const s=await readFile(file,"utf8");
  if(!/<title>[^<]+<\/title>/i.test(s)) failures.push(`${file}: title`);
  if(!/<meta[^>]+name=["']description["'][^>]+>/i.test(s)) failures.push(`${file}: description`);
  if(!/<meta[^>]+property=["']og:image["'][^>]+>/i.test(s)) failures.push(`${file}: og:image`);
  const h1=(s.match(/<h1\b/gi)||[]).length;if(h1!==1) failures.push(`${file}: h1 count ${h1}`);
  for(const tag of s.matchAll(/<img\b[^>]*>/gi)){if(!/\balt\s*=/.test(tag[0]))failures.push(`${file}: img missing alt`);}
  if(!/<html\b[^>]*lang=["'][^"']+["']/i.test(s))failures.push(`${file}: lang`);
  if(!/<link[^>]+rel=["']canonical["']/i.test(s))failures.push(`${file}: canonical`);
}
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`SEO structure passed for ${files.length} public HTML files.`);
