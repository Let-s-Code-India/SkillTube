/*
 * Purpose: Render the landing page and coordinate its UI actions.
 * Called by: public/index.html.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { call } from "../api.js";

if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(
    /* Handle a rejected asynchronous operation. */
    () => {},
  );

document.querySelector("#footer-slot").innerHTML = footerMarkup();
// Load public statistics and trending tags for the landing page.
async function load() {
  try {
    const stats = await call("public_stats");
    document.querySelector("#skill-count").textContent = stats?.skills ?? "0";
    document.querySelector("#developer-count").textContent =
      stats?.developers ?? "0";
    document.querySelector("#view-count").textContent = stats?.views ?? "0";
  } catch (_) {
    document.querySelector("#stats").classList.add("error");
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
