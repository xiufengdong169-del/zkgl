import { pathToFileURL } from "node:url";

const defaultBaseUrl = "http://193.112.79.220/";
const demoRoutes = ["/", "/projects", "/contracts", "/finance", "/admin"];

const fail = (message) => {
  throw new Error(`Public demo verification failed: ${message}`);
};

export function normalizeBaseUrl(rawUrl = defaultBaseUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`invalid URL ${rawUrl}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    fail(`unsupported protocol ${url.protocol}`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "/");
  url.search = "";
  url.hash = "";
  return url;
}

export function buildRouteUrl(baseUrl, route) {
  const url = new URL(baseUrl.toString());
  url.pathname = route;
  return url.toString();
}

export function extractFrontendModuleEntries(html) {
  return Array.from(
    html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1],
  ).filter(Boolean);
}

export function verifyDemoHtml(route, html) {
  if (!html.includes("<title>众肯项目管理系统</title>")) {
    fail(`${route} missing 众肯项目管理系统 title`);
  }
  if (!html.includes('<div id="app"></div>')) {
    fail(`${route} missing Vue app mount point`);
  }
  const moduleEntries = extractFrontendModuleEntries(html);
  if (!moduleEntries.some((entry) => /^\/(?:assets\/|src\/main\.ts)/.test(entry))) {
    fail(`${route} missing frontend module entry`);
  }
  return moduleEntries;
}

export async function verifyPublicDemo({
  baseUrl = process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl,
  fetchImpl = fetch,
  routes = demoRoutes,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const checkedModuleUrls = new Set();
  for (const route of routes) {
    const url = buildRouteUrl(normalizedBaseUrl, route);
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) fail(`${route} returned HTTP ${response.status}`);
    const html = await response.text();
    const moduleEntries = verifyDemoHtml(route, html);
    for (const entry of moduleEntries) {
      const moduleUrl = new URL(entry, url).toString();
      if (checkedModuleUrls.has(moduleUrl)) continue;
      checkedModuleUrls.add(moduleUrl);
      const moduleResponse = await fetchImpl(moduleUrl, { redirect: "follow" });
      if (!moduleResponse.ok) {
        fail(`${route} frontend module ${entry} returned HTTP ${moduleResponse.status}`);
      }
      const moduleContent = await moduleResponse.text();
      if (!moduleContent.trim()) {
        fail(`${route} frontend module ${entry} is empty`);
      }
    }
  }
  return `Public demo verified: ${normalizedBaseUrl.toString()}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] || process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl;
  console.log(await verifyPublicDemo({ baseUrl }));
}
