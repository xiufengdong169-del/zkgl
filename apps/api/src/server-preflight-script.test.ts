import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const emptyDatabasePasswordAssignment = "DB_PASSWORD" + "=";

type ServerPreflightModule = {
  verifyServerPreflightInputs(inputs: {
    root: string;
    rootPackageJson: string;
    apiPackageJson: string;
    envExample: string;
    deploymentDoc: string;
    operationsDoc: string;
    finalChecklist: string;
    acceptanceTraceabilityDoc: string;
    gitignore: string;
  }): string;
};

async function loadServerPreflightModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-server-preflight.mjs")) as ServerPreflightModule;
}

function validInputs() {
  const docs = [
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
    "scripts/verify-performance-acceptance-assets.mjs",
    "node scripts/verify-server-preflight.mjs",
  ].join("\n");
  return {
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    rootPackageJson: JSON.stringify({
      scripts: {
        verify: [
          "node scripts/verify-server-deployment-assets.mjs",
          "node scripts/verify-backup-assets.mjs",
          "npm run verify:performance-acceptance",
          "node scripts/verify-server-preflight.mjs",
        ].join(" && "),
      },
    }),
    apiPackageJson: JSON.stringify({
      scripts: { start: "node dist/server.js" },
    }),
    envExample: [
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
    ].join("\n"),
    deploymentDoc: docs,
    operationsDoc: docs,
    finalChecklist: docs,
    acceptanceTraceabilityDoc: docs,
    gitignore: "backups/",
  };
}

describe("server preflight verifier script", () => {
  it("accepts the Tencent Cloud Lighthouse production deployment baseline", async () => {
    const { verifyServerPreflightInputs } = await loadServerPreflightModule();

    expect(verifyServerPreflightInputs(validInputs())).toBe(
      "Server preflight verified",
    );
  });

  it("rejects verification drift that drops the server preflight gate", async () => {
    const { verifyServerPreflightInputs } = await loadServerPreflightModule();
    const inputs = validInputs();
    inputs.rootPackageJson = JSON.stringify({
      scripts: {
        verify:
          "node scripts/verify-server-deployment-assets.mjs && node scripts/verify-backup-assets.mjs && npm run verify:performance-acceptance",
      },
    });

    expect(() => verifyServerPreflightInputs(inputs)).toThrow(
      "package.json scripts.verify missing node scripts/verify-server-preflight.mjs",
    );
  });

  it("rejects unsafe API start command drift", async () => {
    const { verifyServerPreflightInputs } = await loadServerPreflightModule();
    const inputs = validInputs();
    inputs.apiPackageJson = JSON.stringify({
      scripts: { start: "vite --host 0.0.0.0" },
    });

    expect(() => verifyServerPreflightInputs(inputs)).toThrow(
      "apps/api/package.json scripts.start must be node dist/server.js",
    );
  });
});
