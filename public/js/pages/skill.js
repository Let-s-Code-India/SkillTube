import { call } from "../api.js";
import { showError } from "../errors.js";
export async function render(app,{id}) {
  const detail=await call("skill_detail",{p_skill:id});const h=document.createElement("h2");h.textContent=detail.name;const p=document.createElement("p");p.textContent=detail.short_desc;app.append(h,p);
  const star=document.createElement("button");star.type="button";star.className="btn secondary";star.textContent=`${detail.starred?"Unstar":"Star"} · ${detail.stars||0}`;
  const message=document.createElement("div");star.addEventListener("click",async()=>{star.disabled=true;try{const result=await call("toggle_star",{p_skill:id});star.textContent=`${result.starred?"Unstar":"Star"} · ${result.stars}`;message.textContent="";}catch(error){showError(message,error.code,error.arg);}finally{star.disabled=false;}});
  app.append(star,message);
  if(detail.mine!==true)setTimeout(()=>call("record_view",{p_skill:id}).catch(()=>{}),2000);
}
