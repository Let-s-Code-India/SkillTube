/*
 * Purpose: Render the landing page and coordinate its UI actions.
 * Called by: public/index.html.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { call } from "../api.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => {
      if (!registrations.length) navigator.serviceWorker.register("/sw.js").catch(() => {});
    })
    .catch(() => {});
}
// Load public statistics and trending tags for the landing page.
async function load() {
  try {
    const stats = await call("public_stats");
    const bar = document.querySelector("#stats");
    if (stats?.real !== true) {
      bar.hidden = true;
    } else {
      bar.hidden = false;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const counts = [
        ["#skill-count", Number(stats.skills||0)],
        ["#developer-count", Number(stats.developers||0)],
        ["#member-count", Number(stats.members||0)],
      ];
      for (const [selector,target] of counts) {
        const node=document.querySelector(selector);
        if (reduce) { node.textContent=target.toLocaleString(); continue; }
        const start=performance.now();
        const tick=(now)=>{
          const progress=Math.min(1,(now-start)/600);
          node.textContent=Math.round(target*progress).toLocaleString();
          if(progress<1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }
  } catch (_) {
    const bar=document.querySelector("#stats");
    if(bar) bar.hidden=true;
  }
  try {
    const tags = await call("trending_tags");
    const slot = document.querySelector("#trending");
    slot.replaceChildren();
    (Array.isArray(tags) ? tags : []).slice(0, 20).forEach(
      /* Process each tag in the collection. */
      (tag) => {
        const a = document.createElement("a");
        a.className = "chip";
        a.href = `/topic/${encodeURIComponent(tag.slug || tag)}/`;
        a.textContent = tag.slug || tag;
        slot.append(a);
      },
    );
  } catch (_) {
    /* The public tags endpoint can be unavailable; the page remains usable. */
  }
}
load();
