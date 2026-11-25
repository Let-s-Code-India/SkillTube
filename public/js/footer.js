/*
 * Purpose: Provide shared static footer markup for generators and pages.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
export function footerMarkup() {
  return `<footer class="footer"><div class="container">
  <nav class="footer-links" aria-label="Footer">
    <a href="/legal/privacy/">Privacy</a><a href="/legal/terms/">Terms</a>
    <a href="/legal/community-guidelines/">Community Guidelines</a><a href="/legal/cookies/">Cookies</a>
    <a href="/legal/security/">Security</a><a href="/brand/">Licenses</a><a href="/contact/">Contact</a>
    <a href="/faq/">FAQ</a><a href="/why-skilltube/">Why SkillTube</a><a href="/docs/">Docs</a>
  </nav>
  <p>Created by Ayush Giri, Founder of <a href="https://let-s-code-india.github.io/">Let's Code India</a>. © 2026 <a href="https://let-s-code-india.github.io/">Let's Code India</a>. Source code under the MIT License.</p></div></footer>`;
}
