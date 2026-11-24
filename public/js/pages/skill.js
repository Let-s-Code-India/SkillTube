import { call } from "../api.js";
export async function render(app,{id}) {
  const detail=await call("skill_detail",{p_skill:id});const h=document.createElement("h2");h.textContent=detail.name;const p=document.createElement("p");p.textContent=detail.short_desc;app.append(h,p);
  if(detail.mine!==true)setTimeout(()=>call("record_view",{p_skill:id}).catch(()=>{}),2000);
}
