import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const defaultBaseUrl = "http://127.0.0.1:4173/";
const defaultRoutesFile = resolve(root, "apps/web/src/routes.ts");

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

export function extractDemoRoutes(source) {
  return [
    ...new Set(
      [...source.matchAll(/path:\s*["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((route) => route?.startsWith("/") && !route.includes(":")),
    ),
  ];
}

export function readDefaultDemoRoutes({ routesFile = defaultRoutesFile } = {}) {
  const routes = extractDemoRoutes(readFileSync(routesFile, "utf8"));
  if (!routes.length) fail("no frontend demo routes found");
  return routes;
}

export function extractFrontendModuleEntries(html) {
  return Array.from(
    html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1],
  ).filter(Boolean);
}

export function extractStylesheetEntries(html) {
  return Array.from(
    html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
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
  const stylesheetEntries = extractStylesheetEntries(html);
  if (!stylesheetEntries.some((entry) => /^\/assets\/.*\.css(?:\?|$)/.test(entry))) {
    fail(`${route} missing frontend stylesheet entry`);
  }
  return { moduleEntries, stylesheetEntries };
}

export async function verifyPublicDemo({
  baseUrl = process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl,
  fetchImpl = fetch,
  routes = readDefaultDemoRoutes(),
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const checkedAssetUrls = new Set();
  for (const route of routes) {
    const url = buildRouteUrl(normalizedBaseUrl, route);
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) fail(`${route} returned HTTP ${response.status}`);
    const html = await response.text();
    const { moduleEntries, stylesheetEntries } = verifyDemoHtml(route, html);
    for (const [kind, entry] of [
      ...moduleEntries.map((item) => ["frontend module", item]),
      ...stylesheetEntries.map((item) => ["frontend stylesheet", item]),
    ]) {
      const assetUrl = new URL(entry, url).toString();
      if (checkedAssetUrls.has(assetUrl)) continue;
      checkedAssetUrls.add(assetUrl);
      const assetResponse = await fetchImpl(assetUrl, { redirect: "follow" });
      if (!assetResponse.ok) {
        fail(`${route} ${kind} ${entry} returned HTTP ${assetResponse.status}`);
      }
      const assetContent = await assetResponse.text();
      if (!assetContent.trim()) {
        fail(`${route} ${kind} ${entry} is empty`);
      }
    }
  }
  return `Public demo verified: ${normalizedBaseUrl.toString()}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] || process.env.ZKGL_PUBLIC_DEMO_URL || defaultBaseUrl;
  console.log(await verifyPublicDemo({ baseUrl }));
}
