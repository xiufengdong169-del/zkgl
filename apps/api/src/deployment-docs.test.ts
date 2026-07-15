import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EXPORT_TRIGGER_NAME } from "./scheduled-export.js";
import { REMINDER_TRIGGER_NAME } from "./scheduled-reminder.js";

const deploymentDoc = readFileSync(
  new URL("../../../docs/deployment.md", import.meta.url),
  "utf8",
);
const operationsAcceptanceDoc = readFileSync(
  new URL("../../../docs/operations-acceptance.md", import.meta.url),
  "utf8",
);
const envExample = readFileSync(
  new URL("../../../.env.example", import.meta.url),
  "utf8",
);
const webEnvTypes = readFileSync(
  new URL("../../web/src/env.d.ts", import.meta.url),
  "utf8",
);

const verificationCommands = [
  "npm run verify",
  "npm run typecheck",
  "npm run test",
  "npm run build",
  "node scripts/verify-web-dist-security.mjs",
  "npm run build:function",
  "node scripts/verify-cloudbase-function-packages.mjs",
];
const browserEnvironmentVariables = [
  "VITE_CLOUDBASE_ENV_ID",
  "VITE_CLOUDBASE_REGION",
  "VITE_CLOUDBASE_PUBLISHABLE_KEY",
  "VITE_API_BASE_URL",
];
const serverEnvironmentVariables = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "CLOUDBASE_ENV_ID",
];

describe("deployment documentation", () => {
  it("documents exact CloudBase timer trigger names used by scheduled functions", () => {
    expect(deploymentDoc).toContain(REMINDER_TRIGGER_NAME);
    expect(deploymentDoc).toContain(EXPORT_TRIGGER_NAME);
  });

  it("uses the full verification command before deployment and acceptance", () => {
    expect(deploymentDoc).toContain("npm run verify");
    expect(deploymentDoc).not.toMatch(
      /npm run typecheck\s+npm run test\s+npm run build\s+npm run build:function/,
    );

    for (const command of verificationCommands) {
      expect(operationsAcceptanceDoc).toContain(command);
    }
    for (const doc of [operationsAcceptanceDoc]) {
      expect(doc).not.toMatch(
        /npm run typecheck\s+npm run test\s+npm run build\s+npm run build:function/,
      );
    }
  });

  it("keeps environment variable examples, frontend types, and deployment docs aligned", () => {
    for (const variable of browserEnvironmentVariables) {
      expect(envExample, `.env.example missing ${variable}`).toContain(
        `${variable}=`,
      );
      expect(webEnvTypes, `frontend env type missing ${variable}`).toContain(
        variable,
      );
    }

    for (const variable of serverEnvironmentVariables) {
      expect(envExample, `.env.example missing ${variable}`).toContain(
        `${variable}=`,
      );
      expect(
        deploymentDoc,
        `deployment docs missing server-only variable ${variable}`,
      ).toContain(variable);
    }
    expect(deploymentDoc).toContain("VITE_API_BASE_URL");
  });
});
