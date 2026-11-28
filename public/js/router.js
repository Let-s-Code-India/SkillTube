/*
 * Purpose: Parse and normalize hash-based application routes.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
export function hashRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return hash || "home";
}
// Extract and normalize a route name and its optional identifier.
export function routeParts(route) {
  const path = route.split("?", 1)[0];
  const slash = path.indexOf("/");
  return slash === -1
    ? [path, ""]
    : [path.slice(0, slash), path.slice(slash + 1)];
}
