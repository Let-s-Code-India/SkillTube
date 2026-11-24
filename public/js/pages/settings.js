import { call, edge, edgeForm } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";

export async function render(app) {
  let profile;
  try { profile=await call("me_state"); } catch(error) { showError(app,error.code,error.arg); return; }
  const h=document.createElement("h2"); h.textContent="Profile";
  const imagePanel=document.createElement("form");
  const help=document.createElement("p"); help.className="mut"; help.textContent="Profile image: SVG, or PNG for Blue/Master Tick accounts.";
  const input=document.createElement("input"); input.type="file"; input.accept="image/svg+xml,image/png";
  const upload=document.createElement("button"); upload.type="button"; upload.className="btn"; upload.textContent="Upload image";
  imagePanel.append(help,input,upload);
  upload.addEventListener("click",async()=>{
    const file=input.files?.[0]; if(!file){showError(imagePanel,"BAD_IMAGE");return;}
    const rules=profile?.image_rules||{};
    const maxBytes=rules.logo_max_bytes||3072;
    if(file.size>maxBytes){showError(imagePanel,"FILE_TOO_BIG",String(maxBytes));return;}
    if(file.type==="image/png"&&!rules.logo_png){showError(imagePanel,"PNG_NOT_ALLOWED");return;}
    if(file.type!=="image/png"&&file.type!=="image/svg+xml"){showError(imagePanel,"BAD_IMAGE");return;}
    const form=new FormData();form.append("action","upload");form.append("target","profile");form.append("file",file,file.name);
    try{await edgeForm("save-image",form);toast("Profile image updated.");}
    catch(error){showError(imagePanel,error.code,error.arg);}
  });

  const countryPanel=document.createElement("form");
  const countryLabel=document.createElement("label"); countryLabel.textContent="Private country";
  const country=document.createElement("input"); country.type="text"; country.maxLength=2; country.value=profile?.country||"";
  const countryButton=document.createElement("button"); countryButton.type="button"; countryButton.className="btn"; countryButton.textContent="Save country";
  countryLabel.append(country);countryPanel.append(countryLabel,countryButton);
  if(profile?.country_days_left>0){const lock=document.createElement("p");lock.className="mut";lock.textContent=`Country changes are locked for ${profile.country_days_left} days.`;countryPanel.append(lock);country.disabled=true;}
  countryButton.addEventListener("click",async()=>{
    try{await edge("set-country",{country:country.value.trim().toUpperCase()});toast("Country saved.");profile=await call("me_state");}
    catch(error){showError(countryPanel,error.code,error.arg);}
  });
  app.append(h,imagePanel,countryPanel);
}
