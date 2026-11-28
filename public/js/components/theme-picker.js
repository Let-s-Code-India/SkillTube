import { topicSlugs } from "../topics.js";

export const themeNames = [
  ["system","System"],["light","Light"],["dark","Dark"],["hacker","Hacker"],
  ["midnight","Midnight"],["sunrise","Sunrise"],["contrast","High contrast"],
];
export function getTheme() {
  try { return localStorage.getItem("skilltube.theme") || "system"; } catch (_) { return "system"; }
}
export function setTheme(value) {
  const allowed = new Set(themeNames.map((item) => item[0]));
  if (!allowed.has(value)) value = "system";
  try {
    if (value === "system") localStorage.removeItem("skilltube.theme");
    else localStorage.setItem("skilltube.theme", value);
  } catch (_) {}
  if (value === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", value);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = value === "system" ? (dark ? "dark" : "light") : value;
    const colors = { light:"#fffdf7", dark:"#17151d", hacker:"#050b07", midnight:"#0e1020", sunrise:"#fff4e6", contrast:"#000000" };
    meta.setAttribute("content", colors[effective] || colors.light);
  }
  document.dispatchEvent(new CustomEvent("skilltube:theme", { detail: { value } }));
  const live = document.querySelector('[aria-live="polite"]');
  if (live) live.textContent = `Theme changed to ${themeNames.find((item) => item[0] === value)?.[1] || "System"}.`;
}
export function mountThemePicker(container) {
  const label = document.createElement("label");
  label.className = "theme-picker";
  label.append(document.createTextNode("Theme "));
  const select = document.createElement("select");
  select.setAttribute("aria-label","Theme");
  for (const [value,name] of themeNames) {
    const option = document.createElement("option");
    option.value = value; option.textContent = name;
    select.append(option);
  }
  select.value = getTheme();
  select.addEventListener("change", () => setTheme(select.value));
  label.append(select);
  container.append(label);
  return select;
}
export function syncSystemTheme() {
  if (getTheme() !== "system") return;
  document.documentElement.removeAttribute("data-theme");
}
