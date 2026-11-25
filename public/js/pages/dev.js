import { call, followByUsername, markDeveloperSeenByUsername } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";
import { reportButton } from "../components/report-dialog.js";
import {
  badgeCard,
  getBadgeImagePaths,
  tickImage,
} from "../components/badges.js";
import { listingCard } from "../components/cards.js";
export async function render(app, { id }) {
  const loading = document.createElement("div");
  loading.className = "skeleton";
  loading.setAttribute("aria-label", "Loading developer channel");
  app.append(loading);
  let developer;
  try {
    developer = await call("get_developer", { p_username: id });
  } catch (error) {
    loading.remove();
    showError(app, error.code, error.arg);
    return;
  }
  loading.remove();
  if (!developer) {
    const p = document.createElement("p");
    p.className = "mut";
    p.textContent = "Developer not found.";
    app.append(p);
    return;
  }
  const h = document.createElement("h2");
  h.textContent = `@${developer.username}`;
  let images = new Map();
  try {
    images = await getBadgeImagePaths();
  } catch {
    const note = document.createElement("p");
    note.className = "mut";
    note.textContent = "Badge illustrations are temporarily unavailable.";
    app.append(note);
  }
  const tick = tickImage(images, developer.tick);
  if (tick) h.append(" ", tick);
  const bio = document.createElement("p");
  bio.textContent = developer.bio || "No bio yet.";
  app.append(h, bio);
  if (developer.badges?.length) {
    const heading = document.createElement("h3");
    heading.textContent = "Earned badges";
    app.append(heading);
    const badges = document.createElement("div");
    badges.className = "badge-grid";
    for (const badge of developer.badges)
      badges.append(badgeCard(images, badge, { showReason: true }));
    app.append(badges);
  }
  if (developer.is_following)
    markDeveloperSeenByUsername(developer.username).catch((error) =>
      showError(app, error.code, error.arg),
    );
  const count = document.createElement("p");
  count.textContent = `${developer.followers} followers`;
  const follow = document.createElement("button");
  follow.type = "button";
  follow.className = "btn";
  follow.textContent = developer.is_following ? "Following" : "Follow";
  follow.disabled = developer.is_me === true;
  const message = document.createElement("div");
  follow.addEventListener("click", async () => {
    follow.disabled = true;
    try {
      const result = await followByUsername(developer.username);
      follow.textContent = result.following ? "Following" : "Follow";
      count.textContent = `${result.followers} followers`;
      toast(
        result.following
          ? "You are following this developer."
          : "You unfollowed this developer.",
      );
    } catch (error) {
      showError(message, error.code, error.arg);
    } finally {
      follow.disabled = developer.is_me === true;
    }
  });
  app.append(count, follow, message);
  const listingsHeading = document.createElement("h3");
  listingsHeading.textContent = "Listings";
  app.append(listingsHeading);
  const listings = document.createElement("div");
  listings.className = "listing-grid";
  if (developer.skills?.length) {
    for (const skill of developer.skills) listings.append(listingCard(skill));
  } else {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "This developer has no public listings yet.";
    listings.append(empty);
  }
  app.append(listings);
  if (developer.is_me !== true)
    app.append(reportButton({ kind: "channel", username: developer.username }));
}
