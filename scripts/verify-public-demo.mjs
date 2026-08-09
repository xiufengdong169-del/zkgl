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

export function verifyDemoHtml(route, html) {
  if (!html.includes("<title>众肯项目管理系统</title>")) {
    fail(`${route} missing 众肯项目管理系统 title`);
  }
  if (!html.includes('<div id="app"></div>')) {
    fail(`${route} missing Vue app mount point`);
  }
  if (
    !html.includes("type=\"module\"") ||
    !/(?:src="\/assets\/|src="\/src\/main\.ts")/.test(html)
  ) {
    fail(`${route} missing frontend module entry`);
  }
}

export async function verifyPublicDemo({
  baseUrl = process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl,
  fetchImpl = fetch,
  routes = demoRoutes,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  for (const route of routes) {
    const url = buildRouteUrl(normalizedBaseUrl, route);
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) fail(`${route} returned HTTP ${response.status}`);
    const html = await response.text();
    verifyDemoHtml(route, html);
  }
  return `Public demo verified: ${normalizedBaseUrl.toString()}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] || process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl;
  console.log(await verifyPublicDemo({ baseUrl }));
}
