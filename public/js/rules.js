import { call } from "./api.js";

const CACHE_KEY = "skilltube.publicRules";
const TTL = 10 * 60 * 1000;

export async function applyLiveRules(root = document) {
  let rules = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.saved < TTL) rules = cached.rules;
  } catch {}
  if (!rules) {
    try {
      rules = await call("public_settings");
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ saved: Date.now(), rules }));
      } catch {}
    } catch {
      return;
    }
  }
  if (!rules || typeof rules !== "object") return;
  root.querySelectorAll("[data-rule]").forEach((node) => {
    const key = node.dataset.rule;
    const value = rules[key];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
      node.textContent = Number(value).toLocaleString();
    }
  });
}

applyLiveRules();
