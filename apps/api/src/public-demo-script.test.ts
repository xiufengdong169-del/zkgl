import { describe, expect, it } from "vitest";

type PublicDemoModule = {
  buildRouteUrl(baseUrl: URL, route: string): string;
  extractDemoRoutes(source: string): string[];
  extractFrontendModuleEntries(html: string): string[];
  extractStylesheetEntries(html: string): string[];
  normalizeBaseUrl(rawUrl?: string): URL;
  readDefaultDemoRoutes(): string[];
  verifyDemoHtml(route: string, html: string): {
    moduleEntries: string[];
    stylesheetEntries: string[];
  };
  verifyPublicDemo(options?: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    routes?: string[];
  }): Promise<string>;
};

async function loadPublicDemoModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-public-demo.mjs")) as PublicDemoModule;
}

const demoHtml =
  '<!doctype html><html><head><title>众肯项目管理系统</title><link rel="stylesheet" href="/assets/index.css"></head><body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>';

describe("public demo verifier script", () => {
  it("derives demo route coverage from all declared frontend SPA routes", async () => {
    const { readDefaultDemoRoutes } = await loadPublicDemoModule();

    expect(readDefaultDemoRoutes()).toEqual([
      "/login",
      "/",
      "/demo",
      "/customers",
      "/leads",
      "/projects",
      "/approvals",
      "/bids",
      "/contracts",
      "/delivery",
      "/finance",
      "/settlements",
      "/files",
      "/admin",
      "/reports",
    ]);
  });

  it("extracts only static SPA routes for demo verification", async () => {
    const { extractDemoRoutes } = await loadPublicDemoModule();

    expect(
      extractDemoRoutes(`
        { path: "/" },
        { path: "/projects" },
        { path: "/projects/:id" },
        { path: "relative" },
        { path: "/projects" },
      `),
    ).toEqual(["/", "/projects"]);
  });

  it("defaults to the local visual demo URL so verification does not touch the server accidentally", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith("/assets/index.js")) {
        return new Response("import './chunk.js';", { status: 200 });
      }
      if (url.endsWith("/assets/index.css")) {
        return new Response("body{display:block}", { status: 200 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({ fetchImpl, routes: ["/"] }),
    ).resolves.toBe("Public demo verified: http://127.0.0.1:4173/");
    expect(requested).toEqual([
      "http://127.0.0.1:4173/",
      "http://127.0.0.1:4173/assets/index.js",
      "http://127.0.0.1:4173/assets/index.css",
    ]);
  });

  it("accepts the built SPA shell on demo routes", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith("/assets/index.js")) {
        return new Response("import './chunk.js';", { status: 200 });
      }
      if (url.endsWith("/assets/index.css")) {
        return new Response("body{display:block}", { status: 200 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({
        baseUrl: "http://193.112.79.220",
        fetchImpl,
        routes: ["/", "/projects"],
      }),
    ).resolves.toBe("Public demo verified: http://193.112.79.220/");
    expect(requested).toEqual([
      "http://193.112.79.220/",
      "http://193.112.79.220/assets/index.js",
      "http://193.112.79.220/assets/index.css",
      "http://193.112.79.220/projects",
    ]);
  });

  it("checks every default frontend SPA route", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith("/assets/index.js")) {
        return new Response("import './chunk.js';", { status: 200 });
      }
      if (url.endsWith("/assets/index.css")) {
        return new Response("body{display:block}", { status: 200 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({ baseUrl: "http://127.0.0.1:4173/", fetchImpl }),
    ).resolves.toBe("Public demo verified: http://127.0.0.1:4173/");
    expect(requested).toEqual([
      "http://127.0.0.1:4173/login",
      "http://127.0.0.1:4173/assets/index.js",
      "http://127.0.0.1:4173/assets/index.css",
      "http://127.0.0.1:4173/",
      "http://127.0.0.1:4173/demo",
      "http://127.0.0.1:4173/customers",
      "http://127.0.0.1:4173/leads",
      "http://127.0.0.1:4173/projects",
      "http://127.0.0.1:4173/approvals",
      "http://127.0.0.1:4173/bids",
      "http://127.0.0.1:4173/contracts",
      "http://127.0.0.1:4173/delivery",
      "http://127.0.0.1:4173/finance",
      "http://127.0.0.1:4173/settlements",
      "http://127.0.0.1:4173/files",
      "http://127.0.0.1:4173/admin",
      "http://127.0.0.1:4173/reports",
    ]);
  });

  it("rejects a demo page whose frontend module asset is missing", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/assets/index.js")) {
        return new Response("missing", { status: 404 });
      }
      if (url.endsWith("/assets/index.css")) {
        return new Response("body{}", { status: 200 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({ fetchImpl, routes: ["/"] }),
    ).rejects.toThrow("frontend module /assets/index.js returned HTTP 404");
  });

  it("rejects a demo page whose stylesheet asset is missing", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/assets/index.js")) {
        return new Response("import './chunk.js';", { status: 200 });
      }
      if (url.endsWith("/assets/index.css")) {
        return new Response("missing", { status: 404 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({ fetchImpl, routes: ["/"] }),
    ).rejects.toThrow("frontend stylesheet /assets/index.css returned HTTP 404");
  });

  it("rejects an old or unrelated HTML page even when HTTP status is 200", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const fetchImpl = (async () =>
      new Response("<html><title>旧站首页</title></html>", {
        status: 200,
      })) as typeof fetch;

    await expect(
      verifyPublicDemo({ fetchImpl, routes: ["/"] }),
    ).rejects.toThrow("missing 众肯项目管理系统 title");
  });

  it("rejects invalid URLs and failed route responses", async () => {
    const { normalizeBaseUrl, verifyPublicDemo } = await loadPublicDemoModule();

    expect(() => normalizeBaseUrl("ftp://example.com")).toThrow(
      "unsupported protocol",
    );
    await expect(
      verifyPublicDemo({
        fetchImpl: (async () => new Response("missing", { status: 404 })) as typeof fetch,
        routes: ["/admin"],
      }),
    ).rejects.toThrow("/admin returned HTTP 404");
  });

  it("builds route URLs from normalized base URL", async () => {
    const {
      buildRouteUrl,
      extractFrontendModuleEntries,
      extractStylesheetEntries,
      normalizeBaseUrl,
    } = await loadPublicDemoModule();
    const baseUrl = normalizeBaseUrl("http://193.112.79.220///");

    expect(buildRouteUrl(baseUrl, "/finance")).toBe(
      "http://193.112.79.220/finance",
    );
    expect(extractFrontendModuleEntries(demoHtml)).toEqual([
      "/assets/index.js",
    ]);
    expect(extractStylesheetEntries(demoHtml)).toEqual([
      "/assets/index.css",
    ]);
  });
});
