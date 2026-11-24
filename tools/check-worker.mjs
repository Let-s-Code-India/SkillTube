import { readFile } from "node:fs/promises";
import worker from "../worker/index.js";

const posts=JSON.parse(await readFile("public/why-skilltube/posts.json","utf8"));
const cached=new Map();
globalThis.caches={
  default:{
    async match(request){return cached.get(request.url);},
    async put(request,response){cached.set(request.url,response);}
  }
};

const env={
  SITE_URL:"https://skilltube.ayushgiri-ai-21.workers.dev",
  ASSETS:{
    async fetch(request) {
      if(new URL(request.url).pathname==="/why-skilltube/posts.json")return Response.json(posts);
      return new Response("Not found",{status:404});
    }
  }
};
const waitUntil=[];
const context={waitUntil(promise){waitUntil.push(promise);}};
const sitemap=await worker.fetch(new Request(`${env.SITE_URL}/sitemap-pages.xml`),env,context);
if(!sitemap.ok)throw new Error(`sitemap-pages.xml returned ${sitemap.status}`);
const xml=await sitemap.text();
for(const post of posts) {
  if(!xml.includes(`<loc>${env.SITE_URL}/why-skilltube/${post.slug}/</loc>`))throw new Error(`Sitemap omits ${post.slug}.`);
}
if((xml.match(/<url>/g)||[]).length!==22+posts.length)throw new Error("Sitemap page count did not match static pages and posts.");

const brand=await worker.fetch(new Request(`${env.SITE_URL}/licenses/BRAND.md`),env,context);
if(brand.status!==302||brand.headers.get("location")!=="https://github.com/Let-s-Code-India/SkillTube/blob/main/licenses/BRAND.md")throw new Error("Brand license route did not redirect to the source.");
await Promise.all(waitUntil);
console.log(`Verified sitemap includes all ${posts.length} posts and brand-license redirect.`);
