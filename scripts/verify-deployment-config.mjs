import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");
export const expected = {
  cloudbaseEnvId: "cloudbase-d7gc2b32cd4196059",
  cloudbaseRegion: "ap-guangzhou",
  serverPublicIp: "193.112.79.220",
  serverRegion: "guangzhou",
  serverOs: "Ubuntu 24.04",
  serverMysql: "8.0",
  apiHost: "127.0.0.1",
  apiPort: "3000",
  authAdapterHost: "127.0.0.1",
  authAdapterPort: "3010",
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

export const browserVariables = [
  "VITE_CLOUDBASE_ENV_ID",
  "VITE_CLOUDBASE_REGION",
  "VITE_CLOUDBASE_PUBLISHABLE_KEY",
  "VITE_API_BASE_URL",
  "VITE_DEMO_MODE",
  "VITE_ALLOW_LOCAL_HTTP_API",
];
export const serverVariables = [
  "DEPLOY_TARGET_HOST",
  "DEPLOY_TARGET_REGION",
  "DEPLOY_TARGET_OS",
  "DEPLOY_TARGET_MYSQL",
  "API_HOST",
  "API_PORT",
  "API_ALLOWED_ORIGINS",
  "AUTH_ADAPTER_HOST",
  "AUTH_ADAPTER_PORT",
  "AUTH_TOKEN_VERIFIER_MODULE",
  "AUTH_TRUSTED_PROXY",
  "BACKUP_MYSQL_DIR",
  "BACKUP_RETENTION_DAYS",
  "RESTORE_BACKUP_FILE",
  "RESTORE_DB_NAME",
  "RESTORE_CONFIRM",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "CLOUDBASE_ENV_ID",
];
export const forbiddenWorkflowFragments = [
  "tcb ",
  "cloudbase",
  "deploy",
  "secrets.",
  "contents: write",
];

const fail = (message) => {
  throw new Error(`Deployment config verification failed: ${message}`);
};
export const envValue = (source, key) => {
  const match = source.match(new RegExp(`^${key}=([^\\r\\n]*)`, "m"));
  return match?.[1]?.trim();
};
export const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

export async function readDeploymentInputs(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const readJson = async (path) => JSON.parse(await readText(path));
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
  return {
    cloudbaseConfig,
    envExample,
    webEnvTypes,
    packageJson,
    workflow,
    deploymentDoc,
    finalChecklist,
  };
}

export function verifyDeploymentConfigInputs({
  cloudbaseConfig,
  envExample,
  webEnvTypes,
  packageJson,
  workflow,
  deploymentDoc,
  finalChecklist,
  expectedConfig = expected,
} = {}) {
  if (cloudbaseConfig.envId !== expectedConfig.cloudbaseEnvId) {
    fail(`cloudbaserc.json envId must be ${expectedConfig.cloudbaseEnvId}`);
  }
  if (envValue(envExample, "VITE_CLOUDBASE_ENV_ID") !== expectedConfig.cloudbaseEnvId) {
    fail(".env.example VITE_CLOUDBASE_ENV_ID mismatch");
  }
  if (envValue(envExample, "CLOUDBASE_ENV_ID") !== expectedConfig.cloudbaseEnvId) {
    fail(".env.example CLOUDBASE_ENV_ID mismatch");
  }
  if (envValue(envExample, "VITE_CLOUDBASE_REGION") !== expectedConfig.cloudbaseRegion) {
    fail(".env.example VITE_CLOUDBASE_REGION mismatch");
  }
  includesAll(
    deploymentDoc,
    [expectedConfig.cloudbaseEnvId, expectedConfig.cloudbaseRegion],
    "docs/deployment.md",
  );
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
  if (envValue(envExample, "VITE_ALLOW_LOCAL_HTTP_API")) {
    fail(".env.example VITE_ALLOW_LOCAL_HTTP_API must stay blank unless a local-only run explicitly enables it");
  }
  if (envValue(envExample, "DEPLOY_TARGET_HOST") !== expectedConfig.serverPublicIp) {
    fail(".env.example DEPLOY_TARGET_HOST mismatch");
  }
  if (envValue(envExample, "DEPLOY_TARGET_REGION") !== expectedConfig.serverRegion) {
    fail(".env.example DEPLOY_TARGET_REGION mismatch");
  }
  if (envValue(envExample, "DEPLOY_TARGET_OS") !== expectedConfig.serverOs) {
    fail(".env.example DEPLOY_TARGET_OS mismatch");
  }
  if (envValue(envExample, "DEPLOY_TARGET_MYSQL") !== expectedConfig.serverMysql) {
    fail(".env.example DEPLOY_TARGET_MYSQL mismatch");
  }
  if (envValue(envExample, "API_HOST") !== expectedConfig.apiHost) {
    fail(".env.example API_HOST mismatch");
  }
  if (envValue(envExample, "API_PORT") !== expectedConfig.apiPort) {
    fail(".env.example API_PORT mismatch");
  }
  if (envValue(envExample, "AUTH_ADAPTER_HOST") !== expectedConfig.authAdapterHost) {
    fail(".env.example AUTH_ADAPTER_HOST mismatch");
  }
  if (envValue(envExample, "AUTH_ADAPTER_PORT") !== expectedConfig.authAdapterPort) {
    fail(".env.example AUTH_ADAPTER_PORT mismatch");
  }
  if (envValue(envExample, "AUTH_TOKEN_VERIFIER_MODULE")) {
    fail(".env.example AUTH_TOKEN_VERIFIER_MODULE must stay blank");
  }
  if (envValue(envExample, "AUTH_TRUSTED_PROXY") !== "false") {
    fail(".env.example AUTH_TRUSTED_PROXY must default to false");
  }
  if (envValue(envExample, "BACKUP_MYSQL_DIR") !== "/var/backups/zkgl/mysql") {
    fail(".env.example BACKUP_MYSQL_DIR mismatch");
  }
  if (envValue(envExample, "BACKUP_RETENTION_DAYS") !== "30") {
    fail(".env.example BACKUP_RETENTION_DAYS mismatch");
  }
  for (const restoreVariable of [
    "RESTORE_BACKUP_FILE",
    "RESTORE_DB_NAME",
    "RESTORE_CONFIRM",
  ]) {
    if (envValue(envExample, restoreVariable)) {
      fail(`.env.example ${restoreVariable} must stay blank`);
    }
  }
  includesAll(
    deploymentDoc,
    [
      expectedConfig.serverPublicIp,
      expectedConfig.serverOs,
      `MySQL ${expectedConfig.serverMysql}`,
      "Tencent Cloud Lighthouse",
      "systemd",
      "Nginx",
      "npm run start -w @zkgl/api",
    ],
    "docs/deployment.md",
  );
  includesAll(
    finalChecklist,
    [
      expectedConfig.serverPublicIp,
      expectedConfig.serverOs,
      `MySQL ${expectedConfig.serverMysql}`,
      "systemd",
      "Nginx",
    ],
    "docs/final-acceptance-checklist.md",
  );

  if (cloudbaseConfig.functionRoot !== "./functions") {
    fail("cloudbaserc.json functionRoot must be ./functions");
  }
  const actualFunctions = new Map(
    (cloudbaseConfig.functions ?? []).map((item) => [item.name, item]),
  );
  const actualNames = [...actualFunctions.keys()].sort();
  const expectedNames = expectedConfig.functions.map((item) => item.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail("cloudbaserc.json function names do not match expected deployment set");
  }
  for (const fn of expectedConfig.functions) {
    const actual = actualFunctions.get(fn.name);
    if (!actual) fail(`cloudbaserc.json missing ${fn.name}`);
    if (actual.dir !== fn.dir) fail(`${fn.name} dir mismatch`);
    if (actual.runtime !== "Nodejs18.15")
      fail(`${fn.name} runtime must be Nodejs18.15`);
    if (actual.handler !== "index.main")
      fail(`${fn.name} handler must be index.main`);
    if (actual.timeout !== fn.timeout) fail(`${fn.name} timeout mismatch`);
    if (actual.memorySize !== fn.memorySize)
      fail(`${fn.name} memorySize mismatch`);
    if (actual.installDependency !== true)
      fail(`${fn.name} installDependency must be true`);
    const triggers = actual.triggers ?? [];
    if (JSON.stringify(triggers) !== JSON.stringify(fn.triggers)) {
      fail(`${fn.name} trigger configuration mismatch`);
    }
  }

  if (packageJson.engines?.node !== `>=${expectedConfig.nodeVersion}`) {
    fail(`package.json engines.node must be >=${expectedConfig.nodeVersion}`);
  }
  if (!workflow.includes(`node-version: "${expectedConfig.nodeVersion}"`)) {
    fail(`GitHub workflow must use Node.js ${expectedConfig.nodeVersion}`);
  }
  if (!workflow.includes("permissions:") || !workflow.includes("contents: read")) {
    fail("GitHub workflow must use read-only contents permission");
  }
  for (const fragment of forbiddenWorkflowFragments) {
    if (workflow.includes(fragment)) {
      fail(`GitHub workflow must not include deployment or secret fragment ${fragment}`);
    }
  }
  if (packageJson.scripts?.["verify:deployment-config"] !== "node scripts/verify-deployment-config.mjs") {
    fail("package.json missing verify:deployment-config script");
  }
  if (
    packageJson.scripts?.["verify:performance-acceptance"] !==
    "node scripts/verify-performance-acceptance-assets.mjs"
  ) {
    fail("package.json missing verify:performance-acceptance script");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:deployment-config")) {
    fail("package.json verify must run verify:deployment-config");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:performance-acceptance")) {
    fail("package.json verify must run verify:performance-acceptance");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:local-demo")) {
    fail("package.json verify must run verify:local-demo");
  }
  if (
    packageJson.scripts?.["verify:object-restore"] !==
    "node scripts/verify-object-restore-manifest.mjs"
  ) {
    fail("package.json missing verify:object-restore script");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:object-restore")) {
    fail("package.json verify must run verify:object-restore");
  }
  if (
    packageJson.scripts?.["verify:initialization-data"] !==
    "node scripts/verify-initialization-data.mjs"
  ) {
    fail("package.json missing verify:initialization-data script");
  }
  if (!packageJson.scripts?.verify?.includes("npm run verify:initialization-data")) {
    fail("package.json verify must run verify:initialization-data");
  }
  if (
    packageJson.scripts?.verify?.includes("npm run build:function") ||
    packageJson.scripts?.verify?.includes("verify-cloudbase-function-packages")
  ) {
    fail("package.json verify must stay focused on the Lighthouse server acceptance path");
  }
  if (
    packageJson.scripts?.["verify:legacy-cloudbase"] !==
    "npm run build:function && node scripts/verify-cloudbase-function-packages.mjs"
  ) {
    fail("package.json missing verify:legacy-cloudbase script for historical assets");
  }
  if (packageJson.scripts?.["verify:local-demo"] !== "node scripts/verify-local-demo.mjs") {
    fail("package.json missing verify:local-demo script for local visual demo checks");
  }
  if (packageJson.scripts?.["demo:local"] !== "node scripts/serve-local-demo.mjs") {
    fail("package.json missing demo:local script for persistent local visual demo access");
  }
  includesAll(
    deploymentDoc,
    [
      "npm run demo:local",
      "http://127.0.0.1:4173/",
      "不连接生产 MySQL",
      "不会访问远程服务器",
    ],
    "docs/deployment.md",
  );
  includesAll(
    finalChecklist,
    ["npm run demo:local", "http://127.0.0.1:4173/"],
    "docs/final-acceptance-checklist.md",
  );

  return "Deployment config verified";
}

export async function verifyDeploymentConfig({ root = defaultRoot } = {}) {
  return verifyDeploymentConfigInputs(await readDeploymentInputs(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyDeploymentConfig());
}
