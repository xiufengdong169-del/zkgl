import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const packages = [
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

const fail = (message) => {
  throw new Error(`CloudBase function package verification failed: ${message}`);
};

for (const pkg of packages) {
  const target = resolve(root, pkg.target);
  const indexPath = resolve(target, "index.js");
  const packagePath = resolve(target, "package.json");
  const entryPath = resolve(target, "dist", pkg.entry);

  if (!existsSync(target)) fail(`${pkg.target} directory is missing`);
  if (!existsSync(entryPath)) fail(`${pkg.target}/dist/${pkg.entry} is missing`);

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
}

console.log("CloudBase function packages verified");
