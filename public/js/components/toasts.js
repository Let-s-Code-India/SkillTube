/*
 * Purpose: Provide reusable toasts UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
export function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(
    /* Run the follow-up action after the delay. */
    () => el.remove(),
    4000,
  );
}
