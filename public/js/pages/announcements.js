import { call } from "../api.js";
import { showError } from "../errors.js";
import { renderMarkdown } from "../components/markdown.js";
import { markAnnouncementsSeen } from "../components/announcements.js";

export async function render(app) {
  const status = document.createElement("div");
  status.className = "skeleton";
  status.setAttribute("aria-label", "Loading announcements");
  app.append(status);
  let announcements;
  try {
    announcements = await call("active_announcements");
  } catch (error) {
    status.remove();
    showError(app, error.code, error.arg);
    return;
  }
  status.remove();
  if (!announcements?.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "There are no active announcements.";
    app.append(empty);
    return;
  }
  const sorted = [...announcements].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      Date.parse(b.starts_at || 0) - Date.parse(a.starts_at || 0),
  );
  for (const announcement of sorted) {
    const article = document.createElement("article");
    article.className = "card announcement-item";
    const title = document.createElement("h2");
    title.textContent = announcement.title;
    if (announcement.pinned) title.append(document.createTextNode(" · Pinned"));
    const body = document.createElement("div");
    renderMarkdown(body, announcement.body_md);
    article.append(title, body);
    app.append(article);
  }
  markAnnouncementsSeen(sorted);
}
