import {
  getAlertCounts,
  getBadgeCatalog,
  getMyAchievements,
  getMyState,
  markAlertsSeen,
} from "../api.js";
import { showError } from "../errors.js";
import {
  badgeCard,
  getBadgeImagePaths,
  tickImage,
} from "../components/badges.js";
import { refreshNotificationDots } from "../components/notification-dots.js";

function heading(text) {
  const title = document.createElement("h2");
  title.textContent = text;
  return title;
}

export async function render(app) {
  const error = document.createElement("div");
  app.append(error);
  let catalog, achievements, account;
  try {
    [catalog, achievements, account] = await Promise.all([
      getBadgeCatalog(),
      getMyAchievements(50),
      getMyState(),
    ]);
  } catch (e) {
    showError(error, e.code, e.arg);
    return;
  }

  let images = new Map();
  try {
    images = await getBadgeImagePaths();
  } catch {
    const note = document.createElement("p");
    note.className = "mut";
    note.textContent = "Badge illustrations are temporarily unavailable.";
    app.append(note);
  }

  const earned = document.createElement("section");
  earned.className = "badge-section";
  earned.append(heading("Your badges"));
  const activeAchievements = achievements.filter((badge) => !badge.revoked);
  if (account?.tick) {
    const tick = document.createElement("p");
    tick.className = "account-tick";
    const icon = tickImage(images, account.tick);
    if (icon) tick.append(icon);
    tick.append(
      document.createTextNode(
        account.tick === "tick-master-gold"
          ? "Master Tick earned"
          : "Blue Tick earned",
      ),
    );
    earned.append(tick);
  }
  if (!achievements.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent =
      "No badges earned yet. Browse the catalog below to see how to get started.";
    earned.append(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "badge-grid";
    for (const badge of achievements)
      grid.append(badgeCard(images, badge, { showReason: true }));
    earned.append(grid);
  }
  app.append(earned);
  try {
    const alerts = await getAlertCounts();
    const unseen = Math.max(0, Number(alerts?.badges) || 0);
    if (unseen <= activeAchievements.length) {
      await markAlertsSeen();
      await refreshNotificationDots();
    } else {
      const note = document.createElement("p");
      note.className = "mut";
      note.textContent =
        "Some new achievements are outside the 50 most recent awards; the alert will remain unread.";
      earned.append(note);
    }
  } catch (e) {
    showError(error, e.code, e.arg);
  }

  const available = document.createElement("section");
  available.className = "badge-section";
  available.append(heading("Badge catalog"));
  const note = document.createElement("p");
  note.className = "mut";
  note.textContent =
    "Badges are awarded for activity and milestones; they cannot be bought.";
  available.append(note);
  const grid = document.createElement("div");
  grid.className = "badge-grid";
  for (const badge of catalog || [])
    grid.append(badgeCard(images, badge, { showHow: true }));
  available.append(grid);
  app.append(available);
}
