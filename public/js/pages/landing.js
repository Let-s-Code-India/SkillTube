import { call } from "../api.js";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

document.querySelector("#footer-slot").innerHTML = footerMarkup();
async function load() {
  try {
    const stats = await call("public_stats");
    document.querySelector("#skill-count").textContent = stats?.skills ?? "0";
    document.querySelector("#developer-count").textContent = stats?.developers ?? "0";
    document.querySelector("#view-count").textContent = stats?.views ?? "0";
  } catch (_) {
    document.querySelector("#stats").classList.add("error");
  }
  try {
    const tags = await call("trending_tags");
    const slot = document.querySelector("#trending");
    slot.replaceChildren();
    (Array.isArray(tags) ? tags : []).slice(0,20).forEach((tag) => {
      const a = document.createElement("a");
      a.className = "chip";
      a.href = `/topic/${encodeURIComponent(tag.slug || tag)}/`;
      a.textContent = tag.slug || tag;
      slot.append(a);
    });
  } catch (_) { /* The public tags endpoint can be unavailable; the page remains usable. */ }
}
load();
