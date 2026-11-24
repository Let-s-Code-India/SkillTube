import { strings } from "./strings.js";
const table = {
  LOGIN_REQUIRED:"Please sign in with GitHub first.",
  ACCOUNT_NOT_READY:"Your account is not ready. Finish sign-in setup and try again.",
  ACCOUNT_BLOCKED:"This account is blocked. Contact the SkillTube team.",
  UNDER_AGE:"SkillTube is only for people aged 18 or older.",
  COUNTRY_MISMATCH:"Choose the country where you currently live.",
  COUNTRY_UNVERIFIED:"Your country could not be verified.",
  COUNTRY_LOCKED:"Country changes are locked for now.",
  BAD_COUNTRY:"Choose a valid country.",
  PUBLISH_LIMIT:"You have reached your current publish limit.",
  REPO_ALREADY_LISTED:"This repository is already listed.",
  EDIT_LOCKED:"This item is locked from editing for now.",
  NOT_YOUR_SKILL:"This listing belongs to another developer.",
  TAGS_COUNT:"Choose the required number of tags.",
  TAGS_DUPLICATE:"Tags must be unique.",
  TAGS_BAD_TOPIC:"Choose only valid main topics.",
  PICK_THREE_TOPICS:"Choose exactly three topics.",
  READ_ONLY:"SkillTube is in read-only mode.",
  SIGNUPS_PAUSED:"New sign-ups are paused.",
  STAR_LIMIT:"You have reached the star limit.",
  FOLLOW_LIMIT:"You have reached the follow limit.",
  COMMENT_EMPTY:"Write a comment first.",
  COMMENT_TOO_LONG:"This comment is too long.",
  COMMENT_LIMIT_SKILL:"You already commented on this listing in the last 24 hours.",
  COMMENT_LIMIT_DAY:"You reached your daily comment limit.",
  REPORT_LIMIT_TARGET:"You already reported this target in the last 24 hours.",
  REPORT_LIMIT_DAY:"You reached your daily report limit.",
  CANNOT_REPORT_OWN:"You cannot report your own listing or channel.",
  NOT_ADMIN:"This area is restricted.",
  NOT_ADMIN_WRITER:"This action requires an administrator.",
  GITHUB_UNAVAILABLE:"GitHub is unavailable. Please try again shortly.",
  GITHUB_TOKEN_MISSING:"Your GitHub session expired. Sign out and sign in again.",
  SERVER_ERROR:"Something went wrong. Please try again."
};
export function errorMessage(code, arg) {
  const key = String(code || "SERVER_ERROR").split(":")[0];
  let message = table[key] || table.SERVER_ERROR;
  if (arg && (key === "PUBLISH_LIMIT" || key === "EDIT_LOCKED" || key === "COUNTRY_LOCKED")) {
    message += ` ${arg}`;
  }
  return message;
}
export function showError(target, code, arg) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return;
  el.textContent = errorMessage(code, arg);
  el.className = "error";
}
