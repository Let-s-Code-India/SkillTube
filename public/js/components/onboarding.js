export function onboardingStepper(container, step = 1) {
  const steps = ["Sign in","Confirm 18+","Choose country","Done"];
  const nav=document.createElement("nav");
  nav.className="onboarding-stepper";
  nav.setAttribute("aria-label","Registration progress");
  steps.forEach((label,index)=>{
    const item=document.createElement("div");
    item.className="step";
    if(index+1===step)item.setAttribute("aria-current","step");
    item.append(document.createTextNode(`${index+1}. ${label}`));
    nav.append(item);
  });
  container.append(nav);
  return nav;
}
