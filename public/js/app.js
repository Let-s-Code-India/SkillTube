import { hashRoute, routeParts } from "./router.js";
import { getSession, signIn, gateSession } from "./auth.js";
import { showError } from "./errors.js";
import { state } from "./state.js";
import { ageGate } from "./components/dialogs.js";
import { renderCountryPicker } from "./components/country-picker.js";
import { refreshNotificationDots } from "./components/notification-dots.js";
import { call } from "./api.js";
import { onAuthChange } from "./auth.js";

const app = document.querySelector("#app");
const drawer = document.querySelector("#drawer");
const menu = document.querySelector("#menu");

function closeDrawer() {
  drawer.classList.remove("open");
  menu.setAttribute("aria-expanded","false");
}
menu.addEventListener("click", () => {
  drawer.classList.add("open");
  menu.setAttribute("aria-expanded","true");
});
document.querySelector("#close-menu").addEventListener("click", closeDrawer);
drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));
document.addEventListener("keydown",(event) => {
  if (event.key === "Escape" && drawer.classList.contains("open")) {
    closeDrawer();
    menu.focus();
  }
});

const pageModules = {
  home:"home",
  announcements:"announcements",
  search:"search",
  skill:"skill",
  dev:"dev",
  updates:"updates",
  "my-skills":"my-skills",
  publish:"publish",
  dashboard:"dashboard",
  settings:"settings",
  badges:"badges",
  invite:"invite",
  admin:"admin"
};
const titles = {
  home:"Home", announcements:"Announcements", search:"Search", publish:"Publish a listing",
  "my-skills":"My listings", dashboard:"Dashboard", updates:"Updates",
  settings:"Settings", badges:"Badges", invite:"Invite", admin:"Admin"
};

async function loadPage(route, app) {
  const [page,id] = routeParts(route);
  const moduleName = pageModules[page];
  if (!moduleName) {
    const p=document.createElement("p"); p.textContent="Nothing here yet."; app.append(p); return;
  }
  const mod=await import(`./pages/${moduleName}.js`);
  await mod.render(app,{id,route,state});
}

async function render({signedOut=false}={}) {
  const route = hashRoute();
  const adminLink=document.querySelector("#admin-nav");
  if(adminLink)adminLink.hidden=true;
  try {
    state.session = await getSession();
  } catch(error) {
    app.replaceChildren();
    showError(app,error.code,error.arg);
    return;
  }
  if (!state.session) {
    app.replaceChildren();
    const h=document.createElement("h2"); h.textContent=signedOut?"You are signed out":"Sign in to SkillTube";
    const p=document.createElement("p"); p.textContent=signedOut?"Your session ended. Sign in with GitHub to continue.":"Browse public listings and developers without an account.";
    const authError=document.createElement("div");
    const button=document.createElement("button"); button.type="button"; button.className="btn"; button.textContent="Sign in with GitHub";
    button.addEventListener("click", async () => {
      button.disabled=true;
      try { await signIn(); }
      catch(error) { showError(authError,error.code,error.arg); }
      finally { button.disabled=false; }
    });
    app.append(h,p,authError,button);
    return;
  }
  const gate=await gateSession(state.session);
  if (!gate.ok) {
    app.replaceChildren();
    showError(app,gate.code||"ACCOUNT_NOT_READY");
    return;
  }
  const accepted=await ageGate(app,render);
  if (!accepted) return;
  let account;
  try {
    account=await call("me_state");
    if(adminLink)adminLink.hidden=account?.is_admin!==true;
  } catch(error) {
    app.replaceChildren();
    showError(app,error.code,error.arg);
    return;
  }
  if(!account?.country) {
    renderCountryPicker(app,()=>render());
    return;
  }
  app.replaceChildren();
  const h=document.createElement("h1"); h.textContent=titles[routeParts(route)[0]] || "SkillTube";
  app.append(h);
  refreshNotificationDots();
  try { await loadPage(route,app); }
  catch(error) { showError(app,error.code || "SERVER_ERROR",error.arg); }
}

window.addEventListener("hashchange",()=>render());
onAuthChange((event,session)=>{
  if(event==="SIGNED_OUT") {
    sessionStorage.removeItem("skilltube.github_token");
    state.session=null;
    setTimeout(()=>render({signedOut:true}),0);
    return;
  }
  if(event==="TOKEN_REFRESHED"&&session) {
    state.session=session;
    if(session.provider_token)sessionStorage.setItem("skilltube.github_token",session.provider_token);
  }
  if(event==="SIGNED_IN")setTimeout(()=>render(),0);
});
render();
