import { hashRoute } from "./router.js";
import { getSession, signIn, signOut, gateSession } from "./auth.js";
import { call } from "./api.js";
import { showError } from "./errors.js";
import { strings } from "./strings.js";

const app = document.querySelector("#app");
const drawer = document.querySelector("#drawer");
function closeDrawer() { drawer.classList.remove("open"); document.querySelector("#menu").setAttribute("aria-expanded","false"); }
document.querySelector("#menu").addEventListener("click", () => { drawer.classList.add("open"); document.querySelector("#menu").setAttribute("aria-expanded","true"); });
document.querySelector("#close-menu").addEventListener("click", closeDrawer);
drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));

async function render() {
  const route = hashRoute();
  let session = await getSession();
  if (!session) {
    app.replaceChildren();
    const h = document.createElement("h1"); h.textContent = "Sign in to SkillTube";
    const p = document.createElement("p"); p.textContent = "Browse public listings and developers without an account.";
    const button = document.createElement("button"); button.type="button"; button.className="btn"; button.textContent=strings.signIn;
    button.addEventListener("click", () => signIn());
    app.append(h,p,button);
    return;
  }
  const gate = await gateSession(session);
  if (!gate.ok) { app.textContent = "Sign-in setup could not be completed."; return; }
  const titles = { home:"Home", search:"Search", publish:"Publish a listing", "my-skills":"My listings", dashboard:"Dashboard", updates:"Updates", settings:"Settings", badges:"Badges", invite:"Invite", admin:"Admin" };
  app.replaceChildren();
  const h = document.createElement("h1"); h.textContent = titles[route] || "SkillTube";
  app.append(h);
  try {
    if (route === "home") {
      const feed = await call("for_you_feed",{p_page:0});
      const p = document.createElement("p"); p.textContent = Array.isArray(feed) ? `${feed.length} listings in your feed.` : strings.empty;
      app.append(p);
    } else if (route === "search") {
      const p = document.createElement("p"); p.textContent = "Search public listings and developers.";
      app.append(p);
    } else {
      const p = document.createElement("p"); p.textContent = strings.empty;
      app.append(p);
    }
  } catch (error) { showError(app,error.code,error.arg); }
}
window.addEventListener("hashchange", render);
render();
