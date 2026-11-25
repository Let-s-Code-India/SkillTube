/*
 * Purpose: Render the static footer page and coordinate its UI actions.
 * Called by: the static app shell.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { footerMarkup } from "../footer.js";
document.querySelector("#footer-slot").innerHTML = footerMarkup();
