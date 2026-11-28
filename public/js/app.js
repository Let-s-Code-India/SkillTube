/*
 * Purpose: Start the single-page app, route navigation, and enforce account setup gates.
 * Called by: the module script in public/app/index.html.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
import { hashRoute, routeParts } from "./router.js";
import { getSession, signIn, gateSession } from "./auth.js";
import { showError } from "./errors.js";
import { state } from "./state.js";
import { ageGate } from "./components/dialogs.js";
import { renderCountryPicker } from "./components/country-picker.js";
import { refreshNotificationDots } from "./components/notification-dots.js";
import { call } from "./api.js";
import { onAuthChange } from "./auth.js";
import { signOut } from "./auth.js";
import { topicSlugs } from "./topics.js";
import { mountThemePicker, syncSystemTheme } from "./components/theme-picker.js";
import "./rules.js";

const app = document.querySelector("#app");
const drawer = document.querySelector("#drawer");
const menu = document.querySelector("#menu");
const backdrop = document.querySelector("#drawer-backdrop");
const isDesktop = () => matchMedia("(min-width: 1024px)").matches;
let lastDrawerFocus = null;
try {
  if (localStorage.getItem("skilltube.sidebarCollapsed") === "1") document.body.classList.add("sidebar-collapsed");
} catch {}
function closeDrawer({ restore = true } = {}) {
  drawer.classList.remove("open");
  document.body.classList.remove("drawer-lock");
  if (backdrop) backdrop.hidden = true;
  menu.setAttribute("aria-expanded", "false");
  if (restore && lastDrawerFocus) lastDrawerFocus.focus();
}
function openDrawer() {
  lastDrawerFocus = document.activeElement;
  drawer.classList.add("open");
  document.body.classList.add("drawer-lock");
  if (backdrop) backdrop.hidden = false;
  menu.setAttribute("aria-expanded", "true");
  document.querySelector("#close-menu")?.focus();
}
menu.addEventListener("click", () => {
  if (isDesktop()) {
    document.body.classList.toggle("sidebar-collapsed");
    try {
      localStorage.setItem("skilltube.sidebarCollapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
    } catch {}
    menu.setAttribute("aria-expanded", String(!document.body.classList.contains("sidebar-collapsed")));
    return;
  }
  if (drawer.classList.contains("open")) closeDrawer();
  else openDrawer();
});
document.querySelector("#close-menu")?.addEventListener("click", () => closeDrawer());
backdrop?.addEventListener("click", () => closeDrawer());
drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
  if (!isDesktop()) closeDrawer({ restore: false });
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer.classList.contains("open")) {
    closeDrawer();
  } else if (event.key === "Tab" && !isDesktop() && drawer.classList.contains("open")) {
    const focusable = [...drawer.querySelectorAll("a,button")].filter((node) => !node.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
if (isDesktop()) drawer.classList.add("open");
matchMedia("(min-width: 1024px)").addEventListener("change", (event) => {
  if (event.matches) drawer.classList.add("open");
  else closeDrawer({ restore: false });
});

const topicChips = document.querySelector("#topic-chips");
function renderTopicChips() {
  if (!topicChips) return;
  const route = hashRoute();
  const hash = location.hash;
  const active = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "").get("topic")
    || new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "").get("q");
  const entries = [["All", ""] , ...topicSlugs.map((topic) => [topic.replaceAll("-", " "), topic])];
  topicChips.replaceChildren();
  for (const [label, topic] of entries) {
    const link = document.createElement("a");
    link.className = "chip";
    link.href = topic ? `#/search?q=${encodeURIComponent(topic)}&topic=${encodeURIComponent(topic)}` : "#/search";
    link.textContent = label;
    if ((topic ? active === topic : route === "search" && !active)) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    topicChips.append(link);
  }
}

const themeButton = document.querySelector("#theme-button");
const themeMenu = document.createElement("div");
themeMenu.className = "theme-menu card";
themeMenu.setAttribute("role","menu");
themeMenu.hidden = true;
themeButton?.parentElement.append(themeMenu);
mountThemePicker(themeMenu);
themeButton?.addEventListener("click", () => {
  themeMenu.hidden = !themeMenu.hidden;
  themeButton.setAttribute("aria-expanded", String(!themeMenu.hidden));
});
document.addEventListener("click", (event) => {
  if (themeMenu && !themeMenu.hidden && !themeMenu.contains(event.target) && event.target !== themeButton && !themeButton?.contains(event.target)) {
    themeMenu.hidden = true;
    themeButton?.setAttribute("aria-expanded","false");
  }
});
if (matchMedia("(prefers-color-scheme: dark)").addEventListener) {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncSystemTheme);
}

const topSearch = document.querySelector("#top-search");
topSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#top-search-input");
  const query = input?.value.trim();
  location.hash = query ? `#/search?q=${encodeURIComponent(query)}` : "#/search";
});

const pageModules = {
  home: "home",
  announcements: "announcements",
  search: "search",
  skill: "skill",
  dev: "dev",
  updates: "updates",
  "my-skills": "my-skills",
  publish: "publish",
  dashboard: "dashboard",
  settings: "settings",
  badges: "badges",
  invite: "invite",
  admin: "admin",
};
const titles = {
  home: "Home",
  announcements: "Announcements",
  search: "Search",
  publish: "Publish a listing",
  "my-skills": "My listings",
  dashboard: "Dashboard",
  updates: "Updates",
  settings: "Settings",
  badges: "Badges",
  invite: "Invite",
  admin: "Admin",
};

function renderBreadcrumb(route) {
  const slot = document.querySelector("#breadcrumb-slot");
  if (!slot) return;
  slot.replaceChildren();
  const [page, id] = routeParts(route);
  let title = titles[page] || "SkillTube";
  if (page === "skill" && id) title = "Listing";
  if (page === "dev" && id) title = "Developer";
  const nav = document.createElement("nav");
  nav.className = "breadcrumb";
  nav.setAttribute("aria-label","Breadcrumb");
  const skillLink = document.createElement("a");
  skillLink.href = "#/home";
  skillLink.textContent = "SkillTube";
  const current = document.createElement("h1");
  current.textContent = title;
  current.setAttribute("aria-current","page");
  nav.append(skillLink, document.createTextNode(" / "), current);
  slot.append(nav);
  document.querySelectorAll(".drawer a").forEach((link) => {
    const activeRoute = link.getAttribute("href") === `#/${page}`;
    link.classList.toggle("active", activeRoute);
    if (activeRoute) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  });
}

// Load page.
async function loadPage(route, app) {
  const [page, id] = routeParts(route);
  const moduleName = pageModules[page];
  if (!moduleName) {
    const p = document.createElement("p");
    p.textContent = "Nothing here yet.";
    app.append(p);
    return;
  }
  const mod = await import(`./pages/${moduleName}.js`);
  await mod.render(app, { id, route, state });
}

let rendering = false;
let renderAgain = false;
// Run one render at a time. Sign-in fires several events at once; extra requests are merged
// into one more run afterwards. A step that hangs is stopped after 25 seconds with a retry button.
async function render(options = {}) {
  if (rendering) {
    renderAgain = true;
    return;
  }
  rendering = true;
  let timer;
  try {
    await Promise.race([
      renderOnce(options),
      new Promise(
        /* Reject when the render takes too long. */
        (_, reject) => {
          timer = setTimeout(() => reject({ code: "SETUP_TIMEOUT" }), 25000);
        },
      ),
    ]);
  } catch (error) {
    app.replaceChildren();
    showError(app, error?.code || "SETUP_TIMEOUT", error?.arg);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn";
    retry.textContent = "Try again";
    retry.addEventListener(
      "click",
      /* Handle the click event. */
      () => render(),
    );
    app.append(retry);
  } finally {
    clearTimeout(timer);
    rendering = false;
    if (renderAgain) {
      renderAgain = false;
      render();
    }
  }
}

// Render the signed-out shell, account gates, or active route.
async function renderOnce({ signedOut = false } = {}) {
  const route = hashRoute();
  const adminLink = document.querySelector("#admin-nav");
  if (adminLink) adminLink.hidden = true;
  try {
    state.session = await getSession();
  } catch (error) {
    app.replaceChildren();
    showError(app, error.code, error.arg);
    return;
  }
  if (!state.session) {
    app.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = signedOut ? "You are signed out" : "Sign in to SkillTube";
    const p = document.createElement("p");
    p.textContent = signedOut
      ? "Your session ended. Sign in with GitHub to continue."
      : "Browse public listings and developers without an account.";
    const authError = document.createElement("div");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = "Sign in with GitHub";
    button.addEventListener(
      "click",
      /* Handle the click event. */
      async () => {
        button.disabled = true;
        try {
          await signIn();
        } catch (error) {
          showError(authError, error.code, error.arg);
        } finally {
          button.disabled = false;
        }
      },
    );
    app.append(h, p, authError, button);
    return;
  }
  const gate = await gateSession(state.session);
  if (!gate.ok) {
    app.replaceChildren();
    showError(app, gate.code || "ACCOUNT_NOT_READY", gate.arg);
    return;
  }
  const accepted = await ageGate(app, render);
  if (!accepted) return;
  let account;
  try {
    account = await call("me_state");
    if (adminLink) adminLink.hidden = account?.is_admin !== true;
  } catch (error) {
    app.replaceChildren();
    showError(app, error.code, error.arg);
    return;
  }
  state.profile = account;
  const avatar = document.querySelector("#profile-avatar");
  const avatarUrl = account?.avatar_url || account?.github_avatar_url;
  if (avatar) {
    if (typeof avatarUrl === "string" && avatarUrl) {
    avatar.replaceChildren();
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.width = 36;
    image.height = 36;
    avatar.append(image);
    } else {
    const name = account?.name || account?.username || "SkillTube";
    avatar.textContent = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0,2).toUpperCase();
    }
  }
  const profileButton = document.querySelector("#profile-button");
  const profileMenu = document.querySelector("#profile-menu");
  if (profileMenu) {
    profileMenu.replaceChildren();
    for (const [label, href] of [["Dashboard","#/dashboard"],["My listings","#/my-skills"],["Settings","#/settings"]]) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.setAttribute("role","menuitem");
    profileMenu.append(link);
    }
    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.textContent = "Sign out";
    signOutButton.setAttribute("role","menuitem");
    signOutButton.addEventListener("click", () => signOut().catch(() => {}));
    profileMenu.append(signOutButton);
  }
  profileButton?.addEventListener("click", () => {
    if (!profileMenu) return;
    profileMenu.hidden = !profileMenu.hidden;
    profileButton.setAttribute("aria-expanded", String(!profileMenu.hidden));
  });
  if (!account?.country) {
    renderCountryPicker(
      app,
      /* Re-render after the user saves their country. */
      () => render(),
    );
    return;
  }
  app.replaceChildren();
  renderBreadcrumb(route);
  renderTopicChips();
  refreshNotificationDots();
  try {
    await loadPage(route, app);
  } catch (error) {
    showError(app, error.code || "SERVER_ERROR", error.arg);
  }
}

window.addEventListener(
  "hashchange",
  /* Handle the hashchange event. */
  () => render(),
);
onAuthChange(
  /* Respond to the authentication state change. */
  (event, session) => {
    if (event === "SIGNED_OUT") {
      sessionStorage.removeItem("skilltube.github_token");
      state.session = null;
      setTimeout(
        /* Run the follow-up action after the delay. */
        () => render({ signedOut: true }),
        0,
      );
      return;
    }
    if (event === "TOKEN_REFRESHED" && session) {
      state.session = session;
      if (session.provider_token)
        sessionStorage.setItem(
          "skilltube.github_token",
          session.provider_token,
        );
    }
    if (event === "SIGNED_IN")
      setTimeout(
        /* Run the follow-up action after the delay. */
        () => render(),
        0,
      );
  },
);
render();
