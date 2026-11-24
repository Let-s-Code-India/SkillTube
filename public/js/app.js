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

document.addEventListener("keydown",(event) => {
  if (event.key === "Escape" && drawer.classList.contains("open")) {
    closeDrawer();
    document.querySelector("#menu").focus();
  }
});

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
  if (localStorage.getItem("skilltube.age_terms.accepted") !== "true") {
    app.replaceChildren();
    const h = document.createElement("h1"); h.textContent = "Before you continue";
    const label = document.createElement("label");
    const check = document.createElement("input"); check.type = "checkbox"; check.id = "age-confirm";
    const text = document.createElement("span"); text.textContent = " I am 18 or older and I accept the Terms and Privacy Policy.";
    label.append(check,text);
    const links = document.createElement("p");
    const terms = document.createElement("a"); terms.href="/legal/terms/"; terms.textContent="Terms";
    const privacy = document.createElement("a"); privacy.href="/legal/privacy/"; privacy.textContent="Privacy Policy";
    links.append(terms,document.createTextNode(" · "),privacy);
    const button = document.createElement("button"); button.type="button"; button.className="btn"; button.textContent="Continue";
    button.addEventListener("click", () => {
      if (!check.checked) { showError(app,"UNDER_AGE"); return; }
      localStorage.setItem("skilltube.age_terms.accepted","true");
      render();
    });
    app.append(h,links,label,button);
    return;
  }
  const titles = { home:"Home", search:"Search", publish:"Publish a listing", "my-skills":"My listings", dashboard:"Dashboard", updates:"Updates", settings:"Settings", badges:"Badges", invite:"Invite", admin:"Admin" };
  app.replaceChildren();
  const h = document.createElement("h1"); h.textContent = titles[route] || "SkillTube";
  app.append(h);
  try {
    if (route === "home") {
      const feed = await call("for_you_feed",{p_page:0});
      const p = document.createElement("p"); p.textContent = Array.isArray(feed) ? `${feed.length} listings in your feed.` : strings.empty;
      app.append(p);
      const dashboard = await call("dashboard",{});
      if (dashboard?.me) {
        const mine = document.createElement("section");
        mine.className = "card";
        const heading = document.createElement("h2"); heading.textContent = "Your dashboard";
        const detail = document.createElement("p");
        if (dashboard.me.state === "no_skill") detail.textContent = "Publish your first AI resource to start your dashboard.";
        if (dashboard.me.state === "waiting") detail.textContent = `Your ranking will go live in ${dashboard.me.days_left} days.`;
        if (dashboard.me.state === "live") detail.textContent = `Rank ${dashboard.me.rank ?? "—"} · Score ${dashboard.me.score ?? "—"} · Best band ${dashboard.me.best_band ?? "—"}`;
        mine.append(heading,detail);
        app.append(mine);
      }
    } else if (route === "search") {
      const form = document.createElement("form");
      const input = document.createElement("input"); input.type="search"; input.name="q"; input.placeholder="Search AI resources or @username"; input.setAttribute("aria-label","Search");
      const submit = document.createElement("button"); submit.type="submit"; submit.className="btn"; submit.textContent="Search";
      form.append(input,submit);
      const results = document.createElement("div");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        results.replaceChildren();
        const result = await call("public_search",{p_q:input.value.trim(),p_page:0}).catch((error) => { showError(results,error.code,error.arg); return null; });
        if (!result) return;
        if (result.kind === "developer" && result.developer) {
          const link = document.createElement("a"); link.href=`/dev/${encodeURIComponent(result.developer.username)}`; link.textContent=`@${result.developer.username}`;
          results.append(link);
        } else {
          const items = result.items || [];
          const p = document.createElement("p"); p.textContent=items.length ? `${items.length} listings found.` : strings.empty;
          results.append(p);
        }
      });
      app.append(form,results);
    } else if (route.startsWith("skill/")) {
      const id = route.slice("skill/".length);
      const detail = await call("skill_detail",{p_skill:id});
      const h2 = document.createElement("h2"); h2.textContent=detail.name;
      const desc = document.createElement("p"); desc.textContent=detail.short_desc;
      app.append(h2,desc);
      if (detail.mine !== true) {
        setTimeout(() => call("record_view",{p_skill:id}).catch(() => {}),2000);
      }
    } else if (route.startsWith("dev/")) {
      const name = route.slice("dev/".length);
      const developer = await call("get_developer",{p_username:name});
      if (!developer) { app.append(Object.assign(document.createElement("p"),{textContent:"Developer not found."})); }
      else {
        const h2 = document.createElement("h2"); h2.textContent=`@${developer.username}`;
        const bio = document.createElement("p"); bio.textContent=developer.bio || "No bio yet.";
        app.append(h2,bio);
      }
    } else {
      const p = document.createElement("p"); p.textContent = strings.empty;
      app.append(p);
    }
  } catch (error) { showError(app,error.code,error.arg); }
}
window.addEventListener("hashchange", render);
render();
