import { showError } from "../errors.js";

export function confirmDialog(message) {
  return window.confirm(message);
}

export function ageGate(app, onAccept) {
  if (localStorage.getItem("skilltube.age_terms.accepted") === "true") return Promise.resolve(true);
  app.replaceChildren();
  const h=document.createElement("h1"); h.textContent="Before you continue";
  const label=document.createElement("label");
  const check=document.createElement("input"); check.type="checkbox"; check.id="age-confirm";
  const text=document.createElement("span"); text.textContent=" I am 18 or older and I accept the Terms and Privacy Policy.";
  label.append(check,text);
  const links=document.createElement("p");
  const terms=document.createElement("a"); terms.href="/legal/terms/"; terms.textContent="Terms";
  const privacy=document.createElement("a"); privacy.href="/legal/privacy/"; privacy.textContent="Privacy Policy";
  links.append(terms,document.createTextNode(" · "),privacy);
  const button=document.createElement("button"); button.type="button"; button.className="btn"; button.textContent="Continue";
  button.addEventListener("click",()=>{
    if (!check.checked) { showError(app,"UNDER_AGE"); return; }
    localStorage.setItem("skilltube.age_terms.accepted","true");
    onAccept();
  });
  app.append(h,links,label,button);
  return Promise.resolve(false);
}
