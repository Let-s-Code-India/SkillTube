import { call, followByUsername, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";
export async function render(app,{id}) {
  const developer=await call("get_developer",{p_username:id});if(!developer){const p=document.createElement("p");p.textContent="Developer not found.";app.append(p);return;}
  const h=document.createElement("h2");h.textContent=`@${developer.username}`;const bio=document.createElement("p");bio.textContent=developer.bio||"No bio yet.";app.append(h,bio);
  if(developer.is_following) markDeveloperSeenByUsername(developer.username).catch((error)=>showError(app,error.code,error.arg));
  const count=document.createElement("p");count.textContent=`${developer.followers} followers`;
  const follow=document.createElement("button");follow.type="button";follow.className="btn";follow.textContent=developer.is_following?"Following":"Follow";
  follow.disabled=developer.is_me===true;
  const message=document.createElement("div");
  follow.addEventListener("click",async()=>{follow.disabled=true;try{const result=await followByUsername(developer.username);follow.textContent=result.following?"Following":"Follow";count.textContent=`${result.followers} followers`;toast(result.following?"You are following this developer.":"You unfollowed this developer.");}
    catch(error){showError(message,error.code,error.arg);}finally{follow.disabled=developer.is_me===true;}});
  app.append(count,follow,message);
}
