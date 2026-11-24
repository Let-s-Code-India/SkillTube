import { call } from "../api.js";
import { showError } from "../errors.js";
import { confirmDialog } from "../components/dialogs.js";
import { toast } from "../components/toasts.js";
import { edgeForm } from "../api.js";

function field(labelText,value="",textarea=false) {
  const label=document.createElement("label"); const span=document.createElement("span"); span.textContent=labelText;
  const input=document.createElement(textarea?"textarea":"input"); input.value=value; if(!textarea) input.type="text";
  label.append(span,input); return {label,input};
}

export async function render(app) {
  let skills=[];
  try { skills=await call("my_skills"); } catch(error) { showError(app,error.code,error.arg); return; }
  if(!skills.length){const p=document.createElement("p");p.textContent="You have no listings yet.";app.append(p);const a=document.createElement("a");a.className="btn";a.href="#/publish";a.textContent="Publish a listing";app.append(a);return;}

  for(const skill of skills) {
    const card=document.createElement("article");card.className="card";
    const title=document.createElement("h2");title.textContent=skill.name;
    const status=document.createElement("p");status.className="mut";status.textContent=skill.deleted_at?"Deleted":`${skill.status} · edit lock: ${skill.edit_days_left||0} days`;
    const menuWrap=document.createElement("div");
    const edit=document.createElement("button");edit.type="button";edit.className="btn secondary";edit.textContent="Edit";
    const remove=document.createElement("button");remove.type="button";remove.className="btn danger";remove.textContent="Delete";
    const image=document.createElement("button");image.type="button";image.className="btn secondary";image.textContent="Change image";
    menuWrap.append(edit,remove,image);
    card.append(title,status,menuWrap);

    edit.addEventListener("click",()=>openEdit(card,skill));
    remove.addEventListener("click",()=>deleteSkill(card,skill));
    image.addEventListener("click",()=>openImage(card,skill));
    app.append(card);
  }
}

async function openEdit(card,skill) {
  const old=card.querySelector(".edit-panel"); if(old) old.remove();
  const panel=document.createElement("form");panel.className="edit-panel";
  const short=field("Short description",skill.short_desc);
  short.input.maxLength=150;
  const long=field("Long description",skill.long_desc,true);
  long.input.maxLength=1500;
  const zoom=field("Image zoom",""+(skill.image_zoom||1)); zoom.input.type="number"; zoom.input.min="1"; zoom.input.max="4"; zoom.input.step="0.1";
  const submit=document.createElement("button");submit.type="button";submit.className="btn";submit.textContent="Save";
  panel.append(short.label,long.label,zoom.label,submit);
  card.append(panel);
  submit.addEventListener("click",async()=>{
    if(short.input.value.length<10||short.input.value.length>150||long.input.value.length<30||long.input.value.length>1500){showError(panel,"BAD_SHORT");return;}
    try{await call("edit_skill",{p_skill:skill.id,p_short:short.input.value,p_long:long.input.value,p_tags:null,p_zoom:Number(zoom.input.value),p_x:skill.image_x||0,p_y:skill.image_y||0});toast("Listing updated.");location.reload();}
    catch(error){showError(panel,error.code,error.arg);}
  });
}

async function deleteSkill(card,skill) {
  if(!confirmDialog(`Delete "${skill.name}"? This can be undone for a short time in Settings.`))return;
  try{await call("delete_skill",{p_skill:skill.id});toast("Listing deleted.");location.reload();}
  catch(error){showError(card,error.code,error.arg);}
}

async function openImage(card,skill) {
  const old=card.querySelector(".image-panel");if(old)old.remove();
  const panel=document.createElement("form");panel.className="image-panel";
  const input=document.createElement("input");input.type="file";input.accept="image/svg+xml,image/png";
  const help=document.createElement("p");help.className="mut";help.textContent="SVG or an allowed PNG.";
  const upload=document.createElement("button");upload.type="button";upload.className="btn";upload.textContent="Upload";
  panel.append(help,input,upload);card.append(panel);
  upload.addEventListener("click",async()=>{
    const file=input.files?.[0];if(!file){showError(panel,"BAD_IMAGE");return;}
    let rules;try{rules=(await call("me_state"))?.image_rules;}catch(error){showError(panel,error.code,error.arg);return;}
    const maxBytes=rules?.skill_max_bytes||3072;
    if(file.size>maxBytes){showError(panel,"FILE_TOO_BIG",String(maxBytes));return;}
    if(file.type==="image/png"&&!rules?.skill_png){showError(panel,"PNG_NOT_ALLOWED");return;}
    if(file.type!=="image/png"&&file.type!=="image/svg+xml"){showError(panel,"BAD_IMAGE");return;}
    const form=new FormData();form.append("action","upload");form.append("target","skill");form.append("skill_id",skill.id);form.append("file",file,file.name);
    try{await edgeForm("save-image",form);toast("Listing image updated.");location.reload();}
    catch(error){showError(panel,error.code,error.arg);}
  });
}
