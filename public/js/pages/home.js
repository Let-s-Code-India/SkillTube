import { call, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { refreshNotificationDots } from "../components/notification-dots.js";
import { listingCard } from "../components/cards.js";
import { renderAnnouncementBanner } from "../components/announcements.js";
export async function render(app) {
  try {
    await renderAnnouncementBanner(app);
  } catch(error) {
    const notice=document.createElement("div");
    showError(notice,error.code,error.arg);
    app.append(notice);
  }
  const status=document.createElement("div");
  status.className="listing-grid";
  status.setAttribute("aria-live","polite");
  for(let index=0;index<4;index++){
    const skeleton=document.createElement("div");
    skeleton.className="skeleton";
    skeleton.setAttribute("aria-hidden","true");
    status.append(skeleton);
  }
  app.append(status);
  let feed;
  let dashboard;
  try {
    [feed,dashboard] = await Promise.all([call("for_you_feed",{p_page:0}), loadDashboard()]);
  } catch(error) {
    status.replaceChildren();
    showError(status,error.code,error.arg);
    return;
  }
  status.replaceChildren();
  if(dashboard)app.insertBefore(dashboard,status);
  if(Array.isArray(feed)&&feed.length){
    for(const skill of feed){
      const card=listingCard(skill);
      card.addEventListener("click",(event)=>{
        if(event.target.closest("a")?.getAttribute("href")?.startsWith("#/skill/")&&skill.developer?.username) {
          markDeveloperSeenByUsername(skill.developer.username).then(refreshNotificationDots).catch((error)=>showError(card,error.code,error.arg));
        }
      });
      status.append(card);
    }
  }else{
    const p=document.createElement("p");
    p.className="mut";
    p.textContent="There are no recommendations yet. Explore Search or publish your first AI resource.";
    status.append(p);
  }
  refreshNotificationDots();
}

async function loadDashboard() {
  const dashboard=await call("dashboard",{});
  if(dashboard?.me){
    const card=document.createElement("section");
    card.className="card";
    const h=document.createElement("h2");
    h.textContent="Your dashboard";
    const detail=document.createElement("p");
    if(dashboard.me.state==="no_skill") detail.textContent="Publish your first AI resource to start your dashboard.";
    if(dashboard.me.state==="waiting") detail.textContent=`Your ranking will go live in ${dashboard.me.days_left} days.`;
    if(dashboard.me.state==="live") detail.textContent=dashboard.me.rank
      ?`Rank ${dashboard.me.rank} · Score ${Number(dashboard.me.score||0).toLocaleString()} · Best band ${dashboard.me.best_band ? `top ${dashboard.me.best_band}` : "not yet earned"}`
      :dashboard.state==="empty"
        ?"You are eligible; the first weekly ranking has not been published yet."
        :"You are eligible for ranking, but are not currently in the top 50.";
    const link=document.createElement("a");
    link.href="#/dashboard";
    link.textContent="Open your full dashboard";
    card.append(h,detail,link);
    return card;
  }
  return null;
}
