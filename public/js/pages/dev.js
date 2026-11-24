import { call } from "../api.js";
export async function render(app,{id}) {
  const developer=await call("get_developer",{p_username:id});if(!developer){const p=document.createElement("p");p.textContent="Developer not found.";app.append(p);return;}
  const h=document.createElement("h2");h.textContent=`@${developer.username}`;const bio=document.createElement("p");bio.textContent=developer.bio||"No bio yet.";app.append(h,bio);
}
