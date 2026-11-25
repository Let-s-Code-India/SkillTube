export function hashRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return hash || "home";
}
export function routeParts(route) {
  const slash = route.indexOf("/");
  return slash === -1
    ? [route, ""]
    : [route.slice(0, slash), route.slice(slash + 1)];
}
