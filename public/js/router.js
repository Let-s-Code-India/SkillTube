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
  const slash = route.indexOf("/");
  return slash === -1
    ? [route, ""]
    : [route.slice(0, slash), route.slice(slash + 1)];
}
