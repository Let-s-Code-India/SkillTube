export const themeNames = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["hacker", "Hacker"],
  ["midnight", "Midnight"],
  ["sunrise", "Sunrise"],
  ["contrast", "High contrast"],
];

const themeValues = new Set(themeNames.map(([value]) => value));

export function getTheme() {
  try {
    const stored = localStorage.getItem("skilltube.theme") || "system";
    return themeValues.has(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function themeLabel(value) {
  return themeNames.find(([name]) => name === value)?.[1] || "System";
}

function updateThemeColor(value) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const effective = value === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : value;
  const colors = {
    light: "#fffdf7",
    dark: "#17151d",
    hacker: "#050b07",
    midnight: "#0e1020",
    sunrise: "#fff4e6",
    contrast: "#000000",
  };
  meta.setAttribute("content", colors[effective] || colors.light);
}

function updateColorScheme(value) {
  const dark = value === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
    : ["dark", "hacker", "midnight", "contrast"].includes(value);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function refreshPicker(container, button, value = getTheme()) {
  const selected = themeValues.has(value) ? value : "system";
  const triggerIcon = button?.querySelector("use");
  if (triggerIcon) triggerIcon.setAttribute("href", `/icons.svg#theme-${selected}`);
  button?.setAttribute("aria-label", `Theme: ${themeLabel(selected)}`);
  container?.querySelectorAll(".theme-option").forEach((option) => {
    const current = option.dataset.theme === selected;
    option.setAttribute("aria-checked", String(current));
    const check = option.querySelector(".theme-option-check");
    if (check) {
      if (current) check.removeAttribute("hidden");
      else check.setAttribute("hidden", "");
    }
  });
}

export function setTheme(value) {
  const selected = themeValues.has(value) ? value : "system";
  try {
    localStorage.setItem("skilltube.theme", selected);
  } catch {}
  if (selected === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", selected);
  updateThemeColor(selected);
  updateColorScheme(selected);
  document.dispatchEvent(new CustomEvent("skilltube:theme", { detail: { value: selected } }));
  const live = document.querySelector('[aria-live="polite"]');
  if (live) live.textContent = `Theme changed to ${themeLabel(selected)}.`;
}

export function mountThemePicker(container, button) {
  const list = document.createElement("div");
  list.className = "theme-picker";
  for (const [value, name] of themeNames) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "theme-option";
    option.dataset.theme = value;
    option.setAttribute("role", "menuitemradio");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `/icons.svg#theme-${value}`);
    icon.append(use);
    const label = document.createElement("span");
    label.textContent = name;
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.classList.add("theme-option-check");
    check.setAttribute("aria-hidden", "true");
    const checkUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
    checkUse.setAttribute("href", "/icons.svg#check");
    check.append(checkUse);
    check.setAttribute("hidden", "");
    option.append(icon, label, check);
    option.addEventListener("click", () => setTheme(value));
    list.append(option);
  }
  container.append(list);
  const refresh = (event) => refreshPicker(container, button, event?.detail?.value || getTheme());
  document.addEventListener("skilltube:theme", refresh);
  refresh();
  return container;
}

export function syncSystemTheme() {
  if (getTheme() !== "system") return;
  document.documentElement.removeAttribute("data-theme");
  updateThemeColor("system");
  updateColorScheme("system");
}
