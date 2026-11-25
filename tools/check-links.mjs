import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";

const publicRoot=path.resolve("public");
const externalRoutes=new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/sitemap-pages.xml",
  "/licenses/BRAND.md",
  "/developers",
  "/developers/",
  "/leaderboard",
  "/leaderboard/",
  "/badges",
  "/badges/"
]);
const workerRoutePatterns=[
  /^\/sitemap-(?:skills|devs)-\d+\.xml$/,
  /^\/(?:skill|dev)\/[^/]+(?:\.md)?$/,
  /^\/topic\/[A-Za-z0-9-]+\/?$/
];

async function htmlFiles(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await htmlFiles(file));
    else if(entry.name.endsWith(".html"))files.push(file);
  }
  return files;
}

async function targetExists(pathname) {
  let decoded;
  try{decoded=decodeURIComponent(pathname);}catch{return false;}
  if(externalRoutes.has(decoded)||workerRoutePatterns.some((pattern)=>pattern.test(decoded)))return true;
  const relative=decoded.replace(/^\/+/,"");
  const target=path.resolve(publicRoot,relative);
  if(target!==publicRoot&&!target.startsWith(`${publicRoot}${path.sep}`))return false;
  const candidates=decoded.endsWith("/")
    ?[path.join(target,"index.html")]
    :[target,path.join(target,"index.html")];
  for(const candidate of candidates) {
    try{await access(candidate);return true;}catch{}
  }
  return false;
}

const problems=[];
for(const file of await htmlFiles(publicRoot)) {
  const source=await readFile(file,"utf8");
  const relative=path.relative(publicRoot,file);
  if(!/<html\b[^>]*\blang="en"/i.test(source))problems.push(`${relative}: missing lang="en"`);
  if(!/<title>[^<]+<\/title>/i.test(source))problems.push(`${relative}: missing title`);
  if(!/<meta\b[^>]*name="description"[^>]*content="[^"]+"/i.test(source))problems.push(`${relative}: missing meta description`);
  if(!/<meta\b[^>]*name="twitter:card"[^>]*content="summary_large_image"/i.test(source))problems.push(`${relative}: missing large-image social card`);
  if(!/<meta\b[^>]*name="viewport"[^>]*content=/i.test(source))problems.push(`${relative}: missing viewport`);
  if(!/<link\b[^>]*rel="canonical"[^>]*href=/i.test(source))problems.push(`${relative}: missing canonical URL`);
  const ogImageTag=source.match(/<meta\b[^>]*property="og:image"[^>]*>/i)?.[0];
  const ogImage=ogImageTag?.match(/\bcontent="([^"]+)"/i)?.[1];
  if(!ogImage)problems.push(`${relative}: missing Open Graph image`);
  else {
    const imagePath=path.resolve(publicRoot,decodeURIComponent(new URL(ogImage).pathname).replace(/^\/+/,""));
    if(imagePath===publicRoot||!imagePath.startsWith(`${publicRoot}${path.sep}`))problems.push(`${relative}: Open Graph image is outside public assets`);
    else {
      try {
        const bytes=await readFile(imagePath);
        const ext=path.extname(imagePath).toLowerCase();
        if((ext===".jpg"||ext===".jpeg")&&!(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff))problems.push(`${relative}: Open Graph JPEG has an invalid file signature`);
        if(ext===".png"&&bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")problems.push(`${relative}: Open Graph PNG has an invalid file signature`);
      } catch(error) {
        problems.push(`${relative}: Open Graph image is unavailable (${error.message})`);
      }
    }
  }
  if(!/<a\b[^>]*class="skip-link"[^>]*href="#main"/i.test(source))problems.push(`${relative}: missing skip link`);
  const headings=source.match(/<h1\b/gi)||[];
  if(headings.length!==1)problems.push(`${relative}: expected one h1, found ${headings.length}`);
  for(const [,image] of source.matchAll(/<img\b([^>]*)>/gi)) {
    if(!/\balt="[^"]*"/i.test(image))problems.push(`${relative}: image is missing alt text`);
    if(!/\bwidth="\d+"/i.test(image)||!/\bheight="\d+"/i.test(image))problems.push(`${relative}: image is missing intrinsic dimensions`);
  }
  const links=[...source.matchAll(/\b(?:href|src|poster)="([^"]+)"/gi)];
  for(const [,value] of links) {
    if(!value||value.startsWith("#")||/^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(value))continue;
    const resolved=new URL(value,"https://skilltube.invalid/");
    if(!await targetExists(resolved.pathname))problems.push(`${relative}: missing internal target ${value}`);
  }
}
if(problems.length) {
  console.error(problems.join("\n"));
  process.exitCode=1;
} else console.log(`Checked metadata and internal links in ${(await htmlFiles(publicRoot)).length} HTML pages.`);
