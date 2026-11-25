/*
 * Purpose: Manage GitHub sign-in, session access, and account readiness.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
import { edge } from "./api.js";
import {
  getAuthSession,
  authStateChanged,
  signInWithGithub,
  signOutFromAuth,
} from "./api.js";
import { showError } from "./errors.js";

// Return session.
export async function getSession() {
  return getAuthSession();
}
// Redirect to GitHub through the configured Supabase OAuth client.
export function signIn() {
  return signInWithGithub();
}
// End the current Supabase session.
export function signOut() {
  sessionStorage.removeItem("skilltube.github_token");
  return signOutFromAuth();
}
// Subscribe to authentication changes and notify the app.
export function onAuthChange(callback) {
  return authStateChanged(callback);
}
// Return github token.
export function getGithubToken() {
  return sessionStorage.getItem("skilltube.github_token");
}
// Check whether the signed-in user completed required profile setup.
export async function gateSession(session) {
  if (!session) return { ok: false, code: "LOGIN_REQUIRED" };
  const token = session.provider_token;
  if (token) sessionStorage.setItem("skilltube.github_token", token);
  try {
    return await edge("account-gate", token ? { github_token: token } : {});
  } catch (error) {
    showError(document.querySelector("#auth-error"), error.code, error.arg);
    return { ok: false, code: error.code };
  }
}
