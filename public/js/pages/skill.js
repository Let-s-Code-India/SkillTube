import { call } from "../api.js";
import { showError } from "../errors.js";
import { markDeveloperSeenByUsername } from "../api.js";
import { renderComments } from "../components/comments.js";
import { reportButton } from "../components/report-dialog.js";
export async function render(app,{id}) {
  const detail=await call("skill_detail",{p_skill:id});const h=document.createElement("h2");h.textContent=detail.name;const p=document.createElement("p");p.textContent=detail.short_desc;app.append(h,p);
  if(detail.developer?.username)markDeveloperSeenByUsername(detail.developer.username).catch((error)=>showError(app,error.code,error.arg));
  const star=document.createElement("button");star.type="button";star.className="btn secondary";star.textContent=`${detail.starred?"Unstar":"Star"} · ${detail.stars||0}`;
  const message=document.createElement("div");star.addEventListener("click",async()=>{star.disabled=true;try{const result=await call("toggle_star",{p_skill:id});star.textContent=`${result.starred?"Unstar":"Star"} · ${result.stars}`;message.textContent="";}catch(error){showError(message,error.code,error.arg);}finally{star.disabled=false;}});
  app.append(star,message);
  if(detail.mine!==true)app.append(reportButton({kind:"skill",id}));
  if(detail.mine!==true)setTimeout(()=>call("record_view",{p_skill:id}).catch(()=>{}),2000);
  const comments=document.createElement("section");comments.id="comments";app.append(comments);
  await renderComments(comments,id,{mine:detail.mine===true});
}
