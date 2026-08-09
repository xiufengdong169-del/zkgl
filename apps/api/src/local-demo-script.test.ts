import type { Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

type LocalDemoModule = {
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
  }): Promise<string>;
};

async function loadLocalDemoModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-local-demo.mjs")) as LocalDemoModule;
}

const tempDirs: string[] = [];
const servers: Server[] = [];

async function makeDemoDist() {
  const dist = await mkdtemp(join(tmpdir(), "zkgl-demo-"));
  tempDirs.push(dist);
  await writeFile(
    join(dist, "index.html"),
    '<!doctype html><html><head><title>众肯项目管理系统</title></head><body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>',
    "utf8",
  );
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

    await expect(
      verifyLocalDemo({ outDir: dist, buildDemo, verifyDist, verifyDemo }),
    ).resolves.toMatch(/^Local demo verified: http:\/\/127\.0\.0\.1:/);
    expect(buildDemo).toHaveBeenCalledWith({ outDir: dist });
    expect(verifyDist).toHaveBeenCalledWith({ dist });
    const [firstVerifyDemoCall] = verifyDemo.mock.calls;
    expect(firstVerifyDemoCall).toBeDefined();
    expect(firstVerifyDemoCall![0].baseUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/$/,
    );
  });
});
