import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("SKIP: Playwright is not installed; run npm install to enable UI smoke tests.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const diagnosticsBaseUrl = process.env.UI_DIAGNOSTICS_BASE_URL;
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
    const content = await readFile(file);
    response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const demoSkill = {
  id: "demo-skill",
  name: "Helpful AI Resource",
  short_desc: "A useful open source assistant resource.",
  long_desc: "A clear long description of this open source resource for the SkillTube smoke test.",
  views: 128,
  stars: 24,
  comments: 3,
  created_at: "2026-11-20T12:00:00Z",
  updated_at: "2026-11-27T12:00:00Z",
  status: "active",
  developer: { username: "demo", name: "Demo Developer", tick: "tick-blue", logo: null },
  tags: { t1: ["AI & agents"], t2: [], t3: [] },
};
const leaderboard = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  username: index === 2 ? "demo" : `maker${index + 1}`,
  name: index === 2 ? "Demo Developer" : `Maker ${index + 1}`,
  score: 1240 - index * 75,
}));
const demoDeveloper = {
  username: "demo",
  name: "Demo Developer",
  bio: "Building open source AI resources.",
  followers: 22,
  is_following: false,
  is_me: false,
  skills: [demoSkill],
  badges: [],
};
let dashboardState = "live";
let lastSearchQuery = null;
let callCount = 0;
const pageErrors = [];
const rpcValue = (name, args) => {
  callCount += 1;
  switch (name) {
    case "me_state":
      return { id: "demo-user", username: "demo", name: "Demo Developer", country: "IN", publish_limit: 5, listings_used: 1, followers: 22, is_admin: true, admin_can_write: true, image_rules: {} };
    case "dashboard":
      return {
        state: dashboardState === "live" ? "live" : "empty",
        week: "202648",
        me: dashboardState === "waiting"
          ? { state: "waiting", days_left: 4 }
          : dashboardState === "empty"
            ? { state: "no_skill" }
            : { state: "live", rank: 3, score: 1240 },
        top: dashboardState === "live" ? leaderboard : [],
      };
    case "for_you_feed":
    case "my_skills":
      return [demoSkill];
    case "public_search":
      lastSearchQuery = args?.p_q ?? null;
      return { kind: "skills", items: [demoSkill] };
    case "skill_detail":
      return { ...demoSkill, developer: demoDeveloper, starred: false };
    case "get_developer":
      return demoDeveloper;
    case "get_download_link":
      return "https://github.com/demo/skill";
    case "badge_catalog":
      return [{ key: "helpful", name: "Helpful", tier: "Bronze", how: "Contribute useful resources." }];
    case "my_achievements":
      return [{ key: "helpful", name: "Helpful", tier: "Bronze", reason: "Shared a resource.", earned_at: "2026-11-20T12:00:00Z" }];
    case "public_settings":
      return { blue_tick_followers: 1000, master_tick_blue_followers: 100, master_tick_countries: 10 };
    case "public_stats":
      return { real: true, skills: 24, developers: 12, members: 35 };
    case "trending_tags":
      return [{ slug: "ai-agents" }, { slug: "web-frontend" }, { slug: "data-db" }];
    case "tag_picker":
      return [{ slug: "ai-agents", label: "AI & agents" }, { slug: "web-frontend", label: "Web & frontend" }];
    case "admin_list":
      return [{ user_id: "demo-user", role: "owner", username: "demo" }];
    case "admin_overview":
      return { reports: 0, users: 1, listings: 1 };
    case "admin_settings_get":
      return [];
    case "active_announcements":
    case "my_updates_feed":
    case "my_notices":
    case "badge_catalog":
    case "admin_report_queue":
    case "admin_audit":
    case "admin_blocked_list":
    case "admin_announcements":
      return [];
    case "my_alert_count":
      return { reports: 0, badges: 0 };
    case "unread_updates_count":
    case "mark_all_seen":
    case "mark_alerts_seen":
    case "mark_announcements_seen":
    case "mark_developer_seen_by_username":
    case "record_view":
      return 0;
    case "toggle_star":
      return { starred: true, stars: 25 };
    case "follow_by_username":
      return { following: true, followers: 23 };
    default:
      return [];
  }
};

const errors = [];
const failures = [];
const statusErrors = [];
const diagnostics = [];
let browser;
try {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (/executable|browser|shared librar/i.test(String(error))) {
      console.log("SKIP: Playwright Chromium is unavailable. Run npx playwright install chromium.");
      process.exitCode = 0;
    } else throw error;
  }
  if (!browser) process.exitCode = 0;
  else {
    const sizes = [390, 768, 1440];
    const themes = ["light", "dark", "contrast"];
    const routes = [
      ["home", "#/home"],
      ["search", "#/search?q=web-frontend"],
      ["publish", "#/publish"],
      ["my-listings", "#/my-skills"],
      ["dashboard", "#/dashboard"],
      ["updates", "#/updates"],
      ["badges", "#/badges"],
      ["settings", "#/settings"],
      ["admin", "#/admin"],
      ["skill", "#/skill/demo-skill"],
      ["developer", "#/dev/demo"],
    ];

    async function configurePage(page, dashboardVariant = "live") {
      dashboardState = dashboardVariant;
      await page.route("**/functions/v1/**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
      );
      await page.route("**/auth/v1/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "demo-user",
            aud: "authenticated",
            role: "authenticated",
            email: "demo@example.test",
            user_metadata: { user_name: "demo", avatar_url: "" },
            app_metadata: { provider: "github", providers: ["github"] },
          }),
        }),
      );
      await page.route("**/rest/v1/rpc/**", async (route) => {
        const url = new URL(route.request().url());
        const name = decodeURIComponent(url.pathname.split("/").at(-1));
        let args = {};
        try { args = JSON.parse(route.request().postData() || "{}"); } catch {}
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(rpcValue(name, args)),
        });
      });
      await page.addInitScript((theme) => {
        const user = {
          id: "demo-user",
          aud: "authenticated",
          role: "authenticated",
          email: "demo@example.test",
          user_metadata: { user_name: "demo", avatar_url: "" },
          app_metadata: { provider: "github", providers: ["github"] },
        };
        localStorage.setItem("sb-tdxzcpigazlzzbyoccwo-auth-token", JSON.stringify({
          access_token: "smoke-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          refresh_token: "smoke-refresh-token",
          user,
        }));
        localStorage.setItem("skilltube.age_terms.accepted", "true");
        localStorage.setItem("skilltube.theme", theme);
      }, "light");
    }

    async function assertPage(page, routeName, width) {
      await page.waitForSelector("#breadcrumb-slot h1");
      await page.waitForFunction(() => !document.querySelector("#app .skeleton[aria-label='Loading dashboard']"));
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => {
        const header = document.querySelector(".app-header").getBoundingClientRect();
        const main = document.querySelector(".app-main").getBoundingClientRect();
        const drawer = document.querySelector("#drawer").getBoundingClientRect();
        const breadcrumb = document.querySelector(".breadcrumb").getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          width: window.innerWidth,
          h1Count: document.querySelectorAll("h1").length,
          headerBottom: header.bottom,
          mainTop: main.top,
          mainLeft: main.left,
          sidebarLeft: drawer.left,
          sidebarRight: drawer.right,
          sidebarTop: drawer.top,
          breadcrumbTop: breadcrumb.top,
          drawerOpen: document.querySelector("#drawer").classList.contains("open"),
          topicCount: document.querySelectorAll("#topic-chips .chip").length,
          topbarDisplay: getComputedStyle(document.querySelector(".topbar")).display,
          searchVisible: getComputedStyle(document.querySelector("#top-search")).display !== "none",
          searchToggleVisible: getComputedStyle(document.querySelector("#search-toggle")).display !== "none",
          themeVisible: getComputedStyle(document.querySelector("#theme-button")).display !== "none",
          controls: ["#menu",".brand","#search-toggle","#top-search",".nav-actions"].map((selector) => {
            const node=document.querySelector(selector);const rect=node.getBoundingClientRect();
            return {selector,display:getComputedStyle(node).display,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
          }),
          overflowing: [...document.body.querySelectorAll("*")].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width && rect.right > window.innerWidth + 1 && !node.closest(".topic-chips");
          }).slice(0,8).map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}.${node.className?.baseVal || node.className || ""} right=${Math.round(node.getBoundingClientRect().right)}`),
          widths: ["#main","#app",".settings-layout",".settings-subnav",".settings-content",".topic-chips"].map((selector) => {
            const node=document.querySelector(selector);const rect=node?.getBoundingClientRect();
            return `${selector}:${rect ? `${Math.round(rect.left)}..${Math.round(rect.right)} w${Math.round(rect.width)} scroll${node.scrollWidth}` : "missing"}`;
          }),
        };
      });
      assert.equal(state.h1Count, 1, `${routeName} at ${width}px must have exactly one h1`);
      assert.ok(state.topicCount >= 16, `${routeName} at ${width}px must render every topic chip`);
      assert.equal(state.topbarDisplay,"grid",`Header controls use a single-line grid at ${width}px`);
      assert.ok(state.scrollWidth <= state.width, `${routeName} at ${width}px has horizontal overflow (${state.scrollWidth}px): ${state.overflowing.join(", ")}; ${state.widths.join("; ")}`);
      assert.ok(state.breadcrumbTop >= state.headerBottom - 1, `${routeName} overlaps the header at ${width}px`);
      if (width >= 1024) {
        assert.ok(state.drawerOpen, "Desktop sidebar should be persistent without a menu click");
        assert.equal(Math.round(state.sidebarTop), 64, "Desktop sidebar starts below the 64px toolbar");
        assert.equal(Math.round(state.sidebarRight - state.sidebarLeft), 240, "Desktop sidebar width is 240px");
        assert.ok(state.mainLeft >= state.sidebarRight - 1, "Main content must start at the sidebar edge");
      } else {
        assert.ok(!state.drawerOpen, "Mobile/tablet drawer starts closed");
        assert.ok(state.breadcrumbTop >= state.headerBottom - 1, "Mobile content starts after the header and topic row");
      }
      if (width <= 700) {
        assert.ok(!state.searchVisible && state.searchToggleVisible && state.themeVisible, "Mobile header keeps search collapsed and theme visible");
        const visibleControls=state.controls.filter((item)=>item.display!=="none" && item.selector!=="#top-search");
        for (let index=1;index<visibleControls.length;index++) {
          assert.ok(visibleControls[index].left >= visibleControls[index-1].right-1, `Mobile header controls overlap: ${visibleControls[index-1].selector} and ${visibleControls[index].selector}`);
        }
      }
      return state;
    }

    for (const width of sizes) {
      for (const theme of themes) {
        for (const [routeName, hash] of routes) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          errors.length = 0;
          failures.length = 0;
          statusErrors.length = 0;
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("requestfailed", (request) => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
          page.on("response", (response) => { if (response.status() >= 400) statusErrors.push(`${response.status()} ${response.url()}`); });
          await configurePage(page);
          await page.goto(`${baseUrl}/app/${hash}`, { waitUntil: "networkidle" });
          if (routeName === "admin") {
            const tab = page.locator(".admin-tabs button").first();
            if (await tab.count()) await tab.click();
          }
          const state = await assertPage(page, routeName, width);
          await page.screenshot({ path: `/tmp/skilltube-ui-smoke/${routeName}-${width}-${theme}.png`, fullPage: true });
          if (routeName === "home" && width === 390 && theme === "light") {
            await page.locator("#menu").click();
            assert.ok(await page.locator("#drawer").evaluate((node) => node.classList.contains("open")));
            assert.equal(await page.locator("#drawer-profile-name").textContent(),"Demo Developer");
            await page.locator("#menu").click();
            await page.locator("#search-toggle").click();
            const searchRect = await page.locator("#top-search").evaluate((node) => {
              const rect=node.getBoundingClientRect();
              return {display:getComputedStyle(node).display,width:rect.width,top:rect.top};
            });
            assert.equal(searchRect.display,"flex");
            assert.ok(searchRect.width >= width - 20 && searchRect.top >= 64,"Expanded mobile search occupies a full-width row below the toolbar");
            const targets=await page.locator("#menu,#search-toggle,#theme-button").evaluateAll((nodes)=>nodes.map((node)=>{const rect=node.getBoundingClientRect();return Math.min(rect.width,rect.height)}));
            assert.ok(targets.every((size)=>size>=44),"Mobile header touch targets are at least 44px");
            diagnostics.push("mobile header interactions: drawer profile reachable; expanded search full-width; touch targets >=44px");
          }
          assert.deepEqual(errors, [], `${routeName}/${width}/${theme} console errors`);
          assert.deepEqual(failures, [], `${routeName}/${width}/${theme} failed requests`);
          assert.deepEqual(statusErrors, [], `${routeName}/${width}/${theme} HTTP errors`);
          if (routeName === "dashboard" && width === 1440 && theme === "light") {
            const grid = await page.locator(".dashboard-grid:not(.dashboard-row-three)").evaluate((node) => [...node.children].map((item) => getComputedStyle(item).gridColumn));
            assert.deepEqual(grid.slice(0,2), ["span 8", "span 4"], "Dashboard chart grid must be 8/4 on desktop");
            assert.equal(await page.locator(".kpi-grid .kpi-card").count(), 4, "Live dashboard shows four KPI cards");
            assert.equal(await page.locator(".chart-bar").count(),10,"Weekly chart renders all ten rows");
          }
          if (routeName === "dashboard" && width === 768 && theme === "light") {
            const columns = await page.locator(".kpi-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
            assert.equal(columns, 2, "Tablet dashboard KPIs use two columns");
            for (const selector of [".dashboard-grid:not(.dashboard-row-three)", ".dashboard-row-three"]) {
              const spans = await page.locator(selector).evaluate((node) => [...node.children].map((item) => getComputedStyle(item).gridColumn));
              assert.ok(spans.every((span) => span === "span 12"), `Tablet dashboard stacks ${selector} cards into one column`);
            }
          }
          diagnostics.push(`${routeName}/${width}/${theme}: h1=${state.h1Count}, chips=${state.topicCount}, scroll=${state.scrollWidth}/${state.width}, errors=0`);
          await page.close();
        }
      }
    }

    const chipPage = await browser.newPage({ viewport: { width: 390, height: 850 } });
    await configurePage(chipPage);
    await chipPage.goto(`${baseUrl}/app/#/home`, { waitUntil: "networkidle" });
    await chipPage.locator("#topic-chips a").filter({ hasText: "Web & frontend" }).click();
    await chipPage.waitForSelector("#app .search-toolbar");
    await chipPage.waitForFunction(() => document.querySelector("#app h2")?.textContent.includes("web-frontend"));
    assert.equal(lastSearchQuery, "web-frontend", "Topic click sends its selected slug as the search query");
    diagnostics.push("topic click: Web & frontend -> public_search(p_q=web-frontend), results heading updated");
    await chipPage.close();

    for (const variant of ["empty", "waiting"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
      await configurePage(page, variant);
      await page.goto(`${baseUrl}/app/#/dashboard`, { waitUntil: "networkidle" });
      await page.waitForSelector(".empty-banner");
      await page.screenshot({ path: `/tmp/skilltube-ui-smoke/dashboard-${variant}-390-light.png`, fullPage: true });
      diagnostics.push(`dashboard/${variant}/390/light: banner visible, h1=${await page.locator("h1").count()}`);
      await page.close();
    }

    const signedOutPage = await browser.newPage({ viewport: { width: 390, height: 850 } });
    const signedOutErrors = [];
    signedOutPage.on("console", (message) => { if (message.type() === "error") signedOutErrors.push(message.text()); });
    signedOutPage.on("pageerror", (error) => signedOutErrors.push(error.message));
    await signedOutPage.route("**/rest/v1/rpc/**", async (route) => {
      const url = new URL(route.request().url());
      const name = decodeURIComponent(url.pathname.split("/").at(-1));
      let args = {};
      try { args = JSON.parse(route.request().postData() || "{}"); } catch {}
      await route.fulfill({ status:200,contentType:"application/json",body:JSON.stringify(rpcValue(name,args)) });
    });
    await signedOutPage.goto(`${baseUrl}/app/#/home`,{waitUntil:"networkidle"});
    await signedOutPage.waitForSelector(".welcome-layout");
    assert.equal(await signedOutPage.locator(".breadcrumb h1").textContent(),"Sign in");
    assert.equal(await signedOutPage.locator("h1").count(),1);
    assert.equal(await signedOutPage.locator(".welcome-feature").count(),3);
    assert.equal(await signedOutPage.locator(".welcome-features").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),1);
    assert.deepEqual(signedOutErrors,[]);
    await signedOutPage.screenshot({path:"/tmp/skilltube-ui-smoke/signed-out-home-390-light.png",fullPage:true});
    diagnostics.push("signed-out home/390/light: breadcrumb=Sign in, one h1, three feature cards, console errors=0");
    await signedOutPage.close();

    for (const [variant, status] of [["live",200],["not-real",200],["failed",503]]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      errors.length = 0;
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/rest/v1/rpc/**", async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").at(-1);
        if (name === "public_stats") {
          if (variant === "failed") await route.fulfill({ status,contentType:"application/json",body:JSON.stringify({message:"temporary failure"}) });
          else await route.fulfill({ status,contentType:"application/json",body:JSON.stringify({real:variant==="live",skills:24,developers:12,members:35}) });
        } else {
          await route.fulfill({ status:200,contentType:"application/json",body:JSON.stringify([]) });
        }
      });
      await page.goto(baseUrl,{waitUntil:"networkidle"});
      const stats=page.locator("#stats");
      if (variant === "live") {
        await page.waitForFunction(()=>!document.querySelector("#stats").hidden);
        assert.equal(await stats.locator(".stat-item").count(),3);
        assert.equal(Math.round(await stats.evaluate((node)=>node.getBoundingClientRect().height)),72);
        await page.waitForFunction(()=>["24","12","35"].every((value,index)=>document.querySelector(["#skill-count","#developer-count","#member-count"][index]).textContent===value));
        assert.deepEqual(await page.locator("#stats strong").allTextContents(),["24","12","35"]);
        await page.screenshot({path:"/tmp/skilltube-ui-smoke/landing-stats-live-1440.png",fullPage:true});
      } else {
        await page.waitForFunction(()=>document.querySelector("#stats").hidden);
        await page.screenshot({path:`/tmp/skilltube-ui-smoke/landing-stats-${variant}-1440.png`,fullPage:true});
      }
      const expectedErrors = variant === "failed" ? ["Failed to load resource: the server responded with a status of 503 (Service Unavailable)"] : [];
      assert.deepEqual(errors,expectedErrors,`Landing stats ${variant} only emits the expected mocked response error`);
      diagnostics.push(`landing stats/${variant}: ${variant==="live"?"three items, 72px row":"hidden"}; ${variant==="failed"?"expected mocked 503 only":"browser errors=0"}`);
      await page.close();
    }

    for (const route of ["/", "/app/", "/docs/", "/faq/", "/developers/"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const routeErrors = [];
      const routeFailures = [];
      const routeStatuses = [];
      page.on("console", (message) => { if (message.type() === "error") routeErrors.push(message.text()); });
      page.on("pageerror", (error) => routeErrors.push(error.message));
      page.on("requestfailed", (request) => routeFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
      page.on("response", (response) => { if (response.status() >= 400) routeStatuses.push(`${response.status()} ${response.url()}`); });
      const target = route === "/developers/" && diagnosticsBaseUrl ? diagnosticsBaseUrl : baseUrl;
      await page.goto(`${target}${route}`, { waitUntil: "networkidle", timeout: 30000 }).catch((error) => routeErrors.push(error.message));
      await page.waitForTimeout(1200);
      const found = [...routeErrors.map((text) => `console/pageerror ${text}`), ...routeFailures.map((text) => `requestfailed ${text}`), ...routeStatuses.map((text) => `HTTP ${text}`)];
      diagnostics.push(`${route} live-config diagnostics: ${found.length ? found.join(" | ") : "no console/page/request/HTTP errors"}`);
      if (found.length && !(route === "/developers/" && !diagnosticsBaseUrl)) {
        pageErrors.push(`${route}: ${found.join(" | ")}`);
      }
      if (route === "/developers/" && !diagnosticsBaseUrl && found.length) {
        diagnostics[diagnostics.length - 1] += " (static server has no Worker route; set UI_DIAGNOSTICS_BASE_URL to check Wrangler)";
      }
      await page.close();
    }

    console.log("UI smoke screenshots: /tmp/skilltube-ui-smoke/");
    for (const line of diagnostics) console.log(line);
    if (pageErrors.length) {
      console.error("Browser diagnostics found errors:");
      for (const error of pageErrors) console.error(`- ${error}`);
      process.exitCode = 1;
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
