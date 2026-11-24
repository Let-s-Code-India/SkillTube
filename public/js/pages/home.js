import { call, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { refreshNotificationDots } from "../components/notification-dots.js";
export async function render(app) {
  const feed=await call("for_you_feed",{p_page:0});
  if(Array.isArray(feed)&&feed.length){
    for(const skill of feed){
      const card=document.createElement("article");card.className="card";
      const link=document.createElement("a");link.href=`#/skill/${encodeURIComponent(skill.id)}`;
      const title=document.createElement("h2");title.textContent=skill.name;
      const desc=document.createElement("p");desc.textContent=skill.short_desc;
      link.append(title,desc);
      const by=document.createElement("p");by.className="mut";by.textContent=`by @${skill.developer?.username||"developer"}`;
      card.append(link,by);app.append(card);
      link.addEventListener("click",()=>{if(skill.developer?.username)markDeveloperSeenByUsername(skill.developer.username).then(refreshNotificationDots).catch((error)=>showError(card,error.code,error.arg));});
    }
  }else{const p=document.createElement("p");p.textContent="Nothing here yet.";app.append(p);}
  const dashboard=await call("dashboard",{});
  if(dashboard?.me){ const card=document.createElement("section"); card.className="card"; const h=document.createElement("h2"); h.textContent="Your dashboard"; const detail=document.createElement("p");
    if(dashboard.me.state==="no_skill") detail.textContent="Publish your first AI resource to start your dashboard.";
    if(dashboard.me.state==="waiting") detail.textContent=`Your ranking will go live in ${dashboard.me.days_left} days.`;
    if(dashboard.me.state==="live") detail.textContent=`Rank ${dashboard.me.rank ?? "—"} · Score ${dashboard.me.score ?? "—"} · Best band ${dashboard.me.best_band ?? "—"}`;
    card.append(h,detail); app.append(card);
  }
  refreshNotificationDots();
}
