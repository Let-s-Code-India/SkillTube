import { config } from "./config.js";

let client;
function supabase() {
  if (!client) client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}
export function getAuthSession() {
  return supabase().auth.getSession().then(({data,error})=>{
    if(error)throw {code:"SERVER_ERROR",raw:error};
    return data.session;
  });
}
async function session() {
  return getAuthSession();
}
export function authStateChanged(callback) {
  return supabase().auth.onAuthStateChange(callback);
}
export async function signInWithGithub() {
  const {error}=await supabase().auth.signInWithOAuth({provider:"github",options:{redirectTo:`${config.siteUrl}/app/`}});
  if(error)throw {code:"SERVER_ERROR",raw:error};
}
export function signOutFromAuth() {
  return supabase().auth.signOut().then(({error})=>{
    if(error)throw {code:"SERVER_ERROR",raw:error};
  });
}
export async function fetchAssetJson(path) {
  if(typeof path!=="string"||!path.startsWith("/")||path.startsWith("//")) {
    throw new TypeError("Asset paths must be same-origin paths.");
  }
  const response=await fetch(path,{credentials:"same-origin"});
  if(!response.ok)throw new Error(`Asset request failed with status ${response.status}.`);
  return response.json();
}
export async function call(name, args = {}) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) {
    const match=String(error.message||"").trim().match(/^([A-Z][A-Z0-9_]*)(?::\s*(.*))?$/s);
    throw { code:match?.[1]||"SERVER_ERROR", arg:match?.[2]||null, raw:error };
  }
  return data;
}
export async function edge(name, body = {}) {
  const s = await session();
  if (!s) throw { code:"LOGIN_REQUIRED" };
  const r = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method:"POST",
    headers:{ "Authorization":`Bearer ${s.access_token}`, "apikey":config.supabaseAnonKey, "Content-Type":"application/json" },
    body:JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({ ok:false, code:"SERVER_ERROR" }));
  if (!r.ok || data.ok === false) throw { code:data.code || "SERVER_ERROR", arg:data.arg || null, raw:data };
  return data;
}

export async function edgeForm(name, formData) {
  const s = await session();
  if (!s) throw { code:"LOGIN_REQUIRED" };
  const r = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method:"POST",
    headers:{ "Authorization":`Bearer ${s.access_token}`, "apikey":config.supabaseAnonKey },
    body:formData
  });
  const data = await r.json().catch(() => ({ ok:false, code:"SERVER_ERROR" }));
  if (!r.ok || data.ok === false) throw { code:data.code || "SERVER_ERROR", arg:data.arg || null, raw:data };
  return data;
}

export function followByUsername(username) {
  return call("follow_by_username",{p_username:username});
}
export function markDeveloperSeenByUsername(username) {
  return call("mark_developer_seen_by_username",{p_username:username});
}
export function markDeveloperSeen(devId) {
  return call("mark_developer_seen",{p_dev:devId});
}
export function getUpdatesFeed(limit=50,before=null) {
  return call("my_updates_feed",{p_limit:limit,p_before:before});
}
export function getUnreadUpdatesCount() {
  return call("unread_updates_count");
}
export function getAlertCounts() {
  return call("my_alert_count");
}
export function markAllUpdatesSeen() {
  return call("mark_all_seen");
}
export function getDashboard() {
  return call("dashboard");
}
export function getBadgeCatalog() {
  return call("badge_catalog");
}
export function getMyAchievements(limit=20) {
  return call("my_achievements",{p_limit:limit});
}
export function getMyState() {
  return call("me_state");
}
export function markAlertsSeen() {
  return call("mark_alerts_seen");
}
