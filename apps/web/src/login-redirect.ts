export function resolveLoginRedirectTarget(
  redirect: unknown,
  fallback = "/",
): string {
  const value = Array.isArray(redirect) ? redirect[0] : redirect;
  if (typeof value !== "string") return fallback;
  const target = value.trim();
  if (!target || !target.startsWith("/") || target.startsWith("//"))
    return fallback;
  try {
    const url = new URL(target, "https://zkgl.local");
    return url.origin === "https://zkgl.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
