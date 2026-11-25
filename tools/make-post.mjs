import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { siteInfo } from "../public/js/site-info.js";
import { footerMarkup } from "../public/js/footer.js";

await import("../public/vendor/marked.min.js");
await import("../public/vendor/dompurify.min.js");
const parseMarkdown=globalThis.marked;
const createDOMPurify=globalThis.DOMPurify;
const dom=new JSDOM("");
const purifier=createDOMPurify(dom.window);
const posts=JSON.parse(await readFile("public/why-skilltube/posts.json","utf8"));
const check=process.argv.includes("--check");
const baseUrl=siteInfo.siteUrl;
purifier.addHook("afterSanitizeAttributes",(node)=>{
  if(node.tagName==="A")node.setAttribute("rel","noopener noreferrer nofollow ugc");
});

function escapeHtml(value) {
  return String(value??"").replace(/[&<>"']/g,(char)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function sanitizeMarkdown(source) {
  const rendered=parseMarkdown.parse(source,{gfm:false,breaks:false});
  return purifier.sanitize(rendered,{
    ALLOWED_TAGS:["p","h2","h3","ul","ol","li","strong","em","code","blockquote","br","a"],
    ALLOWED_ATTR:["href","rel"],
    FORBID_TAGS:["img","iframe","script","style"],
    ALLOW_DATA_ATTR:false
  });
}

function pageShell({title,description,canonical,body,script=""}) {
  const safeTitle=escapeHtml(title);
  const safeDescription=escapeHtml(description);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${safeDescription}"><meta name="theme-color" content="#17151d"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${safeTitle} | SkillTube"><meta property="og:description" content="${safeDescription}"><meta property="og:image" content="${baseUrl}/og-image.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${baseUrl}/og-image.jpg"><title>${safeTitle} | SkillTube</title><link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/pages.css">${script}</head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container nav"><a class="brand" href="/"><img src="/logo.svg" alt="" width="36" height="36"><span>SkillTube</span></a><nav class="nav-links" aria-label="Primary"><a href="/developers/">Developers</a><a href="/faq/">FAQ</a></nav></div></header><main id="main" class="reading section">${body}</main>${footerMarkup()}
</body></html>`;
}

function validatePosts() {
  if(posts.length!==19)throw new Error(`Expected 19 posts, found ${posts.length}.`);
  const slugs=new Set();
  for(const post of posts) {
    if(!/^[a-z0-9-]+$/.test(post.slug)||slugs.has(post.slug))throw new Error(`Invalid or duplicate post slug: ${post.slug}`);
    slugs.add(post.slug);
    if(!post.title||!post.summary||!Array.isArray(post.tags)||!/^\d{4}-\d{2}-\d{2}$/.test(post.date||""))throw new Error(`Incomplete post metadata: ${post.slug}`);
  }
}

function buildIndex() {
  const cards=posts.map((post)=>`<article class="card"><p class="eyebrow">${escapeHtml(post.tags.join(" · "))}</p><h2><a href="/why-skilltube/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.summary)}</p><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time></article>`).join("\n");
  return pageShell({
    title:"Why SkillTube",
    description:"Nineteen practical notes on discovering and sharing AI skills, MCP servers, datasets, databases, prompts, agents and AI tools.",
    canonical:`${baseUrl}/why-skilltube/`,
    body:`<p class="eyebrow">Why SkillTube</p><h1>Why we need a discovery layer for AI resources</h1><p>AI skills are our main focus, and useful MCP servers, datasets, databases, prompts, agents and AI tools belong here too. These articles explain the choices behind the directory without hype.</p><div class="post-grid">${cards}</div>`
  });
}

async function buildPost(post,index) {
  const source=await readFile(`content/why/${post.slug}.md`,"utf8");
  const words=source.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[];
  if(words.length<350||words.length>600)throw new Error(`${post.slug} has ${words.length} words; expected 350–600.`);
  const previous=posts[index-1],next=posts[index+1];
  const previousLink=previous?`<a href="/why-skilltube/${escapeHtml(previous.slug)}/">Previous: ${escapeHtml(previous.title)}</a>`:"<span></span>";
  const nextLink=next?`<a href="/why-skilltube/${escapeHtml(next.slug)}/">Next: ${escapeHtml(next.title)}</a>`:"";
  const navigation=`<nav class="post-navigation" aria-label="Article navigation">${previousLink}${nextLink}</nav>`;
  const tags=post.tags.map((tag)=>`<span class="chip">${escapeHtml(tag)}</span>`).join("");
  const body=`<p class="eyebrow">Why SkillTube · ${index+1} of ${posts.length}</p><h1>${escapeHtml(post.title)}</h1><p class="mut">${escapeHtml(post.summary)}</p><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time><button id="share-post" class="btn secondary" type="button">Copy link</button><span id="share-status" class="mut" aria-live="polite"></span><div class="chips">${tags}</div><article class="post-content">${sanitizeMarkdown(source)}</article><p><strong>What you can do:</strong> <a href="/app/#/home">sign in</a> or <a href="/developers/">browse developers</a>.</p>${navigation}`;
  return pageShell({
    title:post.title,
    description:post.summary,
    canonical:`${baseUrl}/why-skilltube/${post.slug}/`,
    body,
    script:'<script type="module" src="/js/why-post.js"></script>'
  });
}

validatePosts();
if(check) {
  const probe=sanitizeMarkdown("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))");
  if(/<script|<img|onerror|javascript:/i.test(probe))throw new Error("DOMPurify failed the unsafe Markdown probe.");
}
const outputs=[["public/why-skilltube/index.html",buildIndex()]];
for(let index=0;index<posts.length;index++) {
  const post=posts[index];
  outputs.push([`public/why-skilltube/${post.slug}/index.html`,await buildPost(post,index)]);
}

for(const [file,expected] of outputs) {
  if(check) {
    let existing;
    try{existing=await readFile(file,"utf8");}catch{existing=null;}
    if(existing!==expected)throw new Error(`Generated page is stale: ${file}`);
  } else {
    await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,expected);
  }
}
console.log(check?`Checked ${outputs.length} generated pages.`:`Generated ${outputs.length} static pages.`);
dom.window.close();
