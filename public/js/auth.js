import { config } from "./config.js";
import { edge } from "./api.js";
import { showError } from "./errors.js";

export async function getSession() {
  const { data } = await window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey).auth.getSession();
  return data.session;
}
export function signIn() {
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client.auth.signInWithOAuth({ provider:"github", options:{ redirectTo:`${config.siteUrl}/app/` } });
}
export function signOut() {
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  sessionStorage.removeItem("skilltube.github_token");
  return client.auth.signOut();
}
export async function gateSession(session) {
  if (!session) return { ok:false, code:"LOGIN_REQUIRED" };
  const token = session.provider_token;
  if (token) sessionStorage.setItem("skilltube.github_token", token);
  try { return await edge("account-gate", token ? { github_token:token } : {}); }
  catch (error) { showError(document.querySelector("#auth-error"), error.code, error.arg); return { ok:false, code:error.code }; }
}
