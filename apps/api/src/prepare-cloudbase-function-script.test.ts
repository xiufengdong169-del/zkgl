import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type PrepareCloudbaseFunctionModule = {
  createPackageManifest(name: string): {
    name: string;
    private: boolean;
    type: string;
    main: string;
    engines: { node: string };
    dependencies: Record<string, string>;
    overrides: Record<string, Record<string, string>>;
  };
  prepareCloudbaseFunctionPackages(options?: {
    root?: string;
    source?: string;
    expectedPackages?: Array<{ target: string; entry: string; name: string }>;
    log?: (message: string) => void;
  }): Promise<string[]>;
};

async function loadPrepareCloudbaseFunctionModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/prepare-cloudbase-function.mjs")) as PrepareCloudbaseFunctionModule;
}

async function withTempRoot<T>(work: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "zkgl-prepare-function-"));
  try {
    return await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("prepare cloudbase function package script", () => {
  it("creates deployment manifests with runtime dependencies and CloudBase axios override", async () => {
    const { createPackageManifest } = await loadPrepareCloudbaseFunctionModule();

    expect(createPackageManifest("zkgl-api-cloud-function")).toMatchObject({
      name: "zkgl-api-cloud-function",
      private: true,
      type: "module",
      main: "index.js",
      engines: { node: ">=18.15.0" },
      dependencies: {
        "@cloudbase/node-sdk": "^4.0.3",
        mysql2: "^3.15.3",
        zod: "^4.4.3",
      },
      overrides: { "@cloudbase/node-sdk": { axios: "^1.12.2" } },
    });
  });

  it("cleans stale package content, copies dist, and writes the correct entrypoint", async () => {
    const { prepareCloudbaseFunctionPackages } =
      await loadPrepareCloudbaseFunctionModule();

    await withTempRoot(async (root) => {
      const source = join(root, "apps", "api", "dist");
      const target = join(root, "functions", "zkgl-api");
      await mkdir(source, { recursive: true });
      await mkdir(join(target, "old"), { recursive: true });
      await writeFile(join(source, "cloud-function.js"), "export const main = () => {}; satisfy;");
      await writeFile(join(source, "helper.js"), "export const helper = true;");
      await writeFile(join(target, "old", "stale.txt"), "stale");
      await writeFile(join(target, "stale-root.txt"), "stale");

      const logs: string[] = [];
      const prepared = await prepareCloudbaseFunctionPackages({
        root,
        source,
        expectedPackages: [
          {
            target: "functions/zkgl-api",
            entry: "cloud-function.js",
            name: "zkgl-api-cloud-function",
          },
        ],
        log: (message) => logs.push(message),
      });

      expect(prepared).toEqual([target]);
      expect(logs[0]).toContain("CloudBase function package prepared");
      expect(existsSync(join(target, "stale-root.txt"))).toBe(false);
      expect(existsSync(join(target, "old"))).toBe(false);
      expect(await readFile(join(target, "dist", "cloud-function.js"), "utf8")).toContain(
        "satisfy",
      );
      expect(await readFile(join(target, "dist", "helper.js"), "utf8")).toContain(
        "helper",
      );
      expect(await readFile(join(target, "index.js"), "utf8")).toBe(
        "export { main } from './dist/cloud-function.js'\n",
      );

      const rootEntries = (await readdir(target)).sort();
      expect(rootEntries).toEqual(["dist", "index.js", "package.json"]);
      const manifest = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
      expect(manifest.name).toBe("zkgl-api-cloud-function");
    });
  });
});
