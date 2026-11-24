import { getUpdatesFeed, markAllUpdatesSeen } from "../api.js";
import { showError } from "../errors.js";
import { refreshNotificationDots } from "../components/notification-dots.js";
export async function render(app) {
  const controls=document.createElement("div");
  const mark=document.createElement("button");mark.type="button";mark.className="btn secondary";mark.textContent="Mark all seen";
  controls.append(mark);app.append(controls);
  const error=document.createElement("div");
  const list=document.createElement("div");list.className="updates-list";
  app.append(error,list);
  let items;
  try{items=await getUpdatesFeed(50,null);}catch(e){showError(error,e.code,e.arg);return;}
  if(!items.length){const empty=document.createElement("p");empty.textContent="No updates from developers you follow yet.";list.append(empty);}
  for(const item of items){
    const card=document.createElement("article");card.className="card update-card";
    const title=document.createElement("h2");title.textContent=item.skill_name||"AI resource update";
    const link=document.createElement("a");link.href=`#/skill/${encodeURIComponent(item.skill_id)}`;link.textContent=`by @${item.username}`;
    const detail=document.createElement("p");detail.textContent=item.note|| (item.kind==="post"?"Published a new listing.":"Shared an update.");
    const when=document.createElement("time");when.dateTime=item.created_at;when.textContent=new Date(item.created_at).toLocaleString();
    if(item.unseen){const dot=document.createElement("span");dot.className="notification-dot blue";dot.textContent="New";dot.setAttribute("aria-label","Unread update");card.append(dot);}
    card.append(title,detail,link,when);list.append(card);
  }
  mark.addEventListener("click",async()=>{mark.disabled=true;try{await markAllUpdatesSeen();await refreshNotificationDots();list.querySelectorAll(".notification-dot.blue").forEach((dot)=>dot.remove());}catch(e){showError(error,e.code,e.arg);}finally{mark.disabled=false;}});
  try{
    await markAllUpdatesSeen();
    list.querySelectorAll(".notification-dot.blue").forEach((dot)=>dot.remove());
    await refreshNotificationDots();
  }catch(e){showError(error,e.code,e.arg);}
}
