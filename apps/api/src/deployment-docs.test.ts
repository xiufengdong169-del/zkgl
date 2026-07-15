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
const gitignore = readFileSync(
  new URL("../../../.gitignore", import.meta.url),
  "utf8",
);
const cloudbaseConfig = JSON.parse(
  readFileSync(new URL("../../../cloudbaserc.json", import.meta.url), "utf8"),
) as { functions: Array<{ name: string; handler: string; runtime: string }> };

const verificationCommands = [
  "npm run verify",
  "npm run typecheck",
  "npm run test",
  "npm run build",
  "node scripts/verify-source-secret-hygiene.mjs",
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
const generatedFunctionPackages = [
  "functions/zkgl-api/",
  "functions/zkgl-reminder/",
  "functions/zkgl-export-worker/",
];
const onsitePerformanceAcceptanceFragments = [
  "AC-14",
  "生产级 CloudBase",
  "基准数据量",
  "3000 个项目",
  "10000 份合同",
  "50000 条",
  "30 用户",
  "P95",
  "≤3 秒",
  "≤5 秒",
  "重复审批",
  "越权",
  "审计日志",
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

  it("documents and ignores generated CloudBase function package directories", () => {
    for (const directory of generatedFunctionPackages) {
      expect(gitignore, `.gitignore missing generated package ${directory}`).toContain(
        directory,
      );
      expect(
        deploymentDoc,
        `deployment docs missing generated package ${directory}`,
      ).toContain(directory.replace(/\/$/, ""));
    }
  });

  it("deployment docs and verification cover CloudBase function config", () => {
    expect(deploymentDoc).toContain("cloudbaserc.json");
    expect(operationsAcceptanceDoc).toContain("cloudbaserc.json");

    for (const fn of cloudbaseConfig.functions) {
      expect(deploymentDoc, `deployment docs missing ${fn.name}`).toContain(
        fn.name,
      );
      expect(fn.handler, `${fn.name} handler`).toBe("index.main");
      expect(fn.runtime, `${fn.name} runtime`).toBe("Nodejs18.15");
    }
  });

  it("documents executable onsite performance acceptance criteria for AC-14", () => {
    for (const fragment of onsitePerformanceAcceptanceFragments) {
      expect(
        operationsAcceptanceDoc,
        `operations acceptance docs missing ${fragment}`,
      ).toContain(fragment);
    }
  });
});
