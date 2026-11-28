/*
 * Purpose: Render the home page and coordinate its UI actions.
 * Called by: public/js/app.js for the home route.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { call, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { refreshNotificationDots } from "../components/notification-dots.js";
import { listingCard } from "../components/cards.js";
import { renderAnnouncementBanner } from "../components/announcements.js";
// Render the home route into its container.
export async function render(app) {
  const greeting = document.createElement("section");
  greeting.className = "home-greeting";
  greeting.append(Object.assign(document.createElement("h2"),{textContent:"Good to see you"}));
  app.append(greeting);
  try {
    await renderAnnouncementBanner(app);
  } catch (error) {
    const notice = document.createElement("div");
    showError(notice, error.code, error.arg);
    app.append(notice);
  }
  const status = document.createElement("div");
  status.className = "listing-grid";
  status.setAttribute("aria-live", "polite");
  const heading = document.createElement("h2");
  heading.textContent = "Recommended for you";
  app.append(heading);
  for (let index = 0; index < 4; index++) {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    status.append(skeleton);
  }
  app.append(status);
  let feed;
  let dashboard;
  try {
    [feed, dashboard] = await Promise.all([
      call("for_you_feed", { p_page: 0 }),
      loadDashboard(),
    ]);
  } catch (error) {
    status.replaceChildren();
    showError(status, error.code, error.arg);
    return;
  }
  status.replaceChildren();
  if (dashboard) app.insertBefore(dashboard, status);
  if (Array.isArray(feed) && feed.length) {
    for (const skill of feed) {
      const card = listingCard(skill);
      card.addEventListener(
        "click",
        /* Handle the click event. */
        (event) => {
          if (
            event.target
              .closest("a")
              ?.getAttribute("href")
              ?.startsWith("#/skill/") &&
            skill.developer?.username
          ) {
            markDeveloperSeenByUsername(skill.developer.username)
              .then(refreshNotificationDots)
              .catch(
                /* Handle a rejected asynchronous operation. */
                (error) => showError(card, error.code, error.arg),
              );
          }
        },
      );
      status.append(card);
    }
  } else {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    const icon = document.createElementNS("http://www.w3.org/2000/svg","svg");
    icon.setAttribute("viewBox","0 0 96 96");
    icon.setAttribute("aria-hidden","true");
    icon.classList.add("empty-illustration");
    const circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
    circle.setAttribute("cx","48");circle.setAttribute("cy","48");circle.setAttribute("r","36");
    circle.setAttribute("fill","none");circle.setAttribute("stroke","var(--line)");
    icon.append(circle);
    const p = document.createElement("p");
    p.textContent = "Explore listings and publish your first AI resource.";
    const link = document.createElement("a");
    link.className = "btn"; link.href="#/search"; link.textContent="Explore Search";
    empty.append(icon,p,link);
    status.append(empty);
  }
  refreshNotificationDots();
}

// Load dashboard.
async function loadDashboard() {
  const dashboard = await call("dashboard", {});
  if (dashboard?.me) {
    const card = document.createElement("section");
    card.className = "card dashboard-summary";
    const h = document.createElement("h2");
    h.textContent = "Your dashboard";
    const detail = document.createElement("p");
    if (dashboard.me.state === "no_skill")
      detail.textContent =
        "Publish your first AI resource to start your dashboard.";
    if (dashboard.me.state === "waiting")
      detail.textContent = `Your ranking will go live in ${dashboard.me.days_left} days.`;
    if (dashboard.me.state === "live")
      detail.textContent = dashboard.me.rank
        ? `Rank ${dashboard.me.rank} · Score ${Number(dashboard.me.score || 0).toLocaleString()} · Best band ${dashboard.me.best_band ? `top ${dashboard.me.best_band}` : "not yet earned"}`
        : dashboard.state === "empty"
          ? "You are eligible; the first weekly ranking has not been published yet."
          : "You are eligible for ranking, but are not currently in the top 50.";
    const link = document.createElement("a");
    link.href = "#/dashboard";
    link.textContent = "Open your full dashboard";
    card.append(h, detail, link);
    return card;
  }
  return null;
}
