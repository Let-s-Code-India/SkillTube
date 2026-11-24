// =====================================================================
// SkillTube | Edge Function: add-skill   (version 4)
//
//   1. Checks the caller is signed in.
//   2. Checks the GitHub token belongs to the same GitHub account.
//   3. Asks GitHub for the repository: it must be public and the person must
//      have push or admin rights (works for personal AND organization repos).
//   4. Saves the skill through the database function create_skill()
//      (publish limit, 39 tags, text lengths are all checked there).
//
// The browser can NOT insert skills directly. Only this function can.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor
//         name exactly:  add-skill      ("Verify JWT" stays ON)
// Call:   POST { repo_url, name, short_desc, long_desc, tags: {t1:[3], t2:[9], t3:[27]}, github_token }
// Answer: { ok: true, skill_id }  |  { ok: false, code, arg, error }
// =====================================================================

const NAME_MIN = 2, NAME_MAX = 15, SHORT_MIN = 10, SHORT_MAX = 150, LONG_MIN = 30, LONG_MAX = 1500;

// counts real characters (Hindi and emoji count once each)
function textOk(v: unknown, min: number, max: number): v is string {
  if (typeof v !== "string") return false;
  const n = Array.from(v.trim()).length;
  return n >= min && n <= max;
}

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

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { ok: false, code: "BAD_REQUEST", error: "Bad request." }); }
  const { repo_url, name, short_desc, long_desc, tags, github_token } = body;

  if (typeof github_token !== "string" || github_token.length < 10) {
    return reply(400, { ok: false, code: "GITHUB_TOKEN_MISSING", error: "GitHub session expired. Sign out, sign in with GitHub again, then retry." });
  }
  if (!textOk(name, NAME_MIN, NAME_MAX))       return reply(400, { ok: false, code: "BAD_NAME",  error: `Skill name must be ${NAME_MIN} to ${NAME_MAX} characters.` });
  if (!textOk(short_desc, SHORT_MIN, SHORT_MAX)) return reply(400, { ok: false, code: "BAD_SHORT", error: `Short description must be ${SHORT_MIN} to ${SHORT_MAX} characters.` });
  if (!textOk(long_desc, LONG_MIN, LONG_MAX))   return reply(400, { ok: false, code: "BAD_LONG",  error: `Long description must be ${LONG_MIN} to ${LONG_MAX} characters.` });
  if (typeof tags !== "object" || tags === null) return reply(400, { ok: false, code: "TAGS_REQUIRED", error: "Choose all 39 tags." });

  const m = typeof repo_url === "string"
    ? repo_url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/) : null;
  if (!m) return reply(400, { ok: false, code: "BAD_REPO_URL", error: "Paste a GitHub repository link like https://github.com/owner/repo" });
  const [, ownerName, repoName] = m;

  // is the account ready, and does the GitHub token belong to this person?
  const { data: profile } = await admin.from("profiles").select("github_id, gate_ok, blocked").eq("id", user.id).maybeSingle();
  if (!profile || !profile.gate_ok || profile.blocked) return reply(403, { ok: false, code: "ACCOUNT_NOT_READY", error: "Account not ready." });
  if (!profile.github_id) return reply(403, { ok: false, code: "NO_GITHUB", error: "Your account is not linked to GitHub." });

  const meRes = await fetch("https://api.github.com/user", { headers: ghHeaders(github_token) });
  if (!meRes.ok) return reply(401, { ok: false, code: "GITHUB_TOKEN_MISSING", error: "GitHub session expired. Sign in with GitHub again." });
  const me = await meRes.json();
  if (me.id !== profile.github_id) return reply(403, { ok: false, code: "GITHUB_MISMATCH", error: "GitHub account mismatch. Sign in again." });

  // the repository
  const repoRes = await fetch(`https://api.github.com/repos/${ownerName}/${repoName}`, { headers: ghHeaders(github_token) });
  if (repoRes.status === 404) return reply(404, { ok: false, code: "REPO_NOT_FOUND", error: "Repository not found, or you have no access to it." });
  if (!repoRes.ok) return reply(502, { ok: false, code: "GITHUB_UNAVAILABLE", error: "GitHub did not answer properly. Try again in a minute." });
  const repo = await repoRes.json();
  if (repo.private) return reply(400, { ok: false, code: "REPO_PRIVATE", error: "The repository must be public." });
  if (!repo.permissions || !(repo.permissions.admin || repo.permissions.push)) {
    return reply(403, { ok: false, code: "NOT_REPO_OWNER", error: "Only people with push or admin access to the repository can list it." });
  }

  const { data: id, error } = await admin.rpc("create_skill", {
    p_owner: user.id, p_repo_id: repo.id, p_node_id: repo.node_id,
    p_gh_owner_id: repo.owner.id, p_gh_owner_login: repo.owner.login,
    p_repo_full_name: repo.full_name, p_repo_url: repo.html_url,
    p_is_fork: !!repo.fork, p_pushed_at: repo.pushed_at ?? null,
    p_name: name, p_short: short_desc, p_long: long_desc, p_tags: tags, p_verified: true,
  });
  if (error) {
    // unique-key race: two people tried the same repository at once
    if (error.code === "23505") return reply(409, { ok: false, code: "REPO_ALREADY_LISTED", error: "REPO_ALREADY_LISTED" });
    return dbFail(error);
  }
  return reply(200, { ok: true, skill_id: id });
});
