/*
 * Purpose: Add client-side actions to public Why SkillTube articles.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
const button = document.querySelector("#share-post");
const status = document.querySelector("#share-status");

button.addEventListener(
  "click",
  /* Handle the click event. */
  async () => {
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(
        document.querySelector('link[rel="canonical"]').href,
      );
      status.textContent = "Link copied.";
    } catch {
      status.textContent =
        "Copy was unavailable. You can copy the page address from your browser.";
    } finally {
      button.disabled = false;
    }
  },
);
