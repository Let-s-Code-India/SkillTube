import { edge } from "./api.js";
import { getAuthSession, authStateChanged, signInWithGithub, signOutFromAuth } from "./api.js";
import { showError } from "./errors.js";

export async function getSession() {
  return getAuthSession();
}
export function signIn() {
  return signInWithGithub();
}
export function signOut() {
  sessionStorage.removeItem("skilltube.github_token");
  return signOutFromAuth();
}
export function onAuthChange(callback) {
  return authStateChanged(callback);
}
export function getGithubToken() {
  return sessionStorage.getItem("skilltube.github_token");
}
export async function gateSession(session) {
  if (!session) return { ok:false, code:"LOGIN_REQUIRED" };
  const token = session.provider_token;
  if (token) sessionStorage.setItem("skilltube.github_token", token);
  try { return await edge("account-gate", token ? { github_token:token } : {}); }
  catch (error) { showError(document.querySelector("#auth-error"), error.code, error.arg); return { ok:false, code:error.code }; }
}
