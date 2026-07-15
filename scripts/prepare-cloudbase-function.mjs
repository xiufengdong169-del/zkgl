import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "apps/api/dist");

const packages = [
  {
    target: resolve(root, "functions/zkgl-api"),
    entry: "cloud-function.js",
    name: "zkgl-api-cloud-function",
  },
  {
    target: resolve(root, "functions/zkgl-reminder"),
    entry: "scheduled-reminder.js",
    name: "zkgl-reminder-cloud-function",
  },
  {
    target: resolve(root, "functions/zkgl-export-worker"),
    entry: "scheduled-export.js",
    name: "zkgl-export-worker-cloud-function",
  },
];

for (const pkg of packages) {
  await rm(pkg.target, { recursive: true, force: true });
  await mkdir(pkg.target, { recursive: true });
  await cp(source, resolve(pkg.target, "dist"), { recursive: true });
  await writeFile(
    resolve(pkg.target, "index.js"),
    `export { main } from './dist/${pkg.entry}'\n`,
    "utf8",
  );
  await writeFile(
    resolve(pkg.target, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
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
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`CloudBase function package prepared: ${pkg.target}`);
}
