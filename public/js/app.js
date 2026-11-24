import { hashRoute, routeParts } from "./router.js";
import { getSession, signIn, gateSession } from "./auth.js";
import { showError } from "./errors.js";
import { state } from "./state.js";
import { ageGate } from "./components/dialogs.js";
import { refreshNotificationDots } from "./components/notification-dots.js";

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
  home:"Home", search:"Search", publish:"Publish a listing",
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

async function render() {
  const route = hashRoute();
  state.session = await getSession();
  if (!state.session) {
    app.replaceChildren();
    const h=document.createElement("h1"); h.textContent="Sign in to SkillTube";
    const p=document.createElement("p"); p.textContent="Browse public listings and developers without an account.";
    const button=document.createElement("button"); button.type="button"; button.className="btn"; button.textContent="Sign in with GitHub";
    button.addEventListener("click", () => signIn());
    app.append(h,p,button);
    return;
  }
  const gate=await gateSession(state.session);
  if (!gate.ok) {
    app.replaceChildren();
    showError(app,"ACCOUNT_NOT_READY");
    return;
  }
  const accepted=await ageGate(app,render);
  if (!accepted) return;
  app.replaceChildren();
  const h=document.createElement("h1"); h.textContent=titles[routeParts(route)[0]] || "SkillTube";
  app.append(h);
  refreshNotificationDots();
  try { await loadPage(route,app); }
  catch(error) { showError(app,error.code || "SERVER_ERROR",error.arg); }
}

window.addEventListener("hashchange",render);
render();
