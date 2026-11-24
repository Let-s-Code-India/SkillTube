import { call } from "../api.js";
import { showError } from "../errors.js";
export async function render(app) {
  const form=document.createElement("form"); const input=document.createElement("input"); input.type="search"; input.placeholder="Search AI resources or @username"; input.setAttribute("aria-label","Search");
  const submit=document.createElement("button"); submit.type="submit"; submit.className="btn"; submit.textContent="Search"; form.append(input,submit);
  const results=document.createElement("div");
  form.addEventListener("submit",async(event)=>{event.preventDefault();results.replaceChildren();const result=await call("public_search",{p_q:input.value.trim(),p_page:0}).catch((e)=>{showError(results,e.code,e.arg);return null;});
    if(!result)return;if(result.kind==="developer"&&result.developer){const a=document.createElement("a");a.href=`/dev/${encodeURIComponent(result.developer.username)}`;a.textContent=`@${result.developer.username}`;results.append(a);}else{const p=document.createElement("p");p.textContent=(result.items||[]).length?`${result.items.length} listings found.`:"Nothing here yet.";results.append(p);}
  });app.append(form,results);
}
