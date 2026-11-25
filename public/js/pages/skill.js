import { call, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { renderMarkdown } from "../components/markdown.js";
import { imageFrame } from "../components/cards.js";
import { renderComments } from "../components/comments.js";
import { reportButton } from "../components/report-dialog.js";
import {
  badgeCard,
  getBadgeImagePaths,
  tickImage,
} from "../components/badges.js";
import { safeUrl } from "../safe-url.js";

function element(tag, text, className = "") {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function dateValue(value, label) {
  const time = element("time");
  if (value) {
    time.dateTime = value;
    time.textContent = `${label} ${new Date(value).toLocaleDateString()}`;
  } else {
    time.textContent = `${label} date unavailable`;
  }
  return time;
}

function topicLinks(tags) {
  const section = element("section", undefined, "skill-topics");
  for (const [key, label] of [
    ["t1", "Topics"],
    ["t2", "Subtopics"],
    ["t3", "Details"],
  ]) {
    const values = tags?.[key] || [];
    if (!values.length) continue;
    section.append(element("h3", label));
    const links = element("div", undefined, "chips");
    for (const value of values) {
      const slug = String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!slug) continue;
      const link = element("a", value, "chip");
      link.href = safeUrl(`/topic/${encodeURIComponent(slug)}/`) || "#";
      links.append(link);
    }
    section.append(links);
  }
  return section;
}

async function renderDeveloperDetails(container, username, fallback) {
  const info = element("div", undefined, "skill-developer-details");
  container.append(info);
  let developer = fallback;
  try {
    developer = await call("get_developer", { p_username: username });
  } catch (error) {
    showError(info, error.code, error.arg);
  }
  const identity = element("div", undefined, "skill-developer-identity");
  if (developer?.logo?.path) {
    const logo = imageFrame(
      developer.logo,
      developer.name || username,
      "skill-developer-logo",
    );
    identity.append(logo);
  }
  const link = element("a", `${developer?.name || username} (@${username})`);
  link.href = safeUrl(`#/dev/${encodeURIComponent(username)}`) || "#";
  identity.append(link);
  const paths = await getBadgeImagePaths().catch(() => {
    showError(info, "SERVER_ERROR");
    return new Map();
  });
  const tick = tickImage(paths, developer?.tick);
  if (tick) identity.append(tick);
  info.append(identity);
  if (developer?.badges?.length) {
    const badges = element(
      "div",
      undefined,
      "badge-grid skill-developer-badges",
    );
    for (const badge of developer.badges)
      badges.append(badgeCard(paths, badge));
    info.append(badges);
  }
}

export async function render(app, { id }) {
  const error = element("div");
  app.append(error);
  let detail;
  try {
    detail = await call("skill_detail", { p_skill: id });
  } catch (e) {
    showError(error, e.code, e.arg);
    return;
  }

  const article = element("article", undefined, "skill-big-card");
  const image = imageFrame(detail.image, detail.name, "skill-big-image");
  const summary = element("div", undefined, "skill-big-summary");
  summary.append(element("h2", detail.name));
  summary.append(element("p", detail.short_desc));
  const stats = element(
    "p",
    `${Number(detail.views || 0).toLocaleString()} views · ${Number(detail.stars || 0).toLocaleString()} stars · ${Number(detail.comments || 0).toLocaleString()} comments`,
    "mut",
  );
  summary.append(stats);
  if (detail.verified)
    summary.append(element("span", "✓ Owner verified", "listing-verified"));
  const developer = document.createElement("section");
  developer.className = "skill-developer";
  summary.append(developer);
  const developerUsername = detail.developer?.username;
  if (developerUsername) {
    markDeveloperSeenByUsername(developerUsername).catch((e) =>
      showError(error, e.code, e.arg),
    );
    await renderDeveloperDetails(
      developer,
      developerUsername,
      detail.developer,
    );
  }
  const dates = element("p", undefined, "mut");
  dates.append(
    dateValue(detail.created_at, "Created"),
    document.createTextNode(" · "),
    dateValue(detail.updated_at, "Updated"),
  );
  summary.append(dates);
  article.append(image, summary, topicLinks(detail.tags));

  const description = element("section", undefined, "skill-long-description");
  description.append(element("h3", "About this listing"));
  const markdownContent = element("div");
  try {
    renderMarkdown(markdownContent, detail.long_desc);
  } catch {
    markdownContent.append(
      element(
        "p",
        "The formatted description is temporarily unavailable.",
        "error",
      ),
    );
  }
  description.append(markdownContent);
  article.append(description);

  const actions = element("div", undefined, "skill-actions");
  const star = element(
    "button",
    `${detail.starred ? "Unstar" : "Star"} · ${Number(detail.stars || 0).toLocaleString()}`,
    "btn secondary",
  );
  star.type = "button";
  const actionError = element("div");
  star.addEventListener("click", async () => {
    star.disabled = true;
    try {
      const result = await call("toggle_star", { p_skill: id });
      star.textContent = `${result.starred ? "Unstar" : "Star"} · ${Number(result.stars || 0).toLocaleString()}`;
      actionError.textContent = "";
    } catch (e) {
      showError(actionError, e.code, e.arg);
    } finally {
      star.disabled = false;
    }
  });
  const source = element("button", undefined, "btn");
  source.type = "button";
  source.setAttribute("aria-label", "Open source repository on GitHub");
  const icon = element("span", "↗");
  icon.setAttribute("aria-hidden", "true");
  source.append(icon, document.createTextNode(" Source"));
  source.addEventListener("click", async () => {
    source.disabled = true;
    actionError.textContent = "";
    try {
      const repository = await call("get_download_link", { p_skill: id });
      if (
        typeof repository !== "string" ||
        !repository.startsWith("https://github.com/")
      ) {
        showError(actionError, "SOURCE_UNAVAILABLE");
        return;
      }
      const url = safeUrl(repository, { allowHash: false, allowPath: false });
      if (!url || new URL(url).hostname !== "github.com") {
        showError(actionError, "SOURCE_UNAVAILABLE");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      showError(actionError, e.code, e.arg);
    } finally {
      source.disabled = false;
    }
  });
  actions.append(star, source);
  if (detail.mine !== true) actions.append(reportButton({ kind: "skill", id }));
  article.append(actions, actionError);
  app.append(article);

  const comments = element("section", undefined, "skill-comments");
  comments.id = "comments";
  const viewError = element("div");
  app.append(comments, viewError);
  if (detail.mine !== true) {
    setTimeout(() => {
      call("record_view", { p_skill: id }).catch((e) =>
        showError(viewError, e.code, e.arg),
      );
    }, 2000);
  }
  await renderComments(comments, id, { mine: detail.mine === true });
}
