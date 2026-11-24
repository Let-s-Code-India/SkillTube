// =====================================================================
// SkillTube | catalog job  (runs every 6 hours in GitHub Actions)
//
//   1. Reads the list of listed repositories from the database.
//   2. Asks GitHub (100 repositories per question) if each one still exists,
//      is public, and who owns it now.
//   3. Sends the answers back. A repository missing in 2 checks in a row is
//      removed from SkillTube. A repository whose owner changed loses the
//      "owner verified" mark.
//   4. Removes picture files of deleted skills from storage.
//
// Safety: if more than half of the repositories look "missing" in one run,
// nothing is deleted (GitHub or the token is probably the problem) and the
// job fails so you get an e-mail from GitHub.
//
// Needs the secrets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// GITHUB_TOKEN is given by GitHub Actions automatically.
// =====================================================================

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GH = process.env.GITHUB_TOKEN || "";
const BATCH = 100;
const MAX_MISSING_SHARE = 0.5;
const MIN_FOR_SAFETY = 20;           // below this many skills the 50% rule is not applied

if (!URL_ || !KEY || !GH) {
  console.error("Missing secret: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or GITHUB_TOKEN.");
  process.exit(2);
}

const sbHeaders = { apikey: KEY, "Content-Type": "application/json" };
if (KEY.startsWith("eyJ")) sbHeaders.Authorization = "Bearer " + KEY;

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: sbHeaders, body: JSON.stringify(args ?? {}) });
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERY = `query($ids:[ID!]!){
  nodes(ids:$ids){ __typename
    ... on Repository { id nameWithOwner url isPrivate isFork pushedAt
      owner { login ... on User { databaseId } ... on Organization { databaseId } } } }
  rateLimit { remaining resetAt }
}`;

// returns an array parallel to ids: object (exists) | null (gone or not visible) | undefined (unknown, GitHub trouble)
async function askGitHub(ids) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${GH}`, "Content-Type": "application/json", "User-Agent": "SkillTube-catalog" },
        body: JSON.stringify({ query: QUERY, variables: { ids } }),
      });
      if (r.status === 502 || r.status === 503 || r.status === 403 || r.status === 429) { await sleep(attempt * 5000); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j.data || !Array.isArray(j.data.nodes)) { await sleep(attempt * 3000); continue; }
      const left = j.data.rateLimit?.remaining ?? 1000;
      if (left < 30) {
        const wait = Math.min(Math.max(new Date(j.data.rateLimit.resetAt).getTime() - Date.now(), 0) + 2000, 15 * 60 * 1000);
        console.log(`GitHub allowance low (${left}); waiting ${Math.round(wait / 1000)} s`);
        await sleep(wait);
      }
      return j.data.nodes;
    } catch (e) {
      console.log(`GitHub question failed (try ${attempt}): ${e.message}`);
      await sleep(attempt * 3000);
    }
  }
  return ids.map(() => undefined);
}

async function main() {
  // 1. everything we must check
  const items = [];
  let after = null;
  for (;;) {
    const page = await rpc("catalog_list", { p_after: after, p_limit: 1000 });
    if (!page.length) break;
    items.push(...page);
    after = page[page.length - 1].id;
    if (page.length < 1000) break;
  }
  console.log(`Skills to check: ${items.length}`);

  // 2. ask GitHub
  const results = [];
  let unknown = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const part = items.slice(i, i + BATCH);
    const nodes = await askGitHub(part.map((p) => p.node));
    part.forEach((p, k) => {
      const n = nodes[k];
      if (n === undefined) { unknown++; return; }                         // GitHub trouble: do nothing
      if (n === null || n.isPrivate || n.__typename !== "Repository") { results.push({ id: p.id, state: "missing" }); return; }
      results.push({
        id: p.id, state: "ok", full_name: n.nameWithOwner, url: n.url, fork: !!n.isFork, pushed_at: n.pushedAt,
        owner_id: n.owner?.databaseId ?? null, owner_login: n.owner?.login ?? null,
      });
    });
  }

  // 3. safety rule, then send the answers
  const missing = results.filter((r) => r.state === "missing").length;
  const checked = results.length;
  let blocked = false;
  let toSend = results;
  if (checked >= MIN_FOR_SAFETY && missing / checked > MAX_MISSING_SHARE) {
    blocked = true;
    toSend = results.filter((r) => r.state === "ok");
    console.error(`SAFETY STOP: ${missing} of ${checked} repositories look missing. Nothing was deleted.`);
  }
  const total = { ok: 0, missing: 0, deleted: 0 };
  for (let i = 0; i < toSend.length; i += 200) {
    const r = await rpc("catalog_apply", { p_results: toSend.slice(i, i + 200) });
    total.ok += r.ok; total.missing += r.missing; total.deleted += r.deleted;
  }
  console.log(`Checked ${checked}, still there ${total.ok}, missing now ${total.missing}, removed ${total.deleted}, unknown (GitHub trouble) ${unknown}`);

  // 4. pictures of deleted skills
  let removedFiles = 0;
  for (let round = 0; round < 20; round++) {
    const paths = await rpc("trash_list", { p_limit: 200 });
    if (!paths.length) break;
    const r = await fetch(`${URL_}/storage/v1/object/skilltube-images`, {
      method: "DELETE", headers: sbHeaders, body: JSON.stringify({ prefixes: paths }),
    });
    if (!r.ok) { console.log("Could not delete pictures: HTTP " + r.status); break; }
    removedFiles += await rpc("trash_done", { p_paths: paths });
  }
  console.log(`Picture files removed: ${removedFiles}`);

  if (blocked) process.exit(1);
}

main().catch((e) => { console.error("Catalog job failed:", e.message); process.exit(1); });
