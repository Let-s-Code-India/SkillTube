import { getDashboard,getMyAchievements,getMyState } from "../api.js";
import { showError } from "../errors.js";
import { badgeCard,getBadgeImagePaths,tickImage } from "../components/badges.js";

function el(tag,text,className="") {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
}

function formatWeek(week) {
  const match=String(week||"").match(/^(\d{4})(\d{2})$/);
  return match?`Week ${Number(match[2])}, ${match[1]}`:"Weekly ranking";
}

function rankingState(container,data) {
  const section=el("section",undefined,"card");
  section.append(el("h2","Your dashboard"));
  if(data.state==="live")section.append(el("p",formatWeek(data.week),"mut"));
  if(data.me?.state==="no_skill") {
    section.append(el("p","Publish your first AI resource to start your dashboard."));
    const publish=el("a","Publish a listing","btn");publish.href="#/publish";section.append(publish);
  } else if(data.me?.state==="waiting") {
    section.append(el("p",`Your ranking becomes eligible in ${data.me.days_left} days (from ${data.me.live_on}).`));
  } else if(data.me?.state==="live") {
    const rank=data.me.rank;
    section.append(el("p",data.state==="empty"
      ?"You are eligible. The first weekly ranking has not been published yet."
      :rank
        ?`Your current rank is #${rank} with a score of ${Number(data.me.score||0).toLocaleString()}.`
        :"You are eligible for the weekly ranking, but are not currently in the top 50."));
    if(data.me.best_band) section.append(el("p",`Best weekly band: top ${data.me.best_band}.`));
  } else {
    section.append(el("p","Your account is not eligible for the dashboard yet.","mut"));
  }
  if(data.state==="empty") section.append(el("p","Weekly rankings are not available yet. Check back after the weekly ranking is published.","mut"));
  container.append(section);
}

function rankingList(container,data,images) {
  const section=el("section",undefined,"card");
  section.append(el("h2","Weekly top 10"));
  if(data.state==="empty") {
    section.append(el("p","The first weekly ranking has not been published yet.","mut"));
  } else {
    const rows=Array.isArray(data.top)?data.top.slice(0,10):[];
    if(!rows.length) {
      section.append(el("p","There are no public ranked developers this week.","mut"));
    } else {
      const list=el("ol",undefined,"rank-list");
      for(const row of rows) {
        const item=el("li",undefined,"card rank-row");
        item.append(el("span",`#${row.rank}`,"rank-position"));
        const user=el("a",`${row.name||row.username} (@${row.username})`,"rank-user");
        user.href=`#/dev/${encodeURIComponent(row.username)}`;
        const tick=tickImage(images,row.tick);
        if(tick)user.append(" ",tick);
        item.append(user,el("span",Number(row.score||0).toLocaleString(),"rank-score"));
        list.append(item);
      }
      section.append(list);
    }
  }
  const link=el("a","Open full leaderboard");
  link.href="/leaderboard/";
  section.append(link);
  container.append(section);
}

export async function render(app) {
  const error=el("div");
  app.append(error);
  let data;
  try{data=await getDashboard();}
  catch(e){showError(error,e.code,e.arg);return;}

  let account=null;
  try{account=await getMyState();}
  catch(e){showError(error,e.code,e.arg);}

  let images=new Map();
  try{images=await getBadgeImagePaths();}
  catch{const note=el("p","Badge illustrations are temporarily unavailable.","mut");app.append(note);}

  if(account?.tick) {
    const tick=el("p",undefined,"account-tick");
    const icon=tickImage(images,account.tick);
    if(icon)tick.append(icon);
    tick.append(document.createTextNode(account.tick==="tick-master-gold"?"Master Tick earned":"Blue Tick earned"));
    app.append(tick);
  }

  rankingState(app,data||{});
  rankingList(app,data||{},images);

  const recent=el("section",undefined,"badge-section");
  recent.append(el("h2","Recent badges"));
  const badgesError=el("div");
  let achievements=[];
  try{achievements=await getMyAchievements(5);}
  catch(e){showError(badgesError,e.code,e.arg);}
  if(achievements.length) {
    const grid=el("div",undefined,"badge-grid");
    for(const badge of achievements)grid.append(badgeCard(images,badge,{showReason:true}));
    recent.append(grid);
  } else if(!badgesError.textContent) {
    recent.append(el("p","Earn your first badge by exploring the catalog and its milestones.","mut"));
  }
  if(badgesError.textContent)recent.append(badgesError);
  const badgesLink=el("a","Browse badge catalog");
  badgesLink.href="#/badges";
  recent.append(badgesLink);
  app.append(recent);
}
