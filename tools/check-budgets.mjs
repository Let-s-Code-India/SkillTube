import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
async function files(dir,ext) {
  const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p,ext));else if(p.endsWith(ext))out.push(p);}return out;
}
let css=0;for(const p of await files("public/css",".css")) css+=(await readFile(p)).length;
if(css>70*1024) throw new Error(`CSS budget exceeded: ${css} bytes`);
const js=await files("public/js",".js");for(const p of js){const n=(await readFile(p)).length;if(n>40*1024)throw new Error(`JS budget exceeded: ${p} (${n} bytes)`);}
for(const p of await files("public",".html")){const n=(await readFile(p)).length;if(n>60*1024)throw new Error(`HTML budget exceeded: ${p} (${n} bytes)`);}
console.log(`Budgets passed: CSS ${css} bytes.`);
