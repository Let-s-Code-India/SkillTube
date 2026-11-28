import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
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
let demoName = "Demo Developer";
let demoAvatarUrl = "";
let demoListingsUsed = 1;
let demoPublishLimit = 5;
let demoAchievements = true;
let lastSearchQuery = null;
let callCount = 0;
const pageErrors = [];
const rpcValue = (name, args) => {
  callCount += 1;
  switch (name) {
    case "me_state":
      return { id: "demo-user", username: "demo", name: demoName, avatar_url: demoAvatarUrl, country: "IN", publish_limit: demoPublishLimit, listings_used: demoListingsUsed, followers: 22, is_admin: true, admin_can_write: true, image_rules: {} };
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
      return demoAchievements ? [{ key: "helpful", name: "Helpful", tier: "Bronze", reason: "Shared a resource.", earned_at: "2026-11-20T12:00:00Z" }] : [];
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
      return { reports: 4, badges: 8 };
    case "unread_updates_count":
      return 12;
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
    const sizes = [360, 390, 768, 1024, 1280, 1440, 1920];
    const themes = ["system", "light", "dark", "hacker", "midnight", "sunrise", "contrast"];
    const themeLabels = {
      system: "System",
      light: "Light",
      dark: "Dark",
      hacker: "Hacker",
      midnight: "Midnight",
      sunrise: "Sunrise",
      contrast: "High contrast",
    };
    const pageTitles = {
      home: "Home",
      search: "Search",
      publish: "Publish a listing",
      "my-listings": "My listings",
      dashboard: "Dashboard",
      updates: "Updates",
      badges: "Badges",
      settings: "Settings",
      admin: "Admin",
      skill: "Listing",
      developer: "Developer",
    };
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

    async function configurePage(page, theme = "system", dashboardVariant = "live") {
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
      }, theme);
    }

    async function assertPage(page, routeName, width, theme) {
      await page.waitForFunction((title) => document.querySelector("#breadcrumb-slot h1")?.textContent === title, pageTitles[routeName]);
      await page.waitForFunction(() => !document.querySelector("#app .skeleton[aria-label='Loading dashboard']"));
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => {
        const header = document.querySelector(".app-header").getBoundingClientRect();
        const main = document.querySelector(".app-main").getBoundingClientRect();
        const drawer = document.querySelector("#drawer").getBoundingClientRect();
        const breadcrumb = document.querySelector(".breadcrumb").getBoundingClientRect();
        const collapsed = document.body.classList.contains("sidebar-collapsed");
        const use = document.querySelector("#theme-button use");
        return {
          scrollWidth: document.documentElement.scrollWidth,
          width: window.innerWidth,
          h1Count: document.querySelectorAll("h1").length,
          title: document.querySelector("#breadcrumb-slot h1")?.textContent,
          headerBottom: header.bottom,
          mainTop: main.top,
          mainLeft: main.left,
          sidebarLeft: drawer.left,
          sidebarRight: drawer.right,
          sidebarTop: drawer.top,
          breadcrumbTop: breadcrumb.top,
          sidebarCollapsed: collapsed,
          menuExpanded: document.querySelector("#menu").getAttribute("aria-expanded"),
          drawerHidden: document.querySelector("#drawer").getAttribute("aria-hidden") === "true",
          backdropHidden: document.querySelector("#drawer-backdrop").hidden,
          theme: localStorage.getItem("skilltube.theme"),
          rootTheme: document.documentElement.getAttribute("data-theme"),
          themeIcon: use?.getAttribute("href"),
          themeLabel: document.querySelector("#theme-button").getAttribute("aria-label"),
          themeMenuHidden: document.querySelector(".theme-menu").hidden,
          navIcons: [...document.querySelectorAll(".drawer nav a,.drawer nav .drawer-row")].map((link)=>[
            link.querySelector("span:not(.notification-dot)")?.textContent?.trim(),
            link.querySelector("use")?.getAttribute("href"),
          ]),
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
          grids: [...document.querySelectorAll(".dashboard-grid,.listing-grid,.badge-grid,.docs-grid,.post-grid,.kpi-grid,.settings-content,.admin-list,.comment-list,.stat-grid,.welcome-features,.grid-3")]
            .filter((node) => getComputedStyle(node).display === "grid")
            .map((node) => ({
              selector: node.className,
              rowGap: parseFloat(getComputedStyle(node).rowGap),
              columnGap: parseFloat(getComputedStyle(node).columnGap),
              cards: [...node.children].filter((child) => child.classList.contains("card") || child.matches(".listing-card,.badge-card")).map((child) => {
                const rect=child.getBoundingClientRect();
                return {top:rect.top,height:rect.height};
              }),
            })),
        };
      });
      assert.equal(state.h1Count, 1, `${routeName} at ${width}px must have exactly one h1`);
      assert.equal(state.title, pageTitles[routeName], `${routeName} breadcrumb is correct at ${width}px`);
      assert.ok(state.topicCount >= 16, `${routeName} at ${width}px must render every topic chip`);
      assert.equal(state.topbarDisplay,"grid",`Header controls use a single-line grid at ${width}px`);
      assert.equal(state.theme,theme,`${theme} is stored before navigation at ${routeName}/${width}`);
      assert.equal(state.themeIcon,`/icons.svg#theme-${theme}`,`${theme} top-bar icon is synchronized`);
      assert.equal(state.themeLabel,`Theme: ${themeLabels[theme]}`,`${theme} trigger label is synchronized`);
      assert.equal(state.themeMenuHidden,true,"Theme menu remains closed until requested");
      if (theme === "system") assert.equal(state.rootTheme,null,"System theme defers to the operating system");
      else assert.equal(state.rootTheme,theme,`${theme} is applied before the route renders`);
      assert.ok(state.scrollWidth <= state.width, `${routeName} at ${width}px has horizontal overflow (${state.scrollWidth}px): ${state.overflowing.join(", ")}; ${state.widths.join("; ")}`);
      assert.ok(state.breadcrumbTop >= state.headerBottom - 1, `${routeName} overlaps the header at ${width}px`);
      assert.equal(state.menuExpanded,String(!state.sidebarCollapsed),`${routeName}/${width} menu aria-expanded matches body state`);
      const navGlyphs=new Map(state.navIcons);
      assert.equal(navGlyphs.get("Trending tags"),"/icons.svg#fire");
      assert.equal(navGlyphs.get("Leaderboard"),"/icons.svg#trophy");
      assert.equal(navGlyphs.get("Updates"),"/icons.svg#refresh");
      assert.equal(navGlyphs.get("Announcements"),"/icons.svg#megaphone");
      assert.equal(navGlyphs.get("Alerts"),"/icons.svg#bell-alert");
      for (const grid of state.grids) {
        assert.ok([4,8,12,16,24,32].includes(grid.rowGap),`${routeName}/${width} ${grid.selector} row gap ${grid.rowGap}px follows the spacing scale`);
        assert.ok([4,8,12,16,24,32].includes(grid.columnGap),`${routeName}/${width} ${grid.selector} column gap ${grid.columnGap}px follows the spacing scale`);
        const tops=[...new Set(grid.cards.map((card)=>Math.round(card.top)))];
        for (const top of tops) {
          const row=grid.cards.filter((card)=>Math.abs(card.top-top)<1.5);
          if (row.length>1) assert.ok(row.every((card)=>Math.abs(card.top-row[0].top)<=1),`${routeName}/${width} ${grid.selector} cards in one row align at their top edges`);
        }
      }
      if (width >= 1024) {
        assert.ok(!state.sidebarCollapsed, "Desktop sidebar starts expanded unless a saved choice says otherwise");
        assert.equal(Math.round(state.sidebarTop), 64, "Desktop sidebar starts below the 64px toolbar");
        assert.equal(Math.round(state.sidebarRight - state.sidebarLeft), 240, "Desktop sidebar width is 240px");
        assert.ok(state.mainLeft >= state.sidebarRight - 1, "Main content must start at the sidebar edge");
      } else {
        assert.ok(state.sidebarCollapsed, "Mobile/tablet drawer starts closed");
        assert.ok(state.backdropHidden && state.drawerHidden,"Closed mobile drawer hides its backdrop and accessibility subtree");
        assert.ok(state.breadcrumbTop >= state.headerBottom - 1, "Mobile content starts after the header and topic row");
      }
      if (width <= 700) {
        assert.ok(!state.searchVisible && state.searchToggleVisible && state.themeVisible, "Mobile header keeps search collapsed and theme visible");
        const visibleControls=state.controls.filter((item)=>item.display!=="none" && item.selector!=="#top-search");
        for (let index=1;index<visibleControls.length;index++) {
          assert.ok(visibleControls[index].left >= visibleControls[index-1].right-1, `Mobile header controls overlap: ${visibleControls[index-1].selector} and ${visibleControls[index].selector}`);
        }
      }
      const circleIssues=await page.evaluate(() => {
        const issues=[];
        for(const node of document.querySelectorAll(".icon-button,.profile-button,.drawer-account-avatar,.listing-developer-logo,.skill-developer-logo,.notification-dot:not([hidden])")){
          if(node.hidden||getComputedStyle(node).display==="none")continue;
          const rect=node.getBoundingClientRect();
          if(Math.abs(rect.width-rect.height)>1)issues.push(`${node.id||node.className}: not square (${rect.width}x${rect.height})`);
          const child=node.firstElementChild;
          if(!child)continue;
          const inner=child.getBoundingClientRect();
          const dx=Math.abs((inner.left+inner.right)/2-(rect.left+rect.right)/2);
          const dy=Math.abs((inner.top+inner.bottom)/2-(rect.top+rect.bottom)/2);
          if(dx>1||dy>1)issues.push(`${node.id||node.className}: child center offset ${dx.toFixed(2)},${dy.toFixed(2)}`);
          if(inner.left<rect.left-1||inner.top<rect.top-1||inner.right>rect.right+1||inner.bottom>rect.bottom+1)issues.push(`${node.id||node.className}: child protrudes beyond circle`);
        }
        return issues;
      });
      assert.deepEqual(circleIssues,[],`${routeName}/${width}/${theme} circular control geometry`);
      if(routeName==="dashboard"){
        const center=await page.locator(".donut-center").evaluate((node)=>{
          const svg=node.ownerSVGElement;
          const box=node.getBBox();
          const rect=svg.getBoundingClientRect();
          const scaleX=rect.width/160;
          const scaleY=rect.height/160;
          return {
            dx:Math.abs(rect.left+(box.x+box.width/2)*scaleX-(rect.left+80*scaleX)),
            dy:Math.abs(rect.top+(box.y+box.height/2)*scaleY-(rect.top+80*scaleY)),
            text:[...node.querySelectorAll("text")].map((item)=>item.textContent),
          };
        });
        assert.ok(center.dx<=2&&center.dy<=2,`Donut centre is aligned within 2 CSS px (${center.dx.toFixed(2)},${center.dy.toFixed(2)})`);
        assert.equal(center.text[0],"1 / 5", "Dashboard quota centre shows the current used/limit number");
        assert.equal(center.text[1],"listings used", "Dashboard quota centre includes its caption");
      }
      return state;
    }

    await mkdir("/tmp/skilltube-ui-smoke", { recursive: true });
    for (const width of sizes) {
      for (const theme of themes) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await configurePage(page, theme);
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("requestfailed", (request) => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
        page.on("response", (response) => { if (response.status() >= 400) statusErrors.push(`${response.status()} ${response.url()}`); });
        for (const [routeName, hash] of routes) {
          errors.length = 0;
          failures.length = 0;
          statusErrors.length = 0;
          if (routeName === "home") await page.goto(`${baseUrl}/app/${hash}`, { waitUntil: "networkidle" });
          else await page.evaluate((nextHash) => { location.hash = nextHash; }, hash);
          if (routeName === "admin") {
            const tab = page.locator(".admin-tabs button").first();
            if (await tab.count()) await tab.click();
          }
          const state = await assertPage(page, routeName, width, theme);
          await page.screenshot({ path: `/tmp/skilltube-ui-smoke/${routeName}-${width}-${theme}.png`, animations:"disabled" });
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
        }
        await page.close();
      }
    }

    const controlPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await configurePage(controlPage,"light");
    const controlErrors=[];
    controlPage.on("console",(message)=>{if(message.type()==="error")controlErrors.push(message.text())});
    controlPage.on("pageerror",(error)=>controlErrors.push(error.message));
    await controlPage.goto(`${baseUrl}/app/#/home`,{waitUntil:"networkidle"});
    await controlPage.waitForSelector("#profile-avatar");
    async function assertSidebar(collapsed, desktop, width) {
      if(!desktop){
        await controlPage.waitForFunction((hidden)=>{
          const rect=document.querySelector("#drawer").getBoundingClientRect();
          return hidden?rect.right<=1:rect.left>=-1;
        },collapsed);
      }
      const current=await controlPage.evaluate(()=>({
        collapsed:document.body.classList.contains("sidebar-collapsed"),
        expanded:document.querySelector("#menu").getAttribute("aria-expanded"),
        hidden:document.querySelector("#drawer").getAttribute("aria-hidden"),
        backdrop:document.querySelector("#drawer-backdrop").hidden,
        drawer:document.querySelector("#drawer").getBoundingClientRect().toJSON(),
        main:document.querySelector(".app-main").getBoundingClientRect().toJSON(),
        saved:localStorage.getItem("skilltube.sidebarCollapsed"),
      }));
      assert.equal(current.collapsed,collapsed,`Sidebar body class at ${width}px`);
      assert.equal(current.expanded,String(!collapsed),`Sidebar aria-expanded at ${width}px`);
      assert.equal(current.backdrop,desktop||collapsed,`Sidebar backdrop visibility at ${width}px`);
      if(desktop){
        assert.equal(Math.round(current.drawer.width),collapsed?72:240,`Desktop sidebar width at ${width}px`);
        assert.ok(current.main.left>=current.drawer.right-1,`Desktop page content begins after sidebar at ${width}px`);
        assert.equal(current.hidden,"false","Desktop sidebar remains in the accessibility tree");
      }else{
        assert.equal(current.hidden,String(collapsed),`Mobile drawer aria-hidden at ${width}px`);
        assert.equal(current.drawer.right<=1,collapsed,`Mobile drawer visibility at ${width}px`);
      }
      if(current.saved!==null) assert.equal(current.saved,collapsed?"1":"0","Sidebar choice persists in localStorage");
    }
    await assertSidebar(false,true,1440);
    await controlPage.locator("#close-menu").click();
    await assertSidebar(true,true,1440);
    await controlPage.locator("#menu").click();
    await assertSidebar(false,true,1440);
    await controlPage.keyboard.press("Escape");
    await assertSidebar(true,true,1440);
    await controlPage.locator("#menu").click();
    await controlPage.setViewportSize({width:390,height:850});
    await controlPage.waitForTimeout(100);
    await assertSidebar(false,false,390);
    assert.equal(await controlPage.locator("#drawer-profile-name").textContent(),"Demo Developer","Profile remains reachable through the mobile drawer");
    await controlPage.locator("#close-menu").click();
    await assertSidebar(true,false,390);
    await controlPage.locator("#menu").click();
    await assertSidebar(false,false,390);
    await controlPage.keyboard.press("Escape");
    await assertSidebar(true,false,390);
    await controlPage.locator("#menu").click();
    await controlPage.locator("#drawer-backdrop").click({position:{x:350,y:80}});
    await assertSidebar(true,false,390);
    await controlPage.locator("#menu").click();
    await controlPage.setViewportSize({width:1024,height:850});
    await controlPage.waitForTimeout(100);
    await assertSidebar(false,true,1024);
    await controlPage.locator("#close-menu").click();
    await assertSidebar(true,true,1024);
    await controlPage.setViewportSize({width:390,height:850});
    await controlPage.waitForTimeout(100);
    await assertSidebar(true,false,390);
    await controlPage.locator("#menu").click();
    await controlPage.evaluate(()=>{location.hash="#/search?q=web-frontend"});
    await controlPage.waitForFunction(()=>document.querySelector("#breadcrumb-slot h1")?.textContent==="Search");
    await assertSidebar(false,false,390);
    await controlPage.locator("#search-toggle").click();
    const searchGeometry=await controlPage.locator("#top-search").evaluate((node)=>{
      const rect=node.getBoundingClientRect();
      return {display:getComputedStyle(node).display,width:rect.width,top:rect.top};
    });
    assert.equal(searchGeometry.display,"flex");
    assert.ok(searchGeometry.width>=370&&searchGeometry.top>=64,"Expanded mobile search is a full-width row below the top bar");
    const touchTargets=await controlPage.locator("#menu,#search-toggle,#theme-button").evaluateAll((nodes)=>nodes.map((node)=>{
      const rect=node.getBoundingClientRect();
      return Math.min(rect.width,rect.height);
    }));
    assert.ok(touchTargets.every((target)=>target>=44),"Mobile header controls meet the 44px touch target");
    const mobileCircleIssues=await controlPage.evaluate(()=>{
      const issues=[];
      for(const node of document.querySelectorAll(".icon-button,.profile-button,.drawer-account-avatar,.listing-developer-logo,.skill-developer-logo,.notification-dot:not([hidden])")){
        if(node.hidden||getComputedStyle(node).display==="none")continue;
        const outer=node.getBoundingClientRect(),child=node.firstElementChild;
        if(Math.abs(outer.width-outer.height)>1)issues.push(`${node.id||node.className}: not square`);
        if(!child)continue;
        const inner=child.getBoundingClientRect();
        if(Math.abs((outer.left+outer.right-inner.left-inner.right)/2)>1||Math.abs((outer.top+outer.bottom-inner.top-inner.bottom)/2)>1)issues.push(`${node.id||node.className}: child not centered`);
        if(inner.left<outer.left-1||inner.top<outer.top-1||inner.right>outer.right+1||inner.bottom>outer.bottom+1)issues.push(`${node.id||node.className}: child escapes circle`);
      }
      return issues;
    });
    assert.deepEqual(mobileCircleIssues,[],"Mobile circular controls keep children centred and contained");
    diagnostics.push("sidebar 1440/390/1024: close, menu reopen, Escape, backdrop and resize state passed; mobile search full-width; touch targets >=44px");

    await controlPage.locator("#search-toggle").click();
    await controlPage.locator("#menu").click();
    await assertSidebar(true,false,390);
    await controlPage.locator("#theme-button").click();
    for(const theme of themes){
      await controlPage.locator(`.theme-option[data-theme="${theme}"]`).click();
      const currentTheme=await controlPage.evaluate(()=>({
        stored:localStorage.getItem("skilltube.theme"),
        icon:document.querySelector("#theme-button use").getAttribute("href"),
        label:document.querySelector("#theme-button").getAttribute("aria-label"),
        selected:document.querySelector(".theme-option[aria-checked='true']")?.dataset.theme,
        checks:document.querySelectorAll(".theme-option-check:not([hidden])").length,
      }));
      assert.deepEqual(currentTheme,{
        stored:theme,
        icon:`/icons.svg#theme-${theme}`,
        label:`Theme: ${themeLabels[theme]}`,
        selected:theme,
        checks:1,
      },`${theme} selection updates the stored theme, icon, accessible name and checkmark`);
    }
    await controlPage.locator('.theme-option[data-theme="system"]').click();
    await controlPage.emulateMedia({colorScheme:"dark"});
    await controlPage.waitForFunction(
      () => document.querySelector('meta[name="theme-color"]')?.content === "#17151d",
    );
    const systemTheme=await controlPage.evaluate(()=>({
      root:document.documentElement.getAttribute("data-theme"),
      color:document.querySelector('meta[name="theme-color"]')?.content,
      icon:document.querySelector("#theme-button use").getAttribute("href"),
      colorScheme:getComputedStyle(document.documentElement).colorScheme,
    }));
    assert.equal(systemTheme.root,null,"System theme continues following the OS");
    assert.equal(systemTheme.color,"#17151d","System theme updates the browser color after an OS theme change");
    assert.equal(systemTheme.icon,"/icons.svg#theme-system","OS changes keep the System glyph");
    assert.equal(systemTheme.colorScheme,"dark","System theme updates native control colors after an OS theme change");
    diagnostics.push("theme picker: seven SVG glyphs, aria labels/checkmarks, persistence, and System OS-follow behavior passed");

    const profileCases=[["Ayush Giri","AG"],["Mary Moore","MM"],["W","W"],["A Very Long Developer Name","AV"]];
    for(const [name,initials] of profileCases){
      demoName=name;
      demoAvatarUrl="";
      await controlPage.reload({waitUntil:"networkidle"});
      await controlPage.waitForFunction((expected)=>document.querySelector("#profile-avatar")?.textContent===expected,initials);
      assert.equal(await controlPage.locator("#drawer-avatar").textContent(),initials,`${name} drawer initials are limited and centred`);
    }
    demoName="Ayush Giri";
    demoAvatarUrl="https://avatars.githubusercontent.com/u/123?v=4";
    await controlPage.route("https://avatars.githubusercontent.com/**",(route)=>route.fulfill({
      status:200,
      contentType:"image/svg+xml",
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2878c8"/></svg>',
    }));
    await controlPage.reload({waitUntil:"networkidle"});
    await controlPage.waitForFunction(()=>document.querySelector("#profile-avatar img")?.complete&&document.querySelector("#profile-avatar img")?.naturalWidth>0);
    const avatarStyle=await controlPage.locator("#profile-avatar img").evaluate((image)=>({
      objectFit:getComputedStyle(image).objectFit,
      radius:getComputedStyle(image).borderTopLeftRadius,
      width:image.getBoundingClientRect().width,
      height:image.getBoundingClientRect().height,
    }));
    assert.equal(avatarStyle.objectFit,"cover");
    assert.equal(avatarStyle.radius,"50%");
    assert.equal(avatarStyle.width,avatarStyle.height);
    diagnostics.push("avatar initials AG/MM/W/AV and mocked GitHub image: verified; image is 44px circular object-fit:cover");

    demoName="Demo Developer";
    demoAvatarUrl="";
    demoAchievements=true;
    const quotaCases=[[0,5,"0 / 5"],[1,5,"1 / 5"],[5,5,"5 / 5"],[0,0,"—"]];
    for(const [used,limit,expected] of quotaCases){
      demoListingsUsed=used;
      demoPublishLimit=limit;
      const quotaPage=await browser.newPage({viewport:{width:390,height:900}});
      await configurePage(quotaPage,"light");
      await quotaPage.goto(`${baseUrl}/app/#/dashboard`,{waitUntil:"networkidle"});
      await quotaPage.waitForFunction(() => !document.querySelector("#app .skeleton[aria-label='Loading dashboard']"));
      assert.equal(
        await quotaPage.locator(".donut-center text").first().textContent(),
        expected,
        `Quota donut shows ${expected}`,
      );
      const center=await quotaPage.locator(".donut-center").evaluate((node)=>{
        const svg=node.ownerSVGElement,box=node.getBBox(),rect=svg.getBoundingClientRect();
        return {dx:Math.abs((box.x+box.width/2-80)*rect.width/160),dy:Math.abs((box.y+box.height/2-80)*rect.height/160),caption:node.querySelector(".chart-caption")?.textContent};
      });
      assert.ok(center.dx<=2&&center.dy<=2,`Quota ${expected} is centred within 2 CSS px`);
      assert.equal(center.caption,"listings used");
      await quotaPage.close();
    }
    const chartPage=await browser.newPage({viewport:{width:390,height:900}});
    await configurePage(chartPage,"light");
    await chartPage.goto(`${baseUrl}/app/#/dashboard`,{waitUntil:"networkidle"});
    await chartPage.waitForFunction(() => !document.querySelector("#app .skeleton[aria-label='Loading dashboard']"));
    const labelSizes=await chartPage.evaluate(()=>({
      bar:parseFloat(getComputedStyle(document.querySelector(".weekly-bar-label")).fontSize),
      legend:parseFloat(getComputedStyle(document.querySelector(".chart-legend")).fontSize),
      bars:document.querySelectorAll(".weekly-bar-row").length,
      tooltip:document.querySelector(".weekly-bar-label").title,
    }));
    assert.ok(labelSizes.bar>=12&&labelSizes.legend>=12,"Mobile chart labels and donut legend are at least 12px");
    assert.equal(labelSizes.bars,10);
    assert.ok(labelSizes.tooltip.length>0,"Long weekly chart names have a title tooltip");
    demoAchievements=false;
    await chartPage.reload({waitUntil:"networkidle"});
    await chartPage.waitForSelector(".badge-empty-state");
    await chartPage.screenshot({path:"/tmp/skilltube-ui-smoke/dashboard-no-badges-390-light.png",fullPage:true,animations:"disabled"});
    await chartPage.close();
    demoAchievements=true;
    demoListingsUsed=1;
    demoPublishLimit=5;
    diagnostics.push("dashboard quota 0/5, 1/5, 5/5, 0/0: centred number/caption passed; chart labels >=12px; badge empty state rendered");
    assert.deepEqual(controlErrors,[],"Sidebar, theme, avatar and chart interaction checks have no browser errors");
    await controlPage.close();

    const chipPage = await browser.newPage({ viewport: { width: 390, height: 850 } });
    await configurePage(chipPage,"light");
    await chipPage.goto(`${baseUrl}/app/#/home`, { waitUntil: "networkidle" });
    await chipPage.locator("#topic-chips a").filter({ hasText: "Web & frontend" }).click();
    await chipPage.waitForSelector("#app .search-toolbar");
    await chipPage.waitForFunction(() => document.querySelector("#app h2")?.textContent.includes("web-frontend"));
    assert.equal(lastSearchQuery, "web-frontend", "Topic click sends its selected slug as the search query");
    diagnostics.push("topic click: Web & frontend -> public_search(p_q=web-frontend), results heading updated");
    await chipPage.close();

    for (const variant of ["empty", "waiting"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
      await configurePage(page, "light", variant);
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
