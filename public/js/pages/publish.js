import { call, edge } from "../api.js";
import { getGithubToken } from "../auth.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";

const listingTypes = {
  "AI skill":"AI skill",
  "MCP server":"MCP server",
  "Dataset":"Dataset",
  "Database":"Database",
  "Prompt pack":"Prompt pack",
  "Agent":"Agent",
  "AI tool":"AI tool",
  "Guide":"Guide"
};
const templates = {
  "AI skill":"What it is:\nHow to install/use:\nRequirements:\nLicence:\nExample:\nLimits:",
  "MCP server":"What it is:\nTransport:\nTools exposed:\nConfig snippet:\nRequirements:\nLicence:\nExample:\nLimits:",
  "Dataset":"What it is:\nSize:\nFormat:\nSource:\nLicence:\nUpdate policy:\nExample:\nLimits:",
  "Database":"What it is:\nSize and format:\nSource:\nLicence:\nHow to query/use:\nUpdate policy:\nExample:\nLimits:",
  "Prompt pack":"What it is:\nHow to use:\nRequirements:\nLicence:\nExample prompts:\nLimits:",
  "Agent":"What it is:\nHow to run:\nRequirements:\nTools or permissions:\nLicence:\nExample:\nLimits:",
  "AI tool":"What it is:\nHow to install/use:\nRequirements:\nLicence:\nExample:\nLimits:",
  "Guide":"What it teaches:\nRequirements:\nSteps:\nLicence:\nExample:\nLimits:"
};
const topics=["programming","web-frontend","backend-api","mobile-desktop","ai-agents","data-db","devops-cloud","security","automation","writing","documents","design","research","business","education"];

function field(labelText,type="text") {
  const wrap=document.createElement("label"); wrap.className="field";
  const span=document.createElement("span"); span.textContent=labelText;
  const input=document.createElement(type==="textarea"?"textarea":"input");
  if(type==="text") input.type="text";
  wrap.append(span,input);
  return {wrap,input};
}

export async function render(app) {
  const profile=await call("me_state");
  if(profile?.country_days_left===undefined || profile.country==null) {
    const p=document.createElement("p"); p.textContent="Choose your country in Settings before publishing.";
    app.append(p);
  }
  let step=0;
  let type="AI skill";
  let topicChoices=[];
  let levelTwo=[];
  let levelThree=[];
  const values={repo:"",name:"",short:"",long:"",t1:[],t2:[],t3:[]};
  const host=document.createElement("section");
  app.append(host);

  function setStep(next) {
    step=next;
    host.replaceChildren();
    const heading=document.createElement("h2"); heading.textContent=`Step ${step+1} of 5`;
    host.append(heading);
    if(step===0) renderType();
    if(step===1) renderRepoAndText();
    if(step===2) renderTopics();
    if(step===3) renderLevelTags(2);
    if(step===4) renderLevelTags(3);
  }

  function renderType() {
    const choices=document.createElement("fieldset");
    const legend=document.createElement("legend"); legend.textContent="What are you listing?";
    choices.append(legend);
    Object.keys(listingTypes).forEach((label)=>{
      const wrap=document.createElement("label"); wrap.className="chip";
      const radio=document.createElement("input"); radio.type="radio"; radio.name="listing-type"; radio.value=label; radio.checked=label===type;
      radio.addEventListener("change",()=>{type=label; if(!values.long) values.long=templates[label];});
      wrap.append(radio,document.createTextNode(label)); choices.append(wrap);
    });
    const next=document.createElement("button"); next.type="button"; next.className="btn"; next.textContent="Continue";
    next.addEventListener("click",()=>{ if(!values.long) values.long=templates[type]; setStep(1); });
    host.append(choices,next);
  }

  function renderRepoAndText() {
    const repo=field("Public GitHub repository URL"); repo.input.value=values.repo;
    const name=field("Name (2-15 characters)");
    name.input.value=values.name; name.input.maxLength=15;
    const short=field("Short description (10-150 characters)");
    short.input.value=values.short; short.input.maxLength=150;
    const long=field("Long description (30-1500 characters)","textarea");
    long.input.value=values.long; long.input.maxLength=1500;
    host.append(repo.wrap,name.wrap,short.wrap,long.wrap);
    const next=document.createElement("button"); next.type="button"; next.className="btn"; next.textContent="Continue";
    next.addEventListener("click",()=>{
      values.repo=repo.input.value.trim(); values.name=name.input.value.trim(); values.short=short.input.value.trim(); values.long=long.input.value.trim();
      setStep(2);
    });
    host.append(next);
  }

  function checkboxGroup(labelText, choices, count, selected, limitText) {
    const fieldset=document.createElement("fieldset"); const legend=document.createElement("legend"); legend.textContent=`${labelText} (${limitText})`; fieldset.append(legend);
    choices.forEach((choice)=>{
      const label=document.createElement("label"); label.className="chip";
      const input=document.createElement("input"); input.type="checkbox"; input.value=typeof choice==="string"?choice:choice.slug;
      if(selected.includes(input.value)) input.checked=true;
      input.addEventListener("change",()=>{
        const value=input.value;
        if(input.checked && selected.length>=count){input.checked=false;toast(`Choose exactly ${count} tags.`);return;}
        if(input.checked) selected.push(value); else selected.splice(selected.indexOf(value),1);
      });
      label.append(input,document.createTextNode(typeof choice==="string"?choice:(choice.label||choice.slug)));fieldset.append(label);
    });
    return fieldset;
  }

  async function renderTopics() {
    topicChoices=await call("tag_picker",{p_level:1,p_q:""});
    const group=checkboxGroup("Choose main topics",topicChoices.length?topicChoices:topics,3,values.t1,"choose 3");
    const next=document.createElement("button"); next.type="button"; next.className="btn"; next.textContent="Continue";
    next.addEventListener("click",()=>{if(values.t1.length!==3){showError(host,"PICK_THREE_TOPICS");return;}setStep(3);});
    host.append(group,next);
  }

  async function renderLevelTags(level) {
    const choices=await call("tag_picker",{p_level:level,p_q:""});
    const count=level===2?9:27;
    const selected=level===2?values.t2:values.t3;
    const group=checkboxGroup(level===2?"Choose level-2 tags":"Choose level-3 tags",choices,count,selected,`choose ${count}`);
    const submit=document.createElement("button"); submit.type="button"; submit.className="btn";
    submit.textContent=level===2?"Continue":"Publish";
    submit.addEventListener("click",()=>{
      if(level===2){if(selected.length!==9){showError(host,"TAGS_COUNT","level 2 needs exactly 9 tags");return;}setStep(4);}
      else publish();
    });
    host.append(group,submit);
  }

  async function publish() {
    if(values.t3.length!==27){showError(host,"TAGS_COUNT","level 3 needs exactly 27 tags");return;}
    const token=getGithubToken();
    if(!token){showError(host,"GITHUB_TOKEN_MISSING");return;}
    try {
      const result=await edge("add-skill",{repo_url:values.repo,name:values.name,short_desc:values.short,long_desc:values.long,tags:{t1:values.t1,t2:values.t2,t3:values.t3},github_token:token});
      toast("Listing published.");
      location.hash=`#/skill/${result.skill_id}`;
    }catch(error){showError(host,error.code,error.arg);}
  }

  setStep(0);
}
