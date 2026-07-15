import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cloudbaseConfig = JSON.parse(
  await readFile(resolve(root, "cloudbaserc.json"), "utf8"),
);

const packages = [
  {
    target: "functions/zkgl-api",
    entry: "cloud-function.js",
    name: "zkgl-api-cloud-function",
    functionName: "zkgl-api",
    timeout: 20,
    memorySize: 512,
  },
  {
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
  },
  {
    target: "functions/zkgl-export-worker",
    entry: "scheduled-export.js",
    name: "zkgl-export-worker-cloud-function",
    functionName: "zkgl-export-worker",
    timeout: 300,
    memorySize: 512,
    trigger: {
      name: "zkglExportWorker",
      type: "timer",
      config: "0 */5 * * * * *",
    },
  },
];

const fail = (message) => {
  throw new Error(`CloudBase function package verification failed: ${message}`);
};

if (cloudbaseConfig.functionRoot !== "./functions")
  fail("cloudbaserc.json functionRoot must be ./functions");

const configuredFunctions = new Map(
  (cloudbaseConfig.functions ?? []).map((item) => [item.name, item]),
);
const expectedFunctionNames = packages.map((pkg) => pkg.functionName).sort();
if (
  JSON.stringify([...configuredFunctions.keys()].sort()) !==
  JSON.stringify(expectedFunctionNames)
) {
  fail("cloudbaserc.json functions do not match generated package set");
}

for (const pkg of packages) {
  const target = resolve(root, pkg.target);
  const indexPath = resolve(target, "index.js");
  const packagePath = resolve(target, "package.json");
  const entryPath = resolve(target, "dist", pkg.entry);
  const config = configuredFunctions.get(pkg.functionName);

  if (!existsSync(target)) fail(`${pkg.target} directory is missing`);
  if (!existsSync(entryPath)) fail(`${pkg.target}/dist/${pkg.entry} is missing`);
  if (!config) fail(`cloudbaserc.json missing ${pkg.functionName}`);
  if (config.dir !== `./${pkg.target.replace("functions/", "")}`)
    fail(`${pkg.functionName} dir mismatch`);
  if (config.runtime !== "Nodejs18.15")
    fail(`${pkg.functionName} runtime must be Nodejs18.15`);
  if (config.handler !== "index.main")
    fail(`${pkg.functionName} handler must be index.main`);
  if (config.timeout !== pkg.timeout) fail(`${pkg.functionName} timeout mismatch`);
  if (config.memorySize !== pkg.memorySize)
    fail(`${pkg.functionName} memorySize mismatch`);
  if (config.installDependency !== true)
    fail(`${pkg.functionName} must install dependencies during deployment`);

  const indexSource = await readFile(indexPath, "utf8");
  const expectedIndex = `export { main } from './dist/${pkg.entry}'\n`;
  if (indexSource !== expectedIndex)
    fail(`${pkg.target}/index.js does not export ${pkg.entry}`);

  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  if (manifest.name !== pkg.name)
    fail(`${pkg.target}/package.json name mismatch`);
  if (manifest.type !== "module")
    fail(`${pkg.target}/package.json must use ESM`);
  if (manifest.main !== "index.js")
    fail(`${pkg.target}/package.json main must be index.js`);
  for (const dependency of ["@cloudbase/node-sdk", "mysql2", "zod"]) {
    if (!manifest.dependencies?.[dependency])
      fail(`${pkg.target}/package.json missing dependency ${dependency}`);
  }

  if (pkg.trigger) {
    const triggers = config.triggers ?? [];
    if (triggers.length !== 1) fail(`${pkg.functionName} trigger mismatch`);
    const [trigger] = triggers;
    for (const [key, value] of Object.entries(pkg.trigger)) {
      if (trigger?.[key] !== value)
        fail(`${pkg.functionName} trigger ${key} mismatch`);
    }
  } else if ((config.triggers ?? []).length) {
    fail(`${pkg.functionName} must not define timer triggers`);
  }
}

console.log("CloudBase function packages verified");
