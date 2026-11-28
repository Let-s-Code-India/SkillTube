/*
 * Purpose: Provide reusable badges UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
import { fetchAssetJson } from "../api.js";

let imagePathsPromise;

// Return badge image paths.
export async function getBadgeImagePaths() {
  if (!imagePathsPromise) {
    imagePathsPromise = fetchAssetJson("/image/catalog.json").then(
      /* Process the result after the asynchronous operation completes. */
      (catalog) => {
        const entries = [
          ...(catalog.badges || []),
          ...(catalog.weekly || []),
          ...(catalog.ticks || []),
        ];
        return new Map(
          entries.map(
            /* Build a display value for each item. */
            ({ key, file }) => [key, `/image/${file}`],
          ),
        );
      },
    );
  }
  try {
    return await imagePathsPromise;
  } catch (error) {
    imagePathsPromise = null;
    throw error;
  }
}

// Return the validated public image URL for a badge.
export function badgeImage(paths, key, alt = "") {
  const src = paths.get(key);
  if (!src) return null;
  const image = document.createElement("img");
  image.className = "badge-image";
  image.src = src;
  image.alt = alt;
  image.loading = "lazy";
  return image;
}

// Return the validated public image URL for a verified-owner tick.
export function tickImage(paths, key) {
  if (!key) return null;
  const image = badgeImage(
    paths,
    key,
    key === "tick-master-gold" ? "Master Tick" : "Blue Tick",
  );
  if (image) image.className = "tick-image";
  return image;
}

// Render a badge card and its public details.
export function badgeCard(
  paths,
  badge,
  { showReason = false, showHow = false } = {},
) {
  const card = document.createElement("article");
  card.className = `card badge-card${badge.revoked ? " badge-revoked" : ""}`;
  const image = badgeImage(paths, badge.key);
  if (image) card.append(image);
  else {
    const placeholder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    placeholder.classList.add("badge-image-placeholder");
    placeholder.setAttribute("viewBox", "0 0 24 24");
    placeholder.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "/icons.svg#badge");
    placeholder.append(use);
    card.append(placeholder);
  }
  const details = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = badge.name || "SkillTube badge";
  const tier = document.createElement("p");
  tier.className = "mut";
  tier.textContent = [
    badge.tier,
    badge.field,
    badge.weekly ? "Weekly ranking" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  details.append(name, tier);
  if (showHow && badge.how) {
    const how = document.createElement("p");
    how.textContent = `How to earn: ${badge.how}`;
    details.append(how);
  }
  if (showReason && badge.reason) {
    const reason = document.createElement("p");
    reason.textContent = badge.reason;
    details.append(reason);
  }
  if (badge.earned_at) {
    const earned = document.createElement("time");
    earned.dateTime = badge.earned_at;
    earned.textContent = `Earned ${new Date(badge.earned_at).toLocaleDateString()}`;
    details.append(earned);
  }
  if (badge.revoked) {
    const revoked = document.createElement("p");
    revoked.className = "mut";
    revoked.textContent = "No longer active";
    details.append(revoked);
  }
  card.append(details);
  return card;
}
