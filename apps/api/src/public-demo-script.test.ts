import { describe, expect, it } from "vitest";

type PublicDemoModule = {
  buildRouteUrl(baseUrl: URL, route: string): string;
  extractFrontendModuleEntries(html: string): string[];
  normalizeBaseUrl(rawUrl?: string): URL;
  verifyDemoHtml(route: string, html: string): string[];
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
  '<!doctype html><html><head><title>众肯项目管理系统</title></head><body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>';

describe("public demo verifier script", () => {
  it("accepts the built SPA shell on demo routes", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith("/assets/index.js")) {
        return new Response("import './chunk.js';", { status: 200 });
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
      "http://193.112.79.220/projects",
    ]);
  });

  it("rejects a demo page whose frontend module asset is missing", async () => {
    const { verifyPublicDemo } = await loadPublicDemoModule();
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/assets/index.js")) {
        return new Response("missing", { status: 404 });
      }
      return new Response(demoHtml, { status: 200 });
    }) as typeof fetch;

    await expect(
      verifyPublicDemo({ fetchImpl, routes: ["/"] }),
    ).rejects.toThrow("frontend module /assets/index.js returned HTTP 404");
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
    const { buildRouteUrl, extractFrontendModuleEntries, normalizeBaseUrl } =
      await loadPublicDemoModule();
    const baseUrl = normalizeBaseUrl("http://193.112.79.220///");

    expect(buildRouteUrl(baseUrl, "/finance")).toBe(
      "http://193.112.79.220/finance",
    );
    expect(extractFrontendModuleEntries(demoHtml)).toEqual([
      "/assets/index.js",
    ]);
  });
});
