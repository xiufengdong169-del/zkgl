import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { EXPORT_TRIGGER_NAME } from "./scheduled-export.js";
import { REMINDER_TRIGGER_NAME } from "./scheduled-reminder.js";

const deploymentDoc = readFileSync(
  new URL("../../../docs/deployment.md", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
const architectureDoc = readFileSync(
  new URL("../../../docs/architecture.md", import.meta.url),
  "utf8",
);
const requirementDocxPath = fileURLToPath(
  new URL(
    "../../../众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx",
    import.meta.url,
  ),
);
const requirementDocxXml = execFileSync(
  "tar",
  ["-xOf", requirementDocxPath, "word/document.xml"],
  { encoding: "utf8" },
);
const operationsAcceptanceDoc = readFileSync(
  new URL("../../../docs/operations-acceptance.md", import.meta.url),
  "utf8",
);
const finalAcceptanceChecklist = readFileSync(
  new URL("../../../docs/final-acceptance-checklist.md", import.meta.url),
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
) as {
  functions: Array<{
    name: string;
    handler: string;
    runtime: string;
    triggers?: Array<{ name: string }>;
  }>;
};

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
const frontendDeploymentFragments = [
  "前端发布",
  "VITE_API_BASE_URL",
  "npm run build -w @zkgl/web",
  "node scripts/verify-web-dist-security.mjs",
  "tcb hosting deploy apps/web/dist / --yes",
  "CloudBase 静态网站托管",
  "HTTPS",
  "Web 安全域名",
  "session.get",
];
const cloudbaseCliPrerequisiteFragments = [
  "CloudBase CLI",
  "tcb --version",
  "tcb login",
  "tcb fn deploy zkgl-api --yes",
  "tcb hosting deploy apps/web/dist / --yes",
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
const backupRecoveryAcceptanceFragments = [
  "备份恢复验收",
  "每日自动备份",
  "30 天",
  "关键发布",
  "手工备份",
  "项目附件",
  "恢复点",
  "独立验证环境",
  "恢复演练",
  "每半年",
  "运维台账",
];
const initializationChecklistFragments = [
  "上线初始化资料清单",
  "部门清单",
  "人员清单",
  "CloudBase 身份清单",
  "CloudBase UID",
  "角色分配",
  "系统管理员",
  "公司负责人",
  "项目经理",
  "财务资金",
  "审批岗位任职",
  "审批金额阈值",
  "编号规则确认",
  "系统参数确认",
  "验收演示账号",
  "无权访问用户",
];
const deliveryEntryFragments = [
  "交付与验收入口",
  "需求评审修订基线_V2.2.md",
  "众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx",
  "docs/architecture.md",
  "docs/deployment.md",
  "docs/operations-acceptance.md",
  "docs/acceptance-traceability.md",
  "docs/final-acceptance-checklist.md",
  "V2.2 结果型验收用例",
  "交付前必跑命令",
];
const finalAcceptanceChecklistFragments = [
  "最终交付验收总清单",
  "npm run verify",
  "63 个测试文件 / 305 条测试",
  "9 个测试文件 / 33 条测试",
  "npm audit --omit=dev",
  "git status --short --branch",
  "origin/main",
  "database/init/schema.sql",
  "不存在数据库迁移",
  "上线初始化资料清单",
  "cloudbase-d7gc2b32cd4196059",
  "tcb --version",
  "VITE_API_BASE_URL",
  "zkglDailyReminder",
  "zkglExportWorker",
  "apps/web/dist",
  "CloudBase 静态网站托管",
  "session.get",
  "内部账号停用",
  "敏感字段",
  "业务主流程验收",
  "AC-01 至 AC-15",
  "AC-14",
  "30 用户",
  "备份恢复",
  "每日自动备份",
  "每半年",
  "上线判定",
];

describe("deployment documentation", () => {
  it("documents exact CloudBase timer trigger names used by scheduled functions", () => {
    expect(deploymentDoc).toContain(REMINDER_TRIGGER_NAME);
    expect(deploymentDoc).toContain(EXPORT_TRIGGER_NAME);
    expect(
      cloudbaseConfig.functions.find((fn) => fn.name === "zkgl-reminder")
        ?.triggers?.[0]?.name,
    ).toBe(REMINDER_TRIGGER_NAME);
    expect(
      cloudbaseConfig.functions.find((fn) => fn.name === "zkgl-export-worker")
        ?.triggers?.[0]?.name,
    ).toBe(EXPORT_TRIGGER_NAME);
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

  it("README exposes the delivery and acceptance entry points", () => {
    for (const fragment of deliveryEntryFragments) {
      expect(readme, `README missing delivery entry ${fragment}`).toContain(
        fragment,
      );
    }
  });

  it("documents a final acceptance checklist covering release gates", () => {
    for (const fragment of finalAcceptanceChecklistFragments) {
      expect(
        finalAcceptanceChecklist,
        `final acceptance checklist missing ${fragment}`,
      ).toContain(fragment);
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

  it("keeps new-system empty-database initialization guidance aligned", () => {
    for (const doc of [readme, architectureDoc, deploymentDoc]) {
      expect(doc).toContain("database/init/schema.sql");
      expect(doc).toContain("空");
      expect(doc).toContain("迁移");
    }

    expect(readme).toContain("本项目不存在数据库迁移");
    expect(architectureDoc).toContain("当前阶段不维护数据库迁移");
    expect(deploymentDoc).toContain("不存在数据库迁移步骤");
    expect(deploymentDoc).toContain("历史数据导入");
  });

  it("documents the project-provided initialization data required before acceptance demo", () => {
    for (const fragment of initializationChecklistFragments) {
      expect(
        deploymentDoc,
        `deployment docs missing initialization checklist item ${fragment}`,
      ).toContain(fragment);
    }
  });

  it("keeps the Word V2.2 requirement baseline aligned with current database and module naming", () => {
    expect(requirementDocxXml).toContain("prj_*");
    expect(requirementDocxXml).toContain("con_*");
    expect(requirementDocxXml).toContain("保证金、日常采购");
    expect(requirementDocxXml).toContain("无历史数据迁移");
    expect(requirementDocxXml).toContain("初始化建表脚本");
    expect(requirementDocxXml).not.toMatch(/pm_\*|contract_\*|purchase_\*/);
    expect(requirementDocxXml).not.toMatch(/迁移版本|迁移脚本|首个迁移/);
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

  it("documents executable frontend deployment after API URL is known", () => {
    for (const fragment of frontendDeploymentFragments) {
      expect(
        deploymentDoc,
        `deployment docs missing frontend deployment item ${fragment}`,
      ).toContain(fragment);
    }
  });

  it("documents CloudBase CLI prerequisite before deployment commands", () => {
    for (const fragment of cloudbaseCliPrerequisiteFragments) {
      expect(
        deploymentDoc,
        `deployment docs missing CloudBase CLI prerequisite ${fragment}`,
      ).toContain(fragment);
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

  it("documents executable backup and recovery acceptance criteria", () => {
    for (const fragment of backupRecoveryAcceptanceFragments) {
      expect(
        operationsAcceptanceDoc,
        `operations acceptance docs missing ${fragment}`,
      ).toContain(fragment);
    }
  });
});
