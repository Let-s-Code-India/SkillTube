/*
 * Purpose: Provide reusable notification dots UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
import { getAlertCounts, getUnreadUpdatesCount } from "../api.js";
import { showError } from "../errors.js";

// Set dot.
function setDot(id, count) {
  const dot = document.getElementById(id);
  if (!dot) return;
  const n = Number(count) || 0;
  dot.hidden = n === 0;
  dot.textContent = n > 0 ? String(Math.min(n, 99)) : "";
  dot.setAttribute(
    "aria-label",
    n ? `${n} unread notifications` : "No unread notifications",
  );
}
// Refresh app notification dots from the current backend counts.
export async function refreshNotificationDots() {
  try {
    const [alerts, updates] = await Promise.all([
      getAlertCounts(),
      getUnreadUpdatesCount(),
    ]);
    setDot("blue-dot", updates);
    setDot(
      "red-dot",
      Number(alerts?.reports || 0) + Number(alerts?.badges || 0),
    );
  } catch (error) {
    showError("#auth-error", error.code, error.arg);
  }
}
