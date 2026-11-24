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
  CANNOT_STAR_OWN:"You cannot star your own listing.",
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
  BAD_REQUEST:"The request is not valid.",
  BAD_NAME:"The listing name must be 2 to 15 characters.",
  BAD_SHORT:"The short description must be 10 to 150 characters.",
  BAD_LONG:"The long description must be 30 to 1500 characters.",
  BAD_REPO_URL:"Paste a public GitHub repository link.",
  REPO_NOT_FOUND:"This repository could not be found.",
  REPO_PRIVATE:"The repository must be public.",
  NOT_REPO_OWNER:"Only people with push or admin access can list this repository.",
  GITHUB_MISMATCH:"Your GitHub account does not match this session.",
  FILE_TOO_BIG:"The image is larger than the allowed size.",
  PNG_NOT_ALLOWED:"PNG upload is not available for this account.",
  BAD_IMAGE:"Choose a valid SVG or allowed PNG image.",
  UNDO_EXPIRED:"The deletion can no longer be undone.",
  SKILL_NOT_FOUND:"This listing could not be found.",
  BAD_ACTION:"This action is not valid.",
  TAGS_REQUIRED:"Choose all 39 tags.",
  TOO_MANY_TAGS:"Choose no more than five profile tags.",
  NO_GITHUB:"This account is not linked to GitHub.",
  NO_LINKS:"Links are not allowed in comments.",
  NOT_YOURS:"This action belongs to another account.",
  FILE_TOO_BIG:"The image is larger than the allowed size.",
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
