/*
 * Purpose: Provide reusable announcements UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
import { call } from "../api.js";
import { renderMarkdown } from "./markdown.js";

const lastSeenKey = "skilltube.announcements.last_seen_id";

// Select the most recent active announcement.
function latestAnnouncement(announcements) {
  return (
    [...announcements].sort(
      /* Compare the two values to order the collection. */
      (a, b) => Date.parse(b.starts_at || 0) - Date.parse(a.starts_at || 0),
    )[0] || null
  );
}

// Update announcement dot.
export function updateAnnouncementDot(announcements) {
  const dot = document.querySelector("#announcement-dot");
  if (!dot) return;
  const latest = latestAnnouncement(announcements);
  const unread = Boolean(
    latest && localStorage.getItem(lastSeenKey) !== String(latest.id),
  );
  dot.hidden = !unread;
  dot.replaceChildren();
  if (unread) {
    const indicator = document.createElement("span");
    indicator.setAttribute("aria-hidden", "true");
    dot.append(indicator);
  }
  dot.setAttribute(
    "aria-label",
    unread ? "Unread announcements" : "No unread announcements",
  );
}

// Render announcement banner.
export async function renderAnnouncementBanner(app) {
  const announcements = await call("active_announcements");
  updateAnnouncementDot(announcements || []);
  if (!announcements?.length) return;
  const section = document.createElement("section");
  section.className = "card announcement-banner";
  const heading = document.createElement("h2");
  heading.textContent = "Announcements";
  section.append(heading);
  for (const announcement of announcements.slice(0, 3)) {
    const item = document.createElement("article");
    item.className = "announcement-item";
    const title = document.createElement("h3");
    title.textContent = announcement.title;
    if (announcement.pinned) title.append(document.createTextNode(" · Pinned"));
    const body = document.createElement("div");
    body.className = "announcement-body";
    renderMarkdown(body, announcement.body_md);
    item.append(title, body);
    section.append(item);
  }
  const link = document.createElement("a");
  link.href = "#/announcements";
  link.textContent = "View all announcements";
  section.append(link);
  const title = app.querySelector("h1");
  if (title) title.after(section);
  else app.prepend(section);
}

// Mark announcements seen.
export function markAnnouncementsSeen(announcements) {
  const latest = latestAnnouncement(announcements || []);
  if (latest) localStorage.setItem(lastSeenKey, String(latest.id));
  updateAnnouncementDot(announcements || []);
}
