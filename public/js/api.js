import { config } from "./config.js";

let client;
function supabase() {
  if (!client) client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}
async function session() {
  const { data } = await supabase().auth.getSession();
  return data.session;
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
