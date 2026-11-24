import { call } from "../api.js";
export async function render(app) {
  const feed=await call("for_you_feed",{p_page:0});
  const p=document.createElement("p"); p.textContent=Array.isArray(feed)?`${feed.length} listings in your feed.`:"Nothing here yet.";
  app.append(p);
  const dashboard=await call("dashboard",{});
  if(dashboard?.me){ const card=document.createElement("section"); card.className="card"; const h=document.createElement("h2"); h.textContent="Your dashboard"; const detail=document.createElement("p");
    if(dashboard.me.state==="no_skill") detail.textContent="Publish your first AI resource to start your dashboard.";
    if(dashboard.me.state==="waiting") detail.textContent=`Your ranking will go live in ${dashboard.me.days_left} days.`;
    if(dashboard.me.state==="live") detail.textContent=`Rank ${dashboard.me.rank ?? "—"} · Score ${dashboard.me.score ?? "—"} · Best band ${dashboard.me.best_band ?? "—"}`;
    card.append(h,detail); app.append(card);
  }
}
