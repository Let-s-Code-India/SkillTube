import { call } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";
import { renderMarkdown } from "../components/markdown.js";
import { confirmDialog } from "../components/dialogs.js";

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
  let admins;
  try { admins=await call("admin_list"); }
  catch(error) { showError(app,error.code,error.arg); return; }
  const isOwner=(admins||[]).some((admin)=>admin.user_id===state.id&&admin.role==="owner");

  const nav=el("nav",undefined,"admin-tabs");
  const content=el("div");
  app.append(nav,content);
  const canWrite=state.admin_can_write===true;
  const panels=[
    ["Overview",renderOverview],
    ["Reports",renderReports],
    ["Users",renderUsers],
    ["Settings",renderSettings],
    ["Blocked accounts",renderBlocked],
    ["Announcements",renderAnnouncements],
    ["Revoke badge",renderBadgeRevocation],
    ["Audit log",renderAuditLog],
    ["Admin team",renderAdminTeam]
  ];
  for(const [label,renderPanel] of panels) {
    const button=el("button",label,"btn secondary");button.type="button";
    button.addEventListener("click",async()=>{
      content.replaceChildren();
      const panel=section(label);content.append(panel);
      if(!canWrite)panel.append(el("p","Read-only administrator access.","mut"));
      const error=el("div");panel.append(error);
      try{await renderPanel(panel,error,canWrite,isOwner);}catch(e){showError(error,e.code,e.arg);}
    });
    nav.append(button);
  }

  async function renderAnnouncements(panel,error,canWrite) {
    const form=document.createElement("form");
    const titleLabel=el("label","Title (up to 120 characters)");
    const title=document.createElement("input");
    title.maxLength=120;
    title.required=true;
    titleLabel.append(title);
    const bodyLabel=el("label","Markdown body");
    const body=document.createElement("textarea");
    body.maxLength=102400;
    bodyLabel.append(body);
    const pinnedLabel=el("label","Pin announcement");
    const pinned=document.createElement("input");
    pinned.type="checkbox";
    pinnedLabel.prepend(pinned);
    const startsLabel=el("label","Start time (optional)");
    const starts=document.createElement("input");
    starts.type="datetime-local";
    startsLabel.append(starts);
    const endsLabel=el("label","End time (optional)");
    const ends=document.createElement("input");
    ends.type="datetime-local";
    endsLabel.append(ends);
    const preview=el("section",undefined,"card announcement-preview");
    preview.append(el("h3","Preview"));
    const previewBody=el("div");
    preview.append(previewBody);
    body.addEventListener("input",()=>{
      previewBody.replaceChildren();
      try { renderMarkdown(previewBody,body.value); }
      catch { showError(previewBody,"SERVER_ERROR"); }
    });
    const submit=el("button","Publish announcement","btn");
    submit.type="submit";
    submit.disabled=!canWrite;
    form.append(titleLabel,bodyLabel,pinnedLabel,startsLabel,endsLabel,submit);
    panel.append(form,preview);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();
      if(title.value.trim().length<1){showError(error,"TITLE_REQUIRED");return;}
      if(title.value.length>120||new TextEncoder().encode(body.value).length>102400){showError(error,"ANNOUNCEMENT_TOO_BIG");return;}
      const asIso=(value)=>value?new Date(value).toISOString():null;
      const startTime=starts.value?Date.parse(starts.value):Date.now();
      const endTime=ends.value?Date.parse(ends.value):null;
      if(!Number.isFinite(startTime)||(endTime!==null&&(!Number.isFinite(endTime)||endTime<=startTime))) {
        showError(error,"BAD_TIMES");
        return;
      }
      submit.disabled=true;
      try {
        await call("admin_announce",{
          p_title:title.value.trim(),
          p_body:body.value,
          p_pinned:pinned.checked,
          p_starts:asIso(starts.value),
          p_ends:asIso(ends.value)
        });
        toast("Announcement published.");
        await load();
      } catch(e) {
        showError(error,e.code,e.arg);
      } finally {
        submit.disabled=!canWrite;
      }
    });

    const list=el("div",undefined,"admin-list");
    panel.append(el("h3","Published and scheduled announcements"),list);
    async function load() {
      list.replaceChildren();
      let rows;
      try { rows=await call("admin_announcements"); }
      catch(e) { showError(error,e.code,e.arg);return; }
      if(!rows.length){list.append(el("p","No announcements have been created."));return;}
      for(const announcement of rows) {
        const card=el("article",undefined,"card");
        card.append(el("h4",announcement.title));
        card.append(el("p",`${announcement.pinned?"Pinned · ":""}Starts ${new Date(announcement.starts_at).toLocaleString()}${announcement.ends_at?` · Ends ${new Date(announcement.ends_at).toLocaleString()}`:""}`,"mut"));
        const remove=el("button","Delete announcement","btn danger");
        remove.type="button";
        remove.disabled=!canWrite;
        remove.addEventListener("click",async()=>{
          if(!confirmDialog(`Delete the announcement "${announcement.title}"?`))return;
          remove.disabled=true;
          try {
            await call("admin_announcement_delete",{p_id:announcement.id});
            await load();
          } catch(e) {
            showError(error,e.code,e.arg);
            remove.disabled=!canWrite;
          }
        });
        card.append(remove);
        list.append(card);
      }
    }
    await load();
  }

  async function renderBadgeRevocation(panel,error,canWrite) {
    const form=document.createElement("form");
    const searchLabel=el("label","Find a developer by username or name");
    const query=document.createElement("input");
    query.type="search";
    query.minLength=2;
    searchLabel.append(query);
    const keyLabel=el("label","Badge key");
    const key=document.createElement("input");
    key.required=true;
    keyLabel.append(key);
    const reasonLabel=el("label","Reason (required)");
    const reason=document.createElement("textarea");
    reason.maxLength=300;
    reasonLabel.append(reason);
    const submit=el("button","Search developers","btn");
    submit.type="submit";
    submit.disabled=!canWrite;
    const results=el("div",undefined,"admin-list");
    form.append(searchLabel,keyLabel,reasonLabel,submit);
    panel.append(form,results);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();
      if(reason.value.trim().length<3){showError(error,"REASON_REQUIRED");return;}
      results.replaceChildren();
      submit.disabled=true;
      try {
        const users=await call("admin_users_search",{p_q:query.value.trim()});
        if(!users.length){results.append(el("p","No matching developers."));return;}
        for(const user of users) {
          const row=el("article",undefined,"card");
          row.append(el("h3",`@${user.username} — ${user.name}`));
          const revoke=el("button","Revoke badge","btn danger");
          revoke.type="button";
          revoke.disabled=!canWrite;
          revoke.addEventListener("click",async()=>{
            revoke.disabled=true;
            try {
              await call("admin_revoke_badge",{p_user:user.id,p_key:key.value.trim(),p_reason:reason.value.trim()});
              toast("Badge revocation recorded.");
            } catch(e) {
              showError(row,e.code,e.arg);
              revoke.disabled=!canWrite;
            }
          });
          row.append(revoke);
          results.append(row);
        }
      } catch(e) {
        showError(error,e.code,e.arg);
      } finally {
        submit.disabled=!canWrite;
      }
    });
  }

  async function renderAuditLog(panel,error) {
    let rows;
    try { rows=await call("admin_audit",{p_limit:100}); }
    catch(e) { showError(error,e.code,e.arg);return; }
    if(!rows.length){panel.append(el("p","There are no audit entries."));return;}
    const list=el("div",undefined,"admin-list");
    for(const entry of rows) {
      const card=el("article",undefined,"card");
      card.append(el("h3",entry.action||"Admin action"));
      card.append(el("p",`${entry.at?new Date(entry.at).toLocaleString():"Time unavailable"} · ${entry.actor||"Unknown actor"} · ${entry.target||"No target"}`));
      if(entry.detail)card.append(el("pre",JSON.stringify(entry.detail,null,2)));
      list.append(card);
    }
    panel.append(list);
  }

  async function renderAdminTeam(panel,error,canWrite,isOwner) {
    if(!isOwner) {
      panel.append(el("p","Only the project owner can change administrator access. This list is read-only for your role.","mut"));
    }
    const form=document.createElement("form");
    const usernameLabel=el("label","Developer username");
    const username=document.createElement("input");
    username.autocomplete="off";
    usernameLabel.append(username);
    const roleLabel=el("label","Role");
    const role=document.createElement("select");
    for(const value of ["admin","viewer"]) {
      const option=el("option",value);
      option.value=value;
      role.append(option);
    }
    roleLabel.append(role);
    const add=el("button","Add or update role","btn");
    add.type="submit";
    add.disabled=!isOwner||!canWrite;
    form.append(usernameLabel,roleLabel,add);
    panel.append(form);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();
      add.disabled=true;
      try {
        await call("admin_add",{p_username:username.value.trim(),p_role:role.value});
        toast("Administrator role updated.");
        await load();
      } catch(e) {
        showError(error,e.code,e.arg);
      } finally {
        add.disabled=!isOwner||!canWrite;
      }
    });
    const list=el("div",undefined,"admin-list");
    panel.append(list);
    async function load() {
      list.replaceChildren();
      let rows;
      try { rows=await call("admin_list"); }
      catch(e) { showError(error,e.code,e.arg);return; }
      for(const admin of rows) {
        const card=el("article",undefined,"card");
        card.append(el("h3",`@${admin.username||"unknown"} · ${admin.role}`));
        if(admin.role!=="owner") {
          const remove=el("button","Remove access","btn danger");
          remove.type="button";
          remove.disabled=!isOwner||!canWrite;
          remove.addEventListener("click",async()=>{
            remove.disabled=true;
            try {
              await call("admin_remove",{p_user:admin.user_id});
              await load();
            } catch(e) {
              showError(card,e.code,e.arg);
              remove.disabled=!isOwner||!canWrite;
            }
          });
          card.append(remove);
        }
        list.append(card);
      }
    }
    await load();
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
