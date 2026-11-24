export function hashRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return hash || "home";
}
