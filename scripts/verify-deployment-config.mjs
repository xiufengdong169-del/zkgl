import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expected = {
  cloudbaseEnvId: "cloudbase-d7gc2b32cd4196059",
  cloudbaseRegion: "ap-guangzhou",
  nodeVersion: "22.12.0",
  functions: [
    {
      name: "zkgl-api",
      dir: "./zkgl-api",
      timeout: 20,
      memorySize: 512,
      triggers: [],
    },
    {
      name: "zkgl-reminder",
      dir: "./zkgl-reminder",
      timeout: 60,
      memorySize: 256,
      triggers: [
        { name: "zkglDailyReminder", type: "timer", config: "0 0 8 * * * *" },
      ],
    },
    {
      name: "zkgl-export-worker",
      dir: "./zkgl-export-worker",
      timeout: 300,
      memorySize: 512,
      triggers: [
        { name: "zkglExportWorker", type: "timer", config: "0 */5 * * * * *" },
      ],
    },
  ],
};

const browserVariables = [
  "VITE_CLOUDBASE_ENV_ID",
  "VITE_CLOUDBASE_REGION",
  "VITE_CLOUDBASE_PUBLISHABLE_KEY",
  "VITE_API_BASE_URL",
];
const serverVariables = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "CLOUDBASE_ENV_ID",
];

const fail = (message) => {
  throw new Error(`Deployment config verification failed: ${message}`);
};
const readText = (path) => readFile(resolve(root, path), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));
const envValue = (source, key) => {
  const match = source.match(new RegExp(`^${key}=([^\\r\\n]*)`, "m"));
  return match?.[1]?.trim();
};
const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

const [
  cloudbaseConfig,
  envExample,
  webEnvTypes,
  packageJson,
  workflow,
  deploymentDoc,
  finalChecklist,
] = await Promise.all([
  readJson("cloudbaserc.json"),
  readText(".env.example"),
  readText("apps/web/src/env.d.ts"),
  readJson("package.json"),
  readText(".github/workflows/verify.yml"),
  readText("docs/deployment.md"),
  readText("docs/final-acceptance-checklist.md"),
]);

if (cloudbaseConfig.envId !== expected.cloudbaseEnvId) {
  fail(`cloudbaserc.json envId must be ${expected.cloudbaseEnvId}`);
}
if (envValue(envExample, "VITE_CLOUDBASE_ENV_ID") !== expected.cloudbaseEnvId) {
  fail(".env.example VITE_CLOUDBASE_ENV_ID mismatch");
}
if (envValue(envExample, "CLOUDBASE_ENV_ID") !== expected.cloudbaseEnvId) {
  fail(".env.example CLOUDBASE_ENV_ID mismatch");
}
if (envValue(envExample, "VITE_CLOUDBASE_REGION") !== expected.cloudbaseRegion) {
  fail(".env.example VITE_CLOUDBASE_REGION mismatch");
}
includesAll(deploymentDoc, [expected.cloudbaseEnvId, expected.cloudbaseRegion], "docs/deployment.md");
includesAll(finalChecklist, [expected.cloudbaseEnvId], "docs/final-acceptance-checklist.md");

for (const variable of browserVariables) {
  if (!new RegExp(`^${variable}=`, "m").test(envExample)) {
    fail(`.env.example missing browser variable ${variable}`);
  }
  if (!new RegExp(`readonly\\s+${variable}\\??:`).test(webEnvTypes)) {
    fail(`apps/web/src/env.d.ts missing browser variable ${variable}`);
  }
}
for (const variable of serverVariables) {
  if (!new RegExp(`^${variable}=`, "m").test(envExample)) {
    fail(`.env.example missing server variable ${variable}`);
  }
  if (new RegExp(`readonly\\s+${variable}\\??:`).test(webEnvTypes)) {
    fail(`apps/web/src/env.d.ts exposes server-only variable ${variable}`);
  }
}
if (envValue(envExample, "DB_PASSWORD")) {
  fail(".env.example must not contain a real DB_PASSWORD value");
}
if (envValue(envExample, "VITE_API_BASE_URL")) {
  fail(".env.example VITE_API_BASE_URL must stay blank until the deployed API URL is known");
}

if (cloudbaseConfig.functionRoot !== "./functions") {
  fail("cloudbaserc.json functionRoot must be ./functions");
}
const actualFunctions = new Map(
  (cloudbaseConfig.functions ?? []).map((item) => [item.name, item]),
);
const actualNames = [...actualFunctions.keys()].sort();
const expectedNames = expected.functions.map((item) => item.name).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  fail("cloudbaserc.json function names do not match expected deployment set");
}
for (const fn of expected.functions) {
  const actual = actualFunctions.get(fn.name);
  if (!actual) fail(`cloudbaserc.json missing ${fn.name}`);
  if (actual.dir !== fn.dir) fail(`${fn.name} dir mismatch`);
  if (actual.runtime !== "Nodejs18.15") fail(`${fn.name} runtime must be Nodejs18.15`);
  if (actual.handler !== "index.main") fail(`${fn.name} handler must be index.main`);
  if (actual.timeout !== fn.timeout) fail(`${fn.name} timeout mismatch`);
  if (actual.memorySize !== fn.memorySize) fail(`${fn.name} memorySize mismatch`);
  if (actual.installDependency !== true) fail(`${fn.name} installDependency must be true`);
  const triggers = actual.triggers ?? [];
  if (JSON.stringify(triggers) !== JSON.stringify(fn.triggers)) {
    fail(`${fn.name} trigger configuration mismatch`);
  }
}

if (packageJson.engines?.node !== `>=${expected.nodeVersion}`) {
  fail(`package.json engines.node must be >=${expected.nodeVersion}`);
}
if (!workflow.includes(`node-version: "${expected.nodeVersion}"`)) {
  fail(`GitHub workflow must use Node.js ${expected.nodeVersion}`);
}
if (!workflow.includes("permissions:") || !workflow.includes("contents: read")) {
  fail("GitHub workflow must use read-only contents permission");
}
if (packageJson.scripts?.["verify:deployment-config"] !== "node scripts/verify-deployment-config.mjs") {
  fail("package.json missing verify:deployment-config script");
}
if (!packageJson.scripts?.verify?.includes("npm run verify:deployment-config")) {
  fail("package.json verify must run verify:deployment-config");
}

console.log("Deployment config verified");
