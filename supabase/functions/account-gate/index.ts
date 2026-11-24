// =====================================================================
// SkillTube | Edge Function: account-gate
//
// Runs once right after the first GitHub sign-in. It asks GitHub when the
// account was created and calls the database function gate_pass():
//   - account at least 90 days old  -> the person may use SkillTube
//   - younger                       -> the SkillTube account is deleted again,
//                                      the person can come back later
// (Supabase does not hand over the GitHub creation date, so we ask GitHub.)
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor
//         name exactly:  account-gate     ("Verify JWT" stays ON)
// Call:   POST {}   or   POST { "github_token": "<provider_token>" }  (token optional)
// Answer: { ok: true }  |  { ok: false, reason: "too_young" | "blocked", days_old, needed }
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- who may call this from a browser (your site, Codespaces preview, local test) ----
const SITE = Deno.env.get("SITE_ORIGIN") ?? "https://skilltube.ayushgiri-ai-21.workers.dev";
function allowOrigin(o: string | null): string {
  if (!o) return SITE;
  if (o === SITE || /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/.test(o) ||
      /^https:\/\/([a-z0-9-]+\.)?ayushgiri-ai-21\.workers\.dev$/.test(o) ||
      /^http:\/\/localhost(:\d+)?$/.test(o)) return o;
  return SITE;
}
let ORIGIN = SITE;
function cors() {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}

// The database speaks in codes such as PUBLISH_LIMIT:30 or EDIT_LOCKED:7.
// We pass the code and the number to the website, which shows the words.
function dbFail(err: { message?: string } | null) {
  const m = (err?.message ?? "").trim();
  const hit = m.match(/^([A-Z][A-Z_]+)(?::\s*(.*))?$/s);
  if (!hit) return reply(500, { ok: false, code: "SERVER_ERROR", error: "Something went wrong. Try again." });
  const code = hit[1], arg = hit[2] ?? null;
  const status = code === "LOGIN_REQUIRED" ? 401
    : (code === "ACCOUNT_NOT_READY" || code === "ACCOUNT_BLOCKED" || code === "NOT_YOUR_SKILL") ? 403
    : (code === "REPO_ALREADY_LISTED") ? 409
    : (code === "READ_ONLY") ? 503 : 400;
  return reply(status, { ok: false, code, arg, error: code + (arg ? ":" + arg : "") });
}

function ghHeaders(token: string | null) {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SkillTube",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// signed-in caller + a service-role client (the service key lives only inside Supabase)
async function who(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { err: reply(401, { ok: false, code: "LOGIN_REQUIRED", error: "Please sign in first." }) };
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return { err: reply(401, { ok: false, code: "LOGIN_REQUIRED", error: "Please sign in again." }) };
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return { user: data.user, admin };
}

function begin(req: Request): Response | null {
  ORIGIN = allowOrigin(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Use POST." });
  return null;
}

Deno.serve(async (req) => {
  const early = begin(req); if (early) return early;
  const w = await who(req); if (w.err) return w.err;
  const { user, admin } = w;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const token = typeof body.github_token === "string" && body.github_token.length > 10 ? body.github_token : null;

  const { data: p } = await admin.from("profiles").select("github_id, gate_ok, github_created_at").eq("id", user.id).maybeSingle();
  if (!p?.github_id) return reply(403, { ok: false, code: "NO_GITHUB", error: "This account is not linked to GitHub." });
  if (p.gate_ok && p.github_created_at) return reply(200, { ok: true, already: true });

  // GitHub: public data of the account (the numeric id comes from the GitHub login itself)
  let res = await fetch(`https://api.github.com/user/${p.github_id}`, { headers: ghHeaders(token) });
  if (!res.ok && token) {
    res = await fetch(`https://api.github.com/user/${p.github_id}`, { headers: ghHeaders(Deno.env.get("GITHUB_API_TOKEN") ?? null) });
  }
  if (!res.ok) {
    // GitHub busy or limit reached: do NOT punish the person, ask them to retry
    return reply(502, { ok: false, code: "GITHUB_UNAVAILABLE", error: "GitHub did not answer. Try again in a minute." });
  }
  const gh = await res.json();
  const created = typeof gh.created_at === "string" ? gh.created_at : null;
  if (!created) return reply(502, { ok: false, code: "GITHUB_UNAVAILABLE", error: "GitHub did not answer properly." });

  const { data: r, error } = await admin.rpc("gate_pass", { p_user: user.id, p_github_created_at: created });
  if (error) return dbFail(error);

  if (!r.ok) {
    // too young or blocked: remove the fresh account so nothing is kept
    await admin.auth.admin.deleteUser(user.id);
    return reply(200, { ok: false, reason: r.reason ?? "too_young", days_old: r.days_old ?? null, needed: r.needed ?? null });
  }
  return reply(200, { ok: true, days_old: r.days_old });
});
