/*
 * Purpose: Display live public API availability on the status page.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
import { call } from "./api.js";
import { showError } from "./errors.js";

const state = document.querySelector("#api-status");
const details = document.querySelector("#api-details");

try {
  const stats = await call("public_stats");
  state.textContent = "API reachable";
  details.textContent = `${Number(stats?.skills || 0).toLocaleString()} active listings · ${Number(stats?.developers || 0).toLocaleString()} developers`;
} catch (error) {
  state.textContent = "API unavailable";
  showError(details, error.code, error.arg);
}
