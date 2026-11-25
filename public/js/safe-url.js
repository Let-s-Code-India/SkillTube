export function safeUrl(
  value,
  { allowHash = true, allowPath = true, allowHttps = true } = {},
) {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\\]/.test(value))
    return null;
  if (value.startsWith("#"))
    return allowHash && value.startsWith("#/") ? value : null;
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (!allowPath) return null;
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin
        ? `${url.pathname}${url.search}${url.hash}`
        : null;
    } catch {
      return null;
    }
  }
  if (!allowHttps || !/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
