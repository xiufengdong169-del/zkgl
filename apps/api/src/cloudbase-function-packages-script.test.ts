import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type FunctionPackage = {
  target: string;
  entry: string;
  name: string;
  functionName: string;
  timeout: number;
  memorySize: number;
  trigger?: { name: string; type: string; config: string };
};

type CloudbaseFunctionPackagesModule = {
  verifyCloudbaseFunctionPackages(options?: {
    root?: string;
    expectedPackages?: FunctionPackage[];
    cloudbaseConfig?: unknown;
  }): Promise<string>;
};

const packageFixture: FunctionPackage = {
  target: "functions/zkgl-reminder",
  entry: "scheduled-reminder.js",
  name: "zkgl-reminder-cloud-function",
  functionName: "zkgl-reminder",
  timeout: 60,
  memorySize: 256,
  trigger: {
    name: "zkglDailyReminder",
    type: "timer",
    config: "0 0 8 * * * *",
  },
};

const validConfig = {
  functionRoot: "./functions",
  functions: [
    {
      name: packageFixture.functionName,
      dir: "./zkgl-reminder",
      handler: "index.main",
      runtime: "Nodejs18.15",
      timeout: packageFixture.timeout,
      memorySize: packageFixture.memorySize,
      installDependency: true,
      triggers: [packageFixture.trigger],
    },
  ],
};

async function loadCloudbaseFunctionPackagesModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-cloudbase-function-packages.mjs")) as CloudbaseFunctionPackagesModule;
}

async function withTempRoot<T>(work: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "zkgl-function-package-"));
  try {
    return await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writePackageFixture(root: string, source = "export const main = () => {};") {
  const target = join(root, packageFixture.target);
  await mkdir(join(target, "dist"), { recursive: true });
  await writeFile(
    join(target, "index.js"),
    `export { main } from './dist/${packageFixture.entry}'\n`,
  );
  await writeFile(join(target, "dist", packageFixture.entry), source);
  await writeFile(
    join(target, "package.json"),
    JSON.stringify(
      {
        name: packageFixture.name,
        type: "module",
        main: "index.js",
        dependencies: {
          "@cloudbase/node-sdk": "^4.0.3",
          mysql2: "^3.15.3",
          zod: "^4.4.3",
        },
      },
      null,
      2,
    ),
  );
}

describe("cloudbase function package verifier script", () => {
  it("accepts a package whose generated files and CloudBase config are aligned", async () => {
    const { verifyCloudbaseFunctionPackages } =
      await loadCloudbaseFunctionPackagesModule();

    await withTempRoot(async (root) => {
      await writePackageFixture(root);

      await expect(
        verifyCloudbaseFunctionPackages({
          root,
          expectedPackages: [packageFixture],
          cloudbaseConfig: validConfig,
        }),
      ).resolves.toBe("CloudBase function packages verified");
    });
  });

  it("rejects unresolved workspace imports and source map references in dist files", async () => {
    const { verifyCloudbaseFunctionPackages } =
      await loadCloudbaseFunctionPackagesModule();

    await withTempRoot(async (root) => {
      await writePackageFixture(root, "import '@zkgl/shared';");

      await expect(
        verifyCloudbaseFunctionPackages({
          root,
          expectedPackages: [packageFixture],
          cloudbaseConfig: validConfig,
        }),
      ).rejects.toThrow("unresolved workspace package import");
    });

    await withTempRoot(async (root) => {
      await writePackageFixture(root, "//# sourceMappingURL=scheduled-reminder.js.map");

      await expect(
        verifyCloudbaseFunctionPackages({
          root,
          expectedPackages: [packageFixture],
          cloudbaseConfig: validConfig,
        }),
      ).rejects.toThrow("source map reference");
    });
  });

  it("rejects CloudBase trigger drift for scheduled function packages", async () => {
    const { verifyCloudbaseFunctionPackages } =
      await loadCloudbaseFunctionPackagesModule();

    await withTempRoot(async (root) => {
      await writePackageFixture(root);
      const driftedConfig = structuredClone(validConfig);
      driftedConfig.functions[0]!.triggers[0]!.config = "0 0 9 * * * *";

      await expect(
        verifyCloudbaseFunctionPackages({
          root,
          expectedPackages: [packageFixture],
          cloudbaseConfig: driftedConfig,
        }),
      ).rejects.toThrow("trigger config mismatch");
    });
  });
});
