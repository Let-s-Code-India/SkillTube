/*
 * Purpose: Centralize authentication, RPC, Edge Function, and same-origin asset requests.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
import { config } from "./config.js";

let client;
// Create or reuse the configured Supabase browser client.
function supabase() {
  if (!client)
    client = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
    );
  return client;
}
// Return auth session.
export function getAuthSession() {
  return supabase()
    .auth.getSession()
    .then(
      /* Process the result after the asynchronous operation completes. */
      ({ data, error }) => {
        if (error) throw { code: "SERVER_ERROR", raw: error };
        return data.session;
      },
    );
}
// Return the current authenticated session.
async function session() {
  return getAuthSession();
}
// Notify the app when Supabase authentication state changes.
export function authStateChanged(callback) {
  return supabase().auth.onAuthStateChange(callback);
}
// Start GitHub OAuth sign-in through the configured Supabase client.
export async function signInWithGithub() {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${config.siteUrl}/app/` },
  });
  if (error) throw { code: "SERVER_ERROR", raw: error };
}
// Sign out of the current Supabase session.
export function signOutFromAuth() {
  return supabase()
    .auth.signOut()
    .then(
      /* Process the result after the asynchronous operation completes. */
      ({ error }) => {
        if (error) throw { code: "SERVER_ERROR", raw: error };
      },
    );
}
// Fetch asset json.
export async function fetchAssetJson(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  ) {
    throw new TypeError("Asset paths must be same-origin paths.");
  }
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok)
    throw new Error(`Asset request failed with status ${response.status}.`);
  return response.json();
}
// Call a typed backend RPC and surface its normalized error code.
export async function call(name, args = {}) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) {
    const match = String(error.message || "")
      .trim()
      .match(/^([A-Z][A-Z0-9_]*)(?::\s*(.*))?$/s);
    throw {
      code: match?.[1] || "SERVER_ERROR",
      arg: match?.[2] || null,
      raw: error,
    };
  }
  return data;
}
// Call an authenticated Edge Function with the current access token.
export async function edge(name, body = {}) {
  const s = await session();
  if (!s) throw { code: "LOGIN_REQUIRED" };
  const r = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.access_token}`,
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(
    /* Handle a rejected asynchronous operation. */
    () => ({ ok: false, code: "SERVER_ERROR" }),
  );
  if (!r.ok || data.ok === false)
    throw {
      code: data.code || "SERVER_ERROR",
      arg: data.arg || null,
      raw: data,
    };
  return data;
}

// Upload multipart form data through an authenticated Edge Function.
export async function edgeForm(name, formData) {
  const s = await session();
  if (!s) throw { code: "LOGIN_REQUIRED" };
  const r = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.access_token}`,
      apikey: config.supabaseAnonKey,
    },
    body: formData,
  });
  const data = await r.json().catch(
    /* Handle a rejected asynchronous operation. */
    () => ({ ok: false, code: "SERVER_ERROR" }),
  );
  if (!r.ok || data.ok === false)
    throw {
      code: data.code || "SERVER_ERROR",
      arg: data.arg || null,
      raw: data,
    };
  return data;
}

// Resolve a developer username and update the signed-in user's follow state.
export function followByUsername(username) {
  return call("follow_by_username", { p_username: username });
}
// Mark developer seen by username.
export function markDeveloperSeenByUsername(username) {
  return call("mark_developer_seen_by_username", { p_username: username });
}
// Mark developer seen.
export function markDeveloperSeen(devId) {
  return call("mark_developer_seen", { p_dev: devId });
}
// Return updates feed.
export function getUpdatesFeed(limit = 50, before = null) {
  return call("my_updates_feed", { p_limit: limit, p_before: before });
}
// Return unread updates count.
export function getUnreadUpdatesCount() {
  return call("unread_updates_count");
}
// Return alert counts.
export function getAlertCounts() {
  return call("my_alert_count");
}
// Mark all updates seen.
export function markAllUpdatesSeen() {
  return call("mark_all_seen");
}
// Return dashboard.
export function getDashboard() {
  return call("dashboard");
}
// Return badge catalog.
export function getBadgeCatalog() {
  return call("badge_catalog");
}
// Return my achievements.
export function getMyAchievements(limit = 20) {
  return call("my_achievements", { p_limit: limit });
}
// Return my state.
export function getMyState() {
  return call("me_state");
}
// Mark alerts seen.
export function markAlertsSeen() {
  return call("mark_alerts_seen");
}
