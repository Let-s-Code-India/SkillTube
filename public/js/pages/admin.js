import { call } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";

const el=(tag,text,className="")=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
};
const section=(title)=>{
  const node=el("section",undefined,"admin-section");
  node.append(el("h2",title));
  return node;
};

export async function render(app) {
  let state;
  try { state=await call("me_state"); }
  catch(error) { showError(app,error.code,error.arg); return; }
  if(state?.is_admin!==true) { showError(app,"NOT_ADMIN"); return; }

  const nav=el("nav",undefined,"admin-tabs");
  const content=el("div");
  app.append(nav,content);
  const canWrite=state.admin_can_write===true;
  const panels=[
    ["Overview",renderOverview],
    ["Reports",renderReports],
    ["Users",renderUsers],
    ["Settings",renderSettings],
    ["Blocked accounts",renderBlocked]
  ];
  for(const [label,renderPanel] of panels) {
    const button=el("button",label,"btn secondary");button.type="button";
    button.addEventListener("click",async()=>{
      content.replaceChildren();
      const panel=section(label);content.append(panel);
      if(!canWrite)panel.append(el("p","Read-only administrator access.","mut"));
      const error=el("div");panel.append(error);
      try{await renderPanel(panel,error,canWrite);}catch(e){showError(error,e.code,e.arg);}
    });
    nav.append(button);
  }
  nav.querySelector("button")?.click();
}

async function renderOverview(panel,error) {
  const data=await call("admin_overview");
  if(data.error){showError(error,"SERVER_ERROR");return;}
  const grid=el("div",undefined,"stat-grid");
  const values=[
    ["Users",data.users],["Monthly active",data.mau],["New in 7 days",data.new_7d],
    ["New in 30 days",data.new_30d],["Active listings",data.skills],
    ["Contributors",data.contributors],["Open reports",data.open_reports],
    ["Blocked accounts",data.blocked],["Database bytes",data.db_bytes],
    ["Storage bytes",data.storage_bytes]
  ];
  for(const [label,value] of values){const card=el("div",undefined,"card");card.append(el("strong",Number(value||0).toLocaleString()),el("span",label));grid.append(card);}
  panel.append(grid);
  if(data.countries?.length){const h=el("h3","Aggregate country counts");panel.append(h);const list=el("ul");for(const row of data.countries)list.append(el("li",`${row.country}: ${row.n}`));panel.append(list);}
}

async function renderReports(panel,error,canWrite) {
  const filterLabel=el("label","Report queue");
  const filter=document.createElement("select");
  for(const value of ["needs_decision","open","closing_soon"]){const option=el("option",value.replaceAll("_"," "));option.value=value;filter.append(option);}
  filterLabel.append(filter);panel.append(filterLabel);
  const list=el("div",undefined,"admin-list");panel.append(list);

  async function load() {
    list.replaceChildren();
    let rows;
    try{rows=await call("admin_report_queue",{p_filter:filter.value});}
    catch(e){showError(error,e.code,e.arg);return;}
    if(!rows.length){list.append(el("p","No reports in this queue."));return;}
    for(const report of rows)list.append(reportCard(report,load,canWrite));
  }
  filter.addEventListener("change",load);
  await load();
}

function reportCard(report,reload,canWrite) {
  const card=el("article",undefined,"card admin-report");
  const actionError=el("div");
  card.append(el("h3",`${report.kind==="skill"?"Listing":"Channel"} report: ${report.skill_name||report.target_username||"unknown target"}`));
  card.append(el("p",`Reason: ${report.reason} · Status: ${report.status} · ${report.days_left} days left`));
  card.append(el("p",`Reporter: @${report.reporter||"unknown"} · Developer: @${report.target_username||"unknown"}`));
  if(report.note)card.append(el("p",`Report note: ${report.note}`));
  if(report.dev_choice)card.append(el("p",`Developer response: ${report.dev_choice}${report.dev_reply?` — ${report.dev_reply}`:""}`));
  for(const message of report.messages||[])card.append(el("p",`${message.from}: ${message.body}`));
  if(report.skill_id){const link=el("a","View listing");link.href=`/skill/${encodeURIComponent(report.skill_id)}`;card.append(link);}
  if(canWrite&&["open","answered","expired"].includes(report.status)){
    const reasonLabel=el("label","Decision reason (required)");
    const reason=document.createElement("textarea");reason.maxLength=1500;reasonLabel.append(reason);card.append(reasonLabel);
    const actions=el("div",undefined,"admin-actions");
    const options=[["dismiss","Dismiss"],["remove_skill","Remove listing"],["block_account","Block account"]];
    for(const [decision,label] of options){
      if(decision==="remove_skill"&&report.kind!=="skill")continue;
      const button=el("button",label,decision==="dismiss"?"btn secondary":"btn danger");button.type="button";
      button.addEventListener("click",async()=>{
        if(Array.from(reason.value.trim()).length<3){showError(actionError,"REASON_REQUIRED");return;}
        button.disabled=true;
        try{await call("admin_decide_report",{p_report:report.id,p_decision:decision,p_note:reason.value.trim()});toast("Report decision saved.");await reload();}
        catch(e){showError(actionError,e.code,e.arg);}finally{button.disabled=false;}
      });
      actions.append(button);
    }
    card.append(actions);
  }
  card.append(actionError);
  return card;
}

async function renderUsers(panel,error,canWrite) {
  const form=document.createElement("form");
  const label=el("label","Search users (username or display name)");
  const input=document.createElement("input");input.type="search";input.minLength=2;
  const submit=el("button","Search","btn");submit.type="submit";label.append(input);form.append(label,submit);
  const reasonLabel=el("label","Reason for starting an admin action");
  const reason=document.createElement("textarea");reason.maxLength=150;reasonLabel.append(reason);
  const results=el("div",undefined,"admin-list");
  panel.append(form,reasonLabel,results);
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();results.replaceChildren();submit.disabled=true;
    try{
      const users=await call("admin_users_search",{p_q:input.value.trim()});
      if(!users.length){results.append(el("p","No matching users."));return;}
      for(const user of users){
        const card=el("article",undefined,"card");
        card.append(el("h3",`@${user.username} — ${user.name}`));
        card.append(el("p",`Followers ${user.followers} · Listings ${user.skills} · Removals ${user.removed_count} · ${user.blocked?"Blocked":"Active"}`));
        const start=el("button","Start moderation notice","btn danger");start.type="button";start.disabled=user.blocked||!canWrite;
        const actionError=el("div");
        start.addEventListener("click",async()=>{
          if(Array.from(reason.value.trim()).length<3){showError(actionError,"REASON_REQUIRED");return;}
          start.disabled=true;
          try{await call("admin_start_action",{p_skill:null,p_channel:user.id,p_reason:reason.value.trim()});toast("Moderation notice added to the report queue.");}
          catch(e){showError(actionError,e.code,e.arg);}finally{start.disabled=user.blocked||!canWrite;}
        });
        card.append(start,actionError);results.append(card);
      }
    }catch(e){showError(error,e.code,e.arg);}
    finally{submit.disabled=false;}
  });
}

async function renderSettings(panel,error,canWrite) {
  const settings=await call("admin_settings_get");
  if(!settings.length){panel.append(el("p","No settings are available."));return;}
  for(const setting of settings){
    const row=el("article",undefined,"card setting-row");
    row.append(el("h3",setting.key));
    if(setting.note)row.append(el("p",setting.note,"mut"));
    const input=document.createElement("textarea");input.value=JSON.stringify(setting.value);
    const save=el("button","Save setting","btn");save.type="button";save.disabled=!canWrite;
    const rowError=el("div");
    save.addEventListener("click",async()=>{
      let value;
      try{value=JSON.parse(input.value);}catch{showError(rowError,"BAD_SETTING_VALUE");return;}
      save.disabled=true;
      try{await call("admin_settings_set",{p_key:setting.key,p_value:value});toast("Setting saved.");}
      catch(e){showError(rowError,e.code,e.arg);}finally{save.disabled=false;}
    });
    row.append(input,save,rowError);panel.append(row);
  }
}

async function renderBlocked(panel,error,canWrite) {
  const rows=await call("admin_blocked_list");
  if(!rows.length){panel.append(el("p","No blocked accounts."));return;}
  for(const account of rows){
    const row=el("article",undefined,"card");
    row.append(el("p",`GitHub account ${account.github_id} · ${account.reason||"No reason recorded"}`));
    const button=el("button","Unblock account","btn secondary");button.type="button";button.disabled=!canWrite;
    const rowError=el("div");
    button.addEventListener("click",async()=>{button.disabled=true;try{await call("admin_unblock",{p_github_id:account.github_id});toast("Account unblocked.");row.remove();}catch(e){showError(rowError,e.code,e.arg);}finally{button.disabled=!canWrite;}});
    row.append(button,rowError);panel.append(row);
  }
}
