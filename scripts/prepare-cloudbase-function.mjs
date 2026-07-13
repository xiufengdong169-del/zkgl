import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "apps/api/dist");
const target = resolve(root, "functions/zkgl-api");
const reminderTarget = resolve(root, "functions/zkgl-reminder");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, resolve(target, "dist"), { recursive: true });
await rm(reminderTarget, { recursive: true, force: true });
await mkdir(reminderTarget, { recursive: true });
await cp(source, resolve(reminderTarget, "dist"), { recursive: true });
await writeFile(
  resolve(target, "index.js"),
  "export { main } from './dist/cloud-function.js'\n",
  "utf8",
);
await writeFile(
  resolve(target, "package.json"),
  JSON.stringify(
    {
      name: "zkgl-api-cloud-function",
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
await writeFile(
  resolve(reminderTarget, "index.js"),
  "export { main } from './dist/scheduled-reminder.js'\n",
  "utf8",
);
await writeFile(
  resolve(reminderTarget, "package.json"),
  JSON.stringify(
    {
      name: "zkgl-reminder-cloud-function",
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

console.log(`CloudBase function package prepared: ${target}`);
console.log(`CloudBase reminder package prepared: ${reminderTarget}`);
