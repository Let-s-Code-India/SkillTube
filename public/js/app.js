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
import { topicSlugs, topicLabels } from "./topics.js";
import { mountThemePicker, syncSystemTheme } from "./components/theme-picker.js";
import { renderAvatar } from "./components/avatar.js";
import "./rules.js";

const app = document.querySelector("#app");
const drawer = document.querySelector("#drawer");
const menu = document.querySelector("#menu");
const backdrop = document.querySelector("#drawer-backdrop");
const isDesktop = () => matchMedia("(min-width: 1024px)").matches;
const sidebarStorageKey = "skilltube.sidebarCollapsed";
let hasStoredSidebarChoice = false;
try {
  const stored = localStorage.getItem(sidebarStorageKey);
  if (stored === "1" || stored === "0") {
    hasStoredSidebarChoice = true;
    document.body.classList.toggle("sidebar-collapsed", stored === "1");
  }
} catch {}
if (!hasStoredSidebarChoice && !isDesktop()) {
  document.body.classList.add("sidebar-collapsed");
}
function applySidebarState({ persist = false, focusClose = false } = {}) {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const desktop = isDesktop();
  document.body.classList.toggle("drawer-lock", !desktop && !collapsed);
  if (backdrop) backdrop.hidden = desktop || collapsed;
  menu.setAttribute("aria-expanded", String(!collapsed));
  menu.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar");
  drawer.setAttribute("aria-hidden", String(!desktop && collapsed));
  drawer.inert = !desktop && collapsed;
  if (persist) {
    try { localStorage.setItem(sidebarStorageKey, collapsed ? "1" : "0"); } catch {}
  }
  if (focusClose && !collapsed) document.querySelector("#close-menu")?.focus();
}
function setSidebarCollapsed(collapsed, options = {}) {
  const wasCollapsed = document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  applySidebarState(options);
  if (collapsed && !wasCollapsed) menu.focus();
}
applySidebarState();
menu.addEventListener("click", () => {
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"), {
    persist: true,
    focusClose: document.body.classList.contains("sidebar-collapsed"),
  });
});
document.querySelector("#close-menu")?.addEventListener("click", () => setSidebarCollapsed(true, { persist: true }));
backdrop?.addEventListener("click", () => setSidebarCollapsed(true, { persist: true }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.body.classList.contains("sidebar-collapsed")) {
    setSidebarCollapsed(true, { persist: true });
  } else if (
    event.key === "Tab" &&
    !isDesktop() &&
    !document.body.classList.contains("sidebar-collapsed")
  ) {
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
matchMedia("(min-width: 1024px)").addEventListener("change", (event) => {
  applySidebarState();
});

const topicChips = document.querySelector("#topic-chips");
function renderTopicChips() {
  if (!topicChips) return;
  const route = hashRoute();
  const hash = location.hash;
  const active = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "").get("topic")
    || new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "").get("q");
  const entries = [["All", ""], ...topicSlugs.map((topic) => [topicLabels[topic] || topic, topic])];
  topicChips.replaceChildren();
  for (const [label, topic] of entries) {
    const link = document.createElement("a");
    link.className = "chip";
    link.href = topic ? `#/search?q=${encodeURIComponent(topic)}&topic=${encodeURIComponent(topic)}` : "#/search";
    link.textContent = label;
    if ((topic ? active === topic : (route === "home" || route === "search") && !active)) {
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
mountThemePicker(themeMenu, themeButton);
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
const searchToggle = document.querySelector("#search-toggle");
searchToggle?.addEventListener("click", () => {
  const expanded = document.querySelector(".app-header")?.classList.toggle("search-open");
  searchToggle.setAttribute("aria-expanded", String(Boolean(expanded)));
  searchToggle.setAttribute("aria-label", expanded ? "Close search" : "Open search");
  if (expanded) document.querySelector("#top-search-input")?.focus();
});
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

function renderBreadcrumb(route, currentTitle = null) {
  const slot = document.querySelector("#breadcrumb-slot");
  if (!slot) return;
  slot.replaceChildren();
  const [page, id] = routeParts(route);
  let title = currentTitle || titles[page] || "SkillTube";
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

async function renderSignedOutHome({ h, p, authError, button }) {
  const welcome = document.createElement("section");
  welcome.className = "welcome-layout";
  const message = document.createElement("div");
  message.className = "welcome-message";
  h.textContent = "Find and share useful AI resources.";
  p.textContent = "Browse a developer-built directory of skills, agents, MCP servers, datasets and tools.";
  button.textContent = "Sign in with GitHub";
  message.append(h, p, authError, button);

  const features = document.createElement("div");
  features.className = "welcome-features";
  for (const [icon, title, description] of [
    ["search","Discover clearly","Compare public AI resources with structured topics and listing details."],
    ["users","Meet developers","Explore public developer channels and the work behind each listing."],
    ["code","Keep ownership","Every listing points back to its public GitHub repository."],
  ]) {
    const card = document.createElement("article");
    card.className = "card welcome-feature";
    const symbol = document.createElementNS("http://www.w3.org/2000/svg","svg");
    symbol.setAttribute("aria-hidden","true");
    const use = document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href",`/icons.svg#${icon}`);
    symbol.append(use);
    const heading = document.createElement("h3");
    heading.textContent = title;
    const detail = document.createElement("p");
    detail.textContent = description;
    card.append(symbol,heading,detail);
    features.append(card);
  }
  welcome.append(message,features);
  app.append(welcome);

  const [tagsResult, searchResult] = await Promise.allSettled([
    call("trending_tags"),
    call("public_search",{p_q:"",p_page:0}),
  ]);
  if (tagsResult.status === "fulfilled" && Array.isArray(tagsResult.value) && tagsResult.value.length) {
    const section = document.createElement("section");
    section.className = "welcome-public-section";
    const heading = document.createElement("h2");
    heading.textContent = "Trending";
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const item of tagsResult.value.slice(0,12)) {
      const tag = item.slug || item;
      const link = document.createElement("a");
      link.className = "chip";
      link.href = `#/search?q=${encodeURIComponent(tag)}`;
      link.textContent = tag;
      chips.append(link);
    }
    section.append(heading,chips);
    app.append(section);
  }
  const items = searchResult.status === "fulfilled" ? searchResult.value?.items : null;
  if (Array.isArray(items) && items.length) {
    const section = document.createElement("section");
    section.className = "welcome-public-section";
    const heading = document.createElement("h2");
    heading.textContent = "Newest listings";
    const grid = document.createElement("div");
    grid.className = "listing-grid";
    const { listingCard } = await import("./components/cards.js");
    for (const item of items.slice(0,6)) grid.append(listingCard(item));
    section.append(heading,grid);
    app.append(section);
  }
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
  renderBreadcrumb(route);
  renderTopicChips();
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
    renderBreadcrumb(route, "Sign in");
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
    if (routeParts(route)[0] === "home" && !signedOut) {
      await renderSignedOutHome({ h, p, authError, button });
    } else app.append(h, p, authError, button);
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
  const displayName = account?.name || account?.username || "Your profile";
  if (avatar) renderAvatar(avatar, displayName, avatarUrl, 44);
  const drawerAvatar = document.querySelector("#drawer-avatar");
  const drawerName = document.querySelector("#drawer-profile-name");
  if (drawerName) drawerName.textContent = displayName;
  if (drawerAvatar) renderAvatar(drawerAvatar, displayName, avatarUrl);
  const profileButton = document.querySelector("#profile-button");
  profileButton?.setAttribute("aria-label", `Profile menu for ${displayName}`);
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
  () => {
    const route = hashRoute();
    renderBreadcrumb(route);
    renderTopicChips();
    render();
  },
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
renderBreadcrumb(hashRoute());
renderTopicChips();
render();
