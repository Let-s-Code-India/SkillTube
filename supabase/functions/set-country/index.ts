// =====================================================================
// SkillTube | Edge Function: set-country
//
// Saves the person's country. The country must match the country that
// Cloudflare sees for the person's connection (their IP address is never
// stored; only the two-letter result is compared). The database then
// enforces the rule "change only after 90 days" (COUNTRY_LOCKED:<days left>).
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor
//         name exactly:  set-country     ("Verify JWT" stays ON)
// Call:   POST { "country": "IN" }
// Answer: { ok: true, country } | { ok: false, code: "COUNTRY_MISMATCH", detected: "US" }
//         | { ok: false, code: "COUNTRY_LOCKED", arg: "<days left>" }
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
  try { body = await req.json(); } catch { return reply(400, { ok: false, code: "BAD_REQUEST", error: "Bad request." }); }
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country)) return reply(400, { ok: false, code: "BAD_COUNTRY", error: "Choose a country." });

  // the profile must be allowed to use the app (age check passed, not blocked)
  const { data: p } = await admin.from("profiles").select("gate_ok, blocked").eq("id", user.id).maybeSingle();
  if (!p || !p.gate_ok || p.blocked) return reply(403, { ok: false, code: "ACCOUNT_NOT_READY", error: "Account not ready." });

  // country as seen by Cloudflare. XX = unknown, T1 = Tor.
  const seen = (req.headers.get("cf-ipcountry") ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(seen) && seen !== "XX" && seen !== "T1" && seen !== country) {
    return reply(400, { ok: false, code: "COUNTRY_MISMATCH", detected: seen,
      error: "The country you chose does not match your connection. Turn off VPN or choose your real country." });
  }
  if (seen === "XX" || seen === "T1") {
    return reply(400, { ok: false, code: "COUNTRY_UNVERIFIED",
      error: "We could not detect your country (VPN or Tor?). Turn it off and try again." });
  }

  const { error } = await admin.rpc("set_country", { p_user: user.id, p_country: country });
  if (error) return dbFail(error);
  return reply(200, { ok: true, country });
});
