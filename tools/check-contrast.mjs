import { readFile } from "node:fs/promises";

const css = await readFile("public/css/themes.css", "utf8");
const blocks = [...css.matchAll(/(?<selector>:root(?:\[data-theme="[^"]+"\])?|:root:not\([^)]+\))\s*\{(?<body>[^}]*)\}/gs)];
function vars(body) {
  const out = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  return [0,2,4].map((i)=>parseInt(m[1].slice(i,i+2),16)/255);
}
function lum(hex) {
  const c=rgb(hex); if(!c)return null;
  const linear=c.map((v)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function ratio(a,b) { const la=lum(a),lb=lum(b); if(la==null||lb==null)return null; return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05); }
const failures=[];
for (const block of blocks) {
  const body=block.groups.body;
  if (!body.includes("--text")) continue;
  const v=vars(body);
  const name=block.groups.selector;
  for (const [fg,bg,label,minimum] of [
    ["text","bg","text/background",4.5],["text-muted","bg","muted/background",4.5],
    ["on-brand","brand","on-brand/brand",4.5],["link","bg","link/background",4.5],
    ["line","bg","UI border/background",3],["focus","bg","focus/background",3],
  ]) {
    const r=ratio(v[fg],v[bg]); if(r==null||r<minimum) failures.push(`${name} ${label}: ${r?.toFixed(2)}`);
  }
  for (let i=1;i<=6;i++) {
    const r=ratio(v[`chart-${i}`],v.surface); if(r!=null&&r<3) failures.push(`${name} chart-${i}/surface: ${r.toFixed(2)}`);
  }
}
if (failures.length) { console.error("Contrast failures:\n"+failures.join("\n")); process.exit(1); }
console.log("Theme contrast checks passed.");
