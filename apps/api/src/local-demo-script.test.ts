import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

type LocalDemoModule = {
  collectLocalDemoAssetRoutes(options?: { dist?: string }): Promise<string[]>;
  createDemoStaticServer(options?: { dist?: string }): Server;
  localDemoBuildCommand(options?: { outDir?: string }): {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  };
  verifyLocalDemo(options?: {
    outDir?: string;
    buildDemo?: (options: { outDir: string }) => Promise<string>;
    verifyDist?: (options: { dist: string }) => Promise<string>;
    verifyDemo?: (options: { baseUrl: string }) => Promise<string>;
    verifyAssets?: (options: { baseUrl: string; dist: string }) => Promise<string>;
  }): Promise<string>;
  verifyLocalDemoAssets(options?: {
    baseUrl?: string;
    dist?: string;
    fetchImpl?: typeof fetch;
  }): Promise<string>;
};

type ServeLocalDemoModule = {
  serveLocalDemo(options?: {
    host?: string;
    port?: number;
    strictPort?: boolean;
    outDir?: string;
    buildDemo?: (options: { outDir: string }) => Promise<string>;
    verifyDist?: (options: { dist: string }) => Promise<string>;
    verifyDemo?: (options: { baseUrl: string }) => Promise<string>;
    verifyAssets?: (options: { baseUrl: string; dist: string }) => Promise<string>;
    logger?: (message: string) => void;
  }): Promise<{ baseUrl: string; server: Server }>;
};

async function loadLocalDemoModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-local-demo.mjs")) as LocalDemoModule;
}

async function loadServeLocalDemoModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/serve-local-demo.mjs")) as ServeLocalDemoModule;
}

const tempDirs: string[] = [];
const servers: Server[] = [];

async function makeDemoDist() {
  const dist = await mkdtemp(join(tmpdir(), "zkgl-demo-"));
  tempDirs.push(dist);
  await writeFile(
    join(dist, "index.html"),
    '<!doctype html><html><head><title>众肯项目管理系统</title><link rel="stylesheet" href="/assets/index.css"></head><body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>',
    "utf8",
  );
  await mkdir(join(dist, "assets"));
  await writeFile(join(dist, "assets", "index.js"), "console.log('demo');", "utf8");
  await writeFile(join(dist, "assets", "index.css"), "body{display:block}", "utf8");
  return dist;
}

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unexpected server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("local demo verifier script", () => {
  it("builds the web bundle with explicit demo mode into a temporary directory", async () => {
    const { localDemoBuildCommand } = await loadLocalDemoModule();
    const build = localDemoBuildCommand({ outDir: "C:/tmp/zkgl-local-demo" });

    expect(build.command).toMatch(/^npm(?:\.cmd)?$/);
    expect(build.args).toEqual([
      "run",
      "build",
      "-w",
      "@zkgl/web",
      "--",
      "--outDir",
      "C:/tmp/zkgl-local-demo",
      "--emptyOutDir",
    ]);
    expect(build.env.VITE_DEMO_MODE).toBe("true");
    expect(build.env.VITE_API_BASE_URL).toBe("");
  });

  it("serves the built SPA shell for deep demo routes", async () => {
    const { createDemoStaticServer } = await loadLocalDemoModule();
    const dist = await makeDemoDist();
    const baseUrl = await listen(createDemoStaticServer({ dist }));

    const response = await fetch(`${baseUrl}/projects`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>众肯项目管理系统</title>");
    expect(html).toContain('<div id="app"></div>');
  });

  it("collects and verifies every local demo build asset through HTTP", async () => {
    const { collectLocalDemoAssetRoutes, createDemoStaticServer, verifyLocalDemoAssets } =
      await loadLocalDemoModule();
    const dist = await makeDemoDist();
    const baseUrl = await listen(createDemoStaticServer({ dist }));

    await expect(collectLocalDemoAssetRoutes({ dist })).resolves.toEqual([
      "/assets/index.css",
      "/assets/index.js",
      "/index.html",
    ]);
    await expect(verifyLocalDemoAssets({ baseUrl, dist })).resolves.toBe(
      "Local demo assets verified: 3 files",
    );
  });

  it("rejects empty local demo assets served through HTTP", async () => {
    const { createDemoStaticServer, verifyLocalDemoAssets } =
      await loadLocalDemoModule();
    const dist = await makeDemoDist();
    await writeFile(join(dist, "assets", "empty.js"), "", "utf8");
    const baseUrl = await listen(createDemoStaticServer({ dist }));

    await expect(verifyLocalDemoAssets({ baseUrl, dist })).rejects.toThrow(
      "Local demo asset /assets/empty.js is empty",
    );
  });

  it("runs build, dist security, and route verification as one local demo gate", async () => {
    const { verifyLocalDemo } = await loadLocalDemoModule();
    const dist = await makeDemoDist();
    const buildDemo = vi.fn(async (_options: { outDir: string }) => dist);
    const verifyDist = vi.fn(async (_options: { dist: string }) =>
      "Web dist security verified",
    );
    const verifyDemo = vi.fn(async (_options: { baseUrl: string }) =>
      "Public demo verified",
    );
    const verifyAssets = vi.fn(
      async (_options: { baseUrl: string; dist: string }) =>
        "Local demo assets verified",
    );

    await expect(
      verifyLocalDemo({
        outDir: dist,
        buildDemo,
        verifyDist,
        verifyDemo,
        verifyAssets,
      }),
    ).resolves.toMatch(/^Local demo verified: http:\/\/127\.0\.0\.1:/);
    expect(buildDemo).toHaveBeenCalledWith({ outDir: dist });
    expect(verifyDist).toHaveBeenCalledWith({ dist });
    const [firstVerifyDemoCall] = verifyDemo.mock.calls;
    expect(firstVerifyDemoCall).toBeDefined();
    expect(firstVerifyDemoCall![0].baseUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/$/,
    );
    expect(verifyAssets).toHaveBeenCalledWith({
      baseUrl: firstVerifyDemoCall![0].baseUrl,
      dist,
    });
  });

  it("builds, verifies, and keeps a local visual demo server open", async () => {
    const { serveLocalDemo } = await loadServeLocalDemoModule();
    const dist = await makeDemoDist();
    const buildDemo = vi.fn(async (_options: { outDir: string }) => dist);
    const verifyDist = vi.fn(async (_options: { dist: string }) =>
      "Web dist security verified",
    );
    const verifyDemo = vi.fn(async (_options: { baseUrl: string }) =>
      "Public demo verified",
    );
    const verifyAssets = vi.fn(
      async (_options: { baseUrl: string; dist: string }) =>
        "Local demo assets verified",
    );
    const logger = vi.fn();

    const { baseUrl, server } = await serveLocalDemo({
      host: "127.0.0.1",
      port: 0,
      outDir: dist,
      buildDemo,
      verifyDist,
      verifyDemo,
      verifyAssets,
      logger,
    });
    servers.push(server);

    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(baseUrl).not.toBe("http://127.0.0.1:0/");
    await expect(fetch(`${baseUrl}admin`)).resolves.toMatchObject({
      status: 200,
    });
    expect(buildDemo).toHaveBeenCalledWith({ outDir: dist });
    expect(verifyDist).toHaveBeenCalledWith({ dist });
    expect(verifyDemo).toHaveBeenCalledWith({ baseUrl });
    expect(verifyAssets).toHaveBeenCalledWith({ baseUrl, dist });
    expect(logger).toHaveBeenCalledWith(`Local demo ready: ${baseUrl}`);
  });

  it("falls back to a free local port when the default demo port is already used", async () => {
    const { serveLocalDemo } = await loadServeLocalDemoModule();
    const dist = await makeDemoDist();
    const blockingServer = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("busy");
    });
    const blockingBaseUrl = await listen(blockingServer);
    const occupiedPort = Number(new URL(blockingBaseUrl).port);
    const logger = vi.fn();

    const { baseUrl, server } = await serveLocalDemo({
      host: "127.0.0.1",
      port: occupiedPort,
      strictPort: false,
      outDir: dist,
      buildDemo: vi.fn(async (_options: { outDir: string }) => dist),
      verifyDist: vi.fn(async (_options: { dist: string }) =>
        "Web dist security verified",
      ),
      verifyDemo: vi.fn(async (_options: { baseUrl: string }) =>
        "Public demo verified",
      ),
      verifyAssets: vi.fn(
        async (_options: { baseUrl: string; dist: string }) =>
          "Local demo assets verified",
      ),
      logger,
    });
    servers.push(server);

    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(new URL(baseUrl).port).not.toBe(String(occupiedPort));
    expect(logger).toHaveBeenCalledWith(
      `Local demo port ${occupiedPort} is already in use; trying a free local port.`,
    );
    expect(logger).toHaveBeenCalledWith(`Local demo ready: ${baseUrl}`);
  });

  it("keeps an explicitly requested local demo port strict", async () => {
    const { serveLocalDemo } = await loadServeLocalDemoModule();
    const dist = await makeDemoDist();
    const blockingServer = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("busy");
    });
    const blockingBaseUrl = await listen(blockingServer);
    const occupiedPort = Number(new URL(blockingBaseUrl).port);

    await expect(
      serveLocalDemo({
        host: "127.0.0.1",
        port: occupiedPort,
        strictPort: true,
        outDir: dist,
        buildDemo: vi.fn(async (_options: { outDir: string }) => dist),
        verifyDist: vi.fn(async (_options: { dist: string }) =>
          "Web dist security verified",
        ),
        logger: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
