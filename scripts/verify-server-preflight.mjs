import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Server preflight verification failed: ${message}`);
};

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

const requiredFiles = [
  "deploy/systemd/zkgl-api.service",
  "deploy/systemd/zkgl-auth-adapter.service",
  "deploy/systemd/zkgl-reminder.service",
  "deploy/systemd/zkgl-reminder.timer",
  "deploy/systemd/zkgl-export-worker.service",
  "deploy/systemd/zkgl-export-worker.timer",
  "deploy/systemd/zkgl-mysql-backup.service",
  "deploy/systemd/zkgl-mysql-backup.timer",
  "deploy/nginx/zkgl.conf",
  "deploy/auth/cloudbase-token-verifier.example.mjs",
  "scripts/create-mysql-backup.mjs",
  "scripts/restore-mysql-backup.mjs",
  "scripts/verify-server-env.mjs",
  "scripts/verify-server-deployment-assets.mjs",
  "scripts/verify-backup-assets.mjs",
  "database/init/schema.sql",
];
const emptyDatabasePasswordAssignment = "DB_PASSWORD" + "=";

export async function readServerPreflightInputs(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [
    rootPackageJson,
    apiPackageJson,
    envExample,
    deploymentDoc,
    operationsDoc,
    finalChecklist,
    acceptanceTraceabilityDoc,
    gitignore,
  ] = await Promise.all([
    readText("package.json"),
    readText("apps/api/package.json"),
    readText(".env.example"),
    readText("docs/deployment.md"),
    readText("docs/operations-acceptance.md"),
    readText("docs/final-acceptance-checklist.md"),
    readText("docs/acceptance-traceability.md"),
    readText(".gitignore"),
  ]);
  return {
    root,
    rootPackageJson,
    apiPackageJson,
    envExample,
    deploymentDoc,
    operationsDoc,
    finalChecklist,
    acceptanceTraceabilityDoc,
    gitignore,
  };
}

export function verifyServerPreflightInputs({
  root = defaultRoot,
  rootPackageJson,
  apiPackageJson,
  envExample,
  deploymentDoc,
  operationsDoc,
  finalChecklist,
  acceptanceTraceabilityDoc,
  gitignore,
} = {}) {
  const packageConfig = JSON.parse(rootPackageJson ?? "{}");
  const apiPackageConfig = JSON.parse(apiPackageJson ?? "{}");
  const verifyScript = packageConfig.scripts?.verify ?? "";

  for (const file of requiredFiles) {
    if (!existsSync(resolve(root, file))) fail(`required file missing ${file}`);
  }

  includesAll(
    verifyScript,
    [
      "node scripts/verify-server-deployment-assets.mjs",
      "node scripts/verify-backup-assets.mjs",
      "node scripts/verify-server-preflight.mjs",
    ],
    "package.json scripts.verify",
  );
  if (apiPackageConfig.scripts?.start !== "node dist/server.js") {
    fail("apps/api/package.json scripts.start must be node dist/server.js");
  }

  includesAll(
    envExample,
    [
      "DEPLOY_TARGET_HOST=193.112.79.220",
      "DEPLOY_TARGET_REGION=guangzhou",
      "DEPLOY_TARGET_OS=Ubuntu 24.04",
      "DEPLOY_TARGET_MYSQL=8.0",
      "API_HOST=127.0.0.1",
      "API_PORT=3000",
      "AUTH_ADAPTER_HOST=127.0.0.1",
      "AUTH_ADAPTER_PORT=3010",
      "AUTH_TOKEN_VERIFIER_MODULE=",
      "AUTH_TRUSTED_PROXY=false",
      "BACKUP_MYSQL_DIR=/var/backups/zkgl/mysql",
      "BACKUP_RETENTION_DAYS=30",
      "RESTORE_BACKUP_FILE=",
      "RESTORE_DB_NAME=",
      "RESTORE_CONFIRM=",
      emptyDatabasePasswordAssignment,
    ],
    ".env.example",
  );

  for (const [context, source] of [
    ["docs/deployment.md", deploymentDoc],
    ["docs/operations-acceptance.md", operationsDoc],
    ["docs/final-acceptance-checklist.md", finalChecklist],
    ["docs/acceptance-traceability.md", acceptanceTraceabilityDoc],
  ]) {
    includesAll(
      source,
      [
        "193.112.79.220",
        "Ubuntu 24.04",
        "MySQL 8.0",
        "Tencent Cloud Lighthouse",
        "systemd",
        "Nginx",
        "AUTH_TRUSTED_PROXY",
        "AUTH_TOKEN_VERIFIER_MODULE",
        "deploy/auth/cloudbase-token-verifier.example.mjs",
        "scripts/verify-server-env.mjs",
        "scripts/create-mysql-backup.mjs",
        "scripts/restore-mysql-backup.mjs",
        "node scripts/verify-server-preflight.mjs",
      ],
      context,
    );
  }

  includesAll(gitignore, ["backups/"], ".gitignore");
  return "Server preflight verified";
}

export async function verifyServerPreflight({ root = defaultRoot } = {}) {
  return verifyServerPreflightInputs(await readServerPreflightInputs(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyServerPreflight());
}
