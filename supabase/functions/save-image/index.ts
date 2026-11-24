// =====================================================================
// SkillTube | Edge Function: save-image   (version 2)
//
// Saves a channel logo or a skill image, but ONLY after checking the file:
//   - size limit comes from the database (3 KB normal; 10 KB for Blue/Master Tick)
//   - the real file type must be SVG (everyone) or PNG (Blue Tick logo, Master Tick
//     logo and skills); the file name or label is ignored
//   - PNG at most 1024 x 1024 pixels
//   - SVG is rejected if it contains anything that can run code or call outside
//   - only the owner can change their own channel / their own skill
//   - the 10-day (skill) and 30-day (channel) edit locks are enforced by the database
//
// The browser cannot upload to storage directly. Only this function can.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor
//         name exactly:  save-image     ("Verify JWT" stays ON)
// Call with FormData:
//   action   : "upload" (default) or "remove"
//   target   : "profile" or "skill"
//   skill_id : required when target is "skill"
//   file     : the image (only for upload)
// Answer: { ok: true, path }  (path is null after remove)  |  { ok: false, code, arg, error }
// =====================================================================

const BUCKET = "skilltube-images";
const MAX_SIDE = 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}

// ---- PNG: find out the real type and the pixel size -------------
function detectRaster(
  b: Uint8Array,
): { ext: "png"; mime: string; w: number; h: number } | null {
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length > 24 && pngSig.every((v, i) => b[i] === v) && ascii(b, 12, 16) === "IHDR") {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { ext: "png", mime: "image/png", w: dv.getUint32(16), h: dv.getUint32(20) };
  }

  return null;
}

// ---- SVG: returns a plain-words problem, or null when the file looks safe --
function svgProblem(text: string): string | null {
  if (text.includes("\u0000")) return "This is not a valid SVG file.";

  const lower = text.toLowerCase();
  const compact = lower.replace(/[\s\u0000-\u001f\u007f]+/g, "");

  if (!/<svg[\s>]/.test(lower)) return "This is not a valid SVG file.";

  // elements that can run code, load other pages or embed things
  if (/<(script|foreignobject|iframe|embed|object|audio|video|canvas|link|meta|base|form|input)[\s>\/]/.test(lower)) {
    return "The SVG contains an element that is not allowed (for example script or foreignObject). Export a plain SVG logo.";
  }
  // event handlers such as onclick= onload=
  if (/[\s"'\/]on[a-z]{2,}\s*=/.test(lower)) {
    return "The SVG contains an event handler (like onclick or onload), which is not allowed.";
  }
  // dangerous links and tricks
  const badText = [
    "javascript:", "vbscript:", "data:text", "data:application", "data:image/svg",
    "<!entity", "<?xml-stylesheet", "@import", "expression(", "behavior:", "-moz-binding",
    "&#",
  ];
  for (const t of badText) {
    if (compact.includes(t)) {
      return `The SVG contains "${t}", which is not allowed. Export a plain SVG logo.`;
    }
  }
  if (/<!doctype[^>]*\[/.test(lower)) {
    return "The SVG has an internal DOCTYPE definition, which is not allowed.";
  }

  // links may only point inside the file (#id) or to small embedded raster pictures
  for (const m of lower.matchAll(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const v = (m[1] ?? m[2] ?? "").trim();
    if (v.startsWith("#")) continue;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+\/=\s]*$/.test(v)) continue;
    return "The SVG links to an outside address. Remove the link.";
  }
  // url(...) may only point inside the file
  for (const m of lower.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!v.startsWith("#")) return "The SVG uses an outside address inside url(...). Remove it.";
  }
  return null;
}


Deno.serve(async (req) => {
  const early = begin(req); if (early) return early;
  if (Number(req.headers.get("content-length") ?? "0") > 30000) {
    return reply(413, { ok: false, code: "FILE_TOO_BIG", error: "File is too large." });
  }
  const w = await who(req); if (w.err) return w.err;
  const { user, admin } = w;

  let form: FormData;
  try { form = await req.formData(); } catch { return reply(400, { ok: false, code: "BAD_REQUEST", error: "Bad request." }); }
  const action = String(form.get("action") ?? "upload");
  const target = String(form.get("target") ?? "");
  const skillId = String(form.get("skill_id") ?? "");
  if (action !== "upload" && action !== "remove") return reply(400, { ok: false, code: "BAD_ACTION", error: "Unknown action." });
  if (target !== "profile" && target !== "skill")  return reply(400, { ok: false, code: "BAD_TARGET", error: "Unknown target." });

  const { data: prof } = await admin.from("profiles").select("gate_ok, blocked, logo_path").eq("id", user.id).maybeSingle();
  if (!prof || !prof.gate_ok || prof.blocked) return reply(403, { ok: false, code: "ACCOUNT_NOT_READY", error: "Account not ready." });

  // find the current picture (and make sure the skill is really yours)
  let oldPath: string | null = null;
  if (target === "profile") {
    oldPath = prof.logo_path;
  } else {
    if (!UUID_RE.test(skillId)) return reply(400, { ok: false, code: "BAD_SKILL", error: "Bad skill id." });
    const { data: s } = await admin.from("skills").select("image_path").eq("id", skillId).eq("owner_id", user.id).is("deleted_at", null).maybeSingle();
    if (!s) return reply(403, { ok: false, code: "NOT_YOUR_SKILL", error: "You can change images only on your own skills." });
    oldPath = s.image_path;
  }

  const apply = (path: string | null) => target === "profile"
    ? admin.rpc("apply_logo", { p_user: user.id, p_path: path })
    : admin.rpc("apply_skill_image", { p_skill: skillId, p_user: user.id, p_path: path, p_is_new: oldPath === null });
  const resetView = () => target === "profile"
    ? admin.from("profiles").update({ logo_zoom: 1, logo_x: 0, logo_y: 0 }).eq("id", user.id)
    : admin.from("skills").update({ image_zoom: 1, image_x: 0, image_y: 0 }).eq("id", skillId);

  // ---- remove ----
  if (action === "remove") {
    if (!oldPath) return reply(200, { ok: true, path: null });
    const { error } = await apply(null);
    if (error) return dbFail(error);
    await resetView();
    await admin.storage.from(BUCKET).remove([oldPath]);
    return reply(200, { ok: true, path: null });
  }

  // ---- upload: rules for this person ----
  const { data: rules } = await admin.rpc("image_rules", { p_user: user.id });
  const maxBytes: number = target === "profile" ? rules.logo_max_bytes : rules.skill_max_bytes;
  const pngOk: boolean   = target === "profile" ? rules.logo_png       : rules.skill_png;

  const file = form.get("file");
  if (!(file instanceof File)) return reply(400, { ok: false, code: "NO_FILE", error: "Please choose an image." });
  if (file.size === 0) return reply(400, { ok: false, code: "NO_FILE", error: "The file is empty." });
  if (file.size > maxBytes) {
    return reply(400, { ok: false, code: "FILE_TOO_BIG", arg: String(maxBytes), error: `Image is too large. Maximum is ${Math.round(maxBytes / 1024)} KB.` });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let ext: "png" | "svg"; let mime: string;
  const raster = detectRaster(bytes);
  if (raster) {
    if (!pngOk) return reply(400, { ok: false, code: "PNG_NOT_ALLOWED", error: "Your account can upload SVG images only. PNG is for Blue Tick and Master Tick." });
    if (raster.w < 1 || raster.h < 1 || raster.w > MAX_SIDE || raster.h > MAX_SIDE) {
      return reply(400, { ok: false, code: "BAD_IMAGE", error: `Picture size must be at most ${MAX_SIDE} x ${MAX_SIDE} pixels.` });
    }
    ext = "png"; mime = raster.mime;
  } else {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return reply(400, { ok: false, code: "BAD_IMAGE", error: "Only SVG images are allowed (PNG for Blue/Master Tick)." }); }
    if (!text.trimStart().startsWith("<")) return reply(400, { ok: false, code: "BAD_IMAGE", error: "Only SVG images are allowed (PNG for Blue/Master Tick)." });
    const problem = svgProblem(text);
    if (problem) return reply(400, { ok: false, code: "BAD_SVG", error: problem });
    ext = "svg"; mime = "image/svg+xml";
  }

  // ---- save the file, then tell the database ----
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const name = target === "profile" ? `profile-${rand}.${ext}` : `skill-${skillId}-${rand}.${ext}`;
  const path = `${user.id}/${name}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (upErr) return reply(500, { ok: false, code: "SERVER_ERROR", error: "Could not save the image. Try again." });

  const { error } = await apply(path);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);   // e.g. EDIT_LOCKED: do not keep the file
    return dbFail(error);
  }
  await resetView();
  if (oldPath && oldPath !== path) await admin.storage.from(BUCKET).remove([oldPath]);
  return reply(200, { ok: true, path });
});
