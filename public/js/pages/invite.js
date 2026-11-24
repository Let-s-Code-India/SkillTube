import { call } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";

export async function render(app) {
  let state;
  try { state=await call("me_state"); }
  catch(error) { showError(app,error.code,error.arg); return; }
  const section=document.createElement("section");section.className="card";
  const heading=document.createElement("h2");heading.textContent="Invite a developer";
  const own=document.createElement("p");own.textContent=state?.invite_code?`Your invite code: ${state.invite_code}`:"Your invite code is not available.";
  section.append(heading,own);
  if(state?.invite_prompt_done){
    const done=document.createElement("p");done.className="mut";done.textContent="You have already handled the invite prompt.";section.append(done);app.append(section);return;
  }
  const form=document.createElement("form");
  const label=document.createElement("label");label.textContent="Have an invite code?";
  const input=document.createElement("input");input.type="text";input.maxLength=10;input.autocomplete="off";input.setAttribute("aria-label","Invite code");
  label.append(input);
  const redeem=document.createElement("button");redeem.type="submit";redeem.className="btn";redeem.textContent="Redeem code";
  const skip=document.createElement("button");skip.type="button";skip.className="btn secondary";skip.textContent="Skip";
  const error=document.createElement("div");
  form.append(label,redeem,skip,error);section.append(form);app.append(section);
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();redeem.disabled=true;
    try{await call("redeem_invite",{p_code:input.value.trim().toUpperCase()});toast("Invite code accepted.");location.hash="#/home";}
    catch(e){showError(error,e.code,e.arg);}
    finally{redeem.disabled=false;}
  });
  skip.addEventListener("click",async()=>{
    skip.disabled=true;
    try{await call("skip_invite_prompt");toast("Invite prompt skipped.");location.hash="#/home";}
    catch(e){showError(error,e.code,e.arg);}
    finally{skip.disabled=false;}
  });
}
