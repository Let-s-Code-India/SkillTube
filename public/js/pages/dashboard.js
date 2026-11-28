import { getDashboard, getMyAchievements, getMyState } from "../api.js";
import { showError } from "../errors.js";
import { badgeCard, getBadgeImagePaths } from "../components/badges.js";
import { horizontalBarChart, donutChart } from "../components/charts.js";

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export async function render(app) {
  const loading = el("div", undefined, "skeleton");
  loading.setAttribute("aria-label","Loading dashboard");
  app.append(loading);

  let data = {}, account = null, achievements = [], images = new Map();
  const errors = el("div");
  app.append(errors);
  try { data = await getDashboard(); } catch (error) { showError(errors,error.code,error.arg); }
  try { account = await getMyState(); } catch (error) { showError(errors,error.code,error.arg); }
  try { achievements = await getMyAchievements(5); } catch (error) { showError(errors,error.code,error.arg); }
  try { images = await getBadgeImagePaths(); } catch {}
  loading.remove();

  if (data.me?.state === "no_skill") {
    const banner = el("section",undefined,"empty-banner");
    const copy = el("div");
    copy.append(el("h2","Publish your first AI resource"));
    copy.append(el("p","Publish a public repository to unlock Studio stats."));
    const action = el("a","Publish a listing","btn");
    action.href="#/publish";
    banner.append(copy,action);
    app.append(banner);
  } else if (data.me?.state === "waiting") {
    const banner = el("section",undefined,"empty-banner");
    const copy = el("div");
    copy.append(el("h2","Your Studio is warming up"));
    copy.append(el("p",`Eligible in ${data.me.days_left} days.`));
    banner.append(copy);
    app.append(banner);
  }

  const kpis = el("section",undefined,"kpi-grid");
  const kpiValues = [];
  if (data.me?.rank !== undefined && data.me?.rank !== null) kpiValues.push(["Current rank","#"+Number(data.me.rank),"This week's position"]);
  if (data.me?.score !== undefined && data.me?.score !== null) kpiValues.push(["Score",Number(data.me.score||0).toLocaleString(),"Weekly score"]);
  if (account?.listings_used !== undefined && account?.publish_limit !== undefined) kpiValues.push(["Listings used",`${Number(account.listings_used||0)} / ${Number(account.publish_limit||0)}`,"Quota used"]);
  if (account?.followers !== undefined && account?.followers !== null) kpiValues.push(["Followers",Number(account.followers||0).toLocaleString(),"Developers following"]);
  for (const [label,value,hint] of kpiValues) {
    const card=el("article",undefined,"card kpi-card");
    card.append(el("span",label,"kpi-label"),el("strong",value,""),el("small",hint,"mut"));
    kpis.append(card);
  }
  if (kpiValues.length) app.append(kpis);

  const chartGrid = el("div",undefined,"dashboard-grid");
  if (Array.isArray(data.top) && data.top.length) {
    horizontalBarChart(chartGrid,"Weekly top 10",data.top.slice(0,10).map((row)=>({label:`${row.name||row.username}`,value:Number(row.score||0)})),"Score");
  } else {
    const placeholder=el("section",undefined,"card chart-card chart-placeholder");
    placeholder.append(el("h2","Weekly top 10"),el("div",undefined,"skeleton"),el("p","No ranking data yet.","mut"));
    chartGrid.append(placeholder);
  }
  if (account?.publish_limit !== undefined) {
    donutChart(chartGrid,Number(account.listings_used||0),Number(account.publish_limit||0));
  } else {
    const placeholder=el("section",undefined,"card chart-card chart-placeholder");
    placeholder.append(el("h2","Listing quota"),el("div",undefined,"skeleton"));
    chartGrid.append(placeholder);
  }
  app.append(chartGrid);

  const lower = el("div",undefined,"dashboard-grid dashboard-row-three");
  const leaderboard = el("section",undefined,"card leaderboard-card");
  leaderboard.append(el("h2","Leaderboard"));
  const rows=Array.isArray(data.top)?data.top.slice(0,10):[];
  if (rows.length) {
    const list=el("ol",undefined,"rank-list");
    for (const row of rows) {
      const item=el("li",undefined,"rank-row");
      if (account?.username && row.username===account.username) item.classList.add("is-me");
      item.append(el("span",`#${row.rank}`,"rank-position"),el("span",`${row.name||row.username} @${row.username}`,"rank-user"),el("span",Number(row.score||0).toLocaleString(),"rank-score"));
      list.append(item);
    }
    leaderboard.append(list);
  } else leaderboard.append(el("p","No ranked developers this week.","mut"));
  lower.append(leaderboard);

  const recent=el("section",undefined,"card recent-badges");
  recent.append(el("h2","Recent badges"));
  if (achievements.length) {
    const grid=el("div",undefined,"badge-grid");
    for (const badge of achievements) grid.append(badgeCard(images,badge,{showReason:true}));
    recent.append(grid);
  } else {
    const empty=el("div",undefined,"badge-empty-state");
    const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");
    icon.setAttribute("aria-hidden","true");
    const use=document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href","/icons.svg#badge");
    icon.append(use);
    const message=el("p","Earn your first badge from the catalog.");
    const link=el("a","Explore badges","btn secondary");
    link.href="#/badges";
    empty.append(icon,message,link);
    recent.append(empty);
  }
  lower.append(recent);
  app.append(lower);
}
