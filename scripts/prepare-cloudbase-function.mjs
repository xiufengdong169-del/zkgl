import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

export const packages = [
  {
    target: "functions/zkgl-api",
    entry: "cloud-function.js",
    name: "zkgl-api-cloud-function",
  },
  {
    target: "functions/zkgl-reminder",
    entry: "scheduled-reminder.js",
    name: "zkgl-reminder-cloud-function",
  },
  {
    target: "functions/zkgl-export-worker",
    entry: "scheduled-export.js",
    name: "zkgl-export-worker-cloud-function",
  },
];

export function createPackageManifest(name) {
  return {
    name,
    version: "0.1.0",
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
  };
}

export async function prepareCloudbaseFunctionPackages({
  root = defaultRoot,
  source = resolve(root, "apps/api/dist"),
  expectedPackages = packages,
  log = console.log,
} = {}) {
  const preparedTargets = [];

  for (const pkg of expectedPackages) {
    const target = resolve(root, pkg.target);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(source, resolve(target, "dist"), { recursive: true });
    await writeFile(
      resolve(target, "index.js"),
      `export { main } from './dist/${pkg.entry}'\n`,
      "utf8",
    );
    await writeFile(
      resolve(target, "package.json"),
      JSON.stringify(createPackageManifest(pkg.name), null, 2) + "\n",
      "utf8",
    );
    preparedTargets.push(target);
    log(`CloudBase function package prepared: ${target}`);
  }

  return preparedTargets;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareCloudbaseFunctionPackages();
}
