import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
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
const requirementBaselineDoc = readFileSync(
  new URL("../../../需求评审修订基线_V2.2.md", import.meta.url),
  "utf8",
);
const requirementDocxPath = fileURLToPath(
  new URL(
    "../../../众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
    import.meta.url,
  ),
);
function readDocxDocumentXml(docxPath: string) {
  const entries = execFileSync("tar", ["-tf", docxPath], { encoding: "utf8" });
  const documentEntry = entries
    .split(/\r?\n/)
    .find((entry) => entry === "word/document.xml" || entry === "./word/document.xml");
  if (!documentEntry) {
    throw new Error(`${docxPath} does not contain word/document.xml`);
  }
  return execFileSync("tar", ["-xOf", docxPath, documentEntry], {
    encoding: "utf8",
  });
}
const requirementDocxXml = readDocxDocumentXml(requirementDocxPath);
const operationsAcceptanceDoc = readFileSync(
  new URL("../../../docs/operations-acceptance.md", import.meta.url),
  "utf8",
);
const performanceAcceptanceTemplate = readFileSync(
  new URL("../../../docs/performance-acceptance-template.md", import.meta.url),
  "utf8",
);
const backupRecoveryAcceptanceTemplate = readFileSync(
  new URL("../../../docs/backup-recovery-acceptance-template.md", import.meta.url),
  "utf8",
);
const finalAcceptanceChecklist = readFileSync(
  new URL("../../../docs/final-acceptance-checklist.md", import.meta.url),
  "utf8",
);
const acceptanceTraceabilityDoc = readFileSync(
  new URL("../../../docs/acceptance-traceability.md", import.meta.url),
  "utf8",
);
const localDevelopmentCompletionReport = readFileSync(
  new URL("../../../docs/local-development-completion-report.md", import.meta.url),
  "utf8",
);
const apiSourceDir = fileURLToPath(new URL("./", import.meta.url));
const webSourceDir = fileURLToPath(new URL("../../web/src", import.meta.url));
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
const webDistSecurityScript = readFileSync(
  new URL("../../../scripts/verify-web-dist-security.mjs", import.meta.url),
  "utf8",
);
const sourceSecretHygieneScript = readFileSync(
  new URL("../../../scripts/verify-source-secret-hygiene.mjs", import.meta.url),
  "utf8",
);
const requirementBaselineVerifier = readFileSync(
  new URL("../../../scripts/verify-requirement-baseline.mjs", import.meta.url),
  "utf8",
);
const cloudbaseFunctionPackageVerifier = readFileSync(
  new URL("../../../scripts/verify-cloudbase-function-packages.mjs", import.meta.url),
  "utf8",
);
const deploymentConfigVerifier = readFileSync(
  new URL("../../../scripts/verify-deployment-config.mjs", import.meta.url),
  "utf8",
);
const serverDeploymentAssetVerifier = readFileSync(
  new URL("../../../scripts/verify-server-deployment-assets.mjs", import.meta.url),
  "utf8",
);
const backupAssetVerifier = readFileSync(
  new URL("../../../scripts/verify-backup-assets.mjs", import.meta.url),
  "utf8",
);
const serverPreflightVerifier = readFileSync(
  new URL("../../../scripts/verify-server-preflight.mjs", import.meta.url),
  "utf8",
);
const standaloneServerSource = readFileSync(
  new URL("./server.ts", import.meta.url),
  "utf8",
);
const standaloneServerAuthSource = readFileSync(
  new URL("./server-auth.ts", import.meta.url),
  "utf8",
);
const nginxDeploymentTemplate = readFileSync(
  new URL("../../../deploy/nginx/zkgl.conf", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };
const githubSyncScript = readFileSync(
  new URL("../../../scripts/verify-github-sync.mjs", import.meta.url),
  "utf8",
);
const publicDemoScript = readFileSync(
  new URL("../../../scripts/verify-public-demo.mjs", import.meta.url),
  "utf8",
);
const localDemoScript = readFileSync(
  new URL("../../../scripts/verify-local-demo.mjs", import.meta.url),
  "utf8",
);
const localDemoServerScript = readFileSync(
  new URL("../../../scripts/serve-local-demo.mjs", import.meta.url),
  "utf8",
);
const serverEnvScript = readFileSync(
  new URL("../../../scripts/verify-server-env.mjs", import.meta.url),
  "utf8",
);
const githubVerifyWorkflow = readFileSync(
  new URL("../../../.github/workflows/verify.yml", import.meta.url),
  "utf8",
);
const cloudbaseConfig = JSON.parse(
  readFileSync(new URL("../../../cloudbaserc.json", import.meta.url), "utf8"),
) as {
  envId: string;
  functions: Array<{
    name: string;
    handler: string;
    runtime: string;
    triggers?: Array<{ name: string }>;
  }>;
};

const expectedCloudbaseEnvId = "cloudbase-d7gc2b32cd4196059";
const expectedCloudbaseRegion = "ap-guangzhou";
const expectedServerPublicIp = "193.112.79.220";
const expectedServerOs = "Ubuntu 24.04";
const expectedServerMysql = "MySQL 8.0";
const expectedAcceptanceReviewDate = "2026-08-14";
const verificationCommands = [
  "npm run verify:acceptance",
  "npm run verify",
  "npm run typecheck",
  "npm run test",
  "npm run build",
  "node scripts/verify-source-secret-hygiene.mjs",
  "node scripts/verify-web-dist-security.mjs",
  "npm run verify:deployment-config",
  "npm run verify:performance-acceptance",
  "node scripts/verify-server-deployment-assets.mjs",
  "node scripts/verify-backup-assets.mjs",
  "node scripts/verify-server-preflight.mjs",
  "npm run verify:local-demo",
  "npm audit --omit=dev",
];
const legacyCloudbaseVerificationCommands = [
  "npm run verify:legacy-cloudbase",
  "npm run build:function",
  "node scripts/verify-cloudbase-function-packages.mjs",
];
const browserEnvironmentVariables = [
  "VITE_CLOUDBASE_ENV_ID",
  "VITE_CLOUDBASE_REGION",
  "VITE_CLOUDBASE_PUBLISHABLE_KEY",
  "VITE_API_BASE_URL",
  "VITE_DEMO_MODE",
];
const serverEnvironmentVariables = [
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
const generatedFunctionPackages = [
  "functions/zkgl-api/",
  "functions/zkgl-reminder/",
  "functions/zkgl-export-worker/",
];
const generatedBuildOutputs = [
  "apps/api/dist",
  "apps/web/dist",
  ...generatedFunctionPackages.map((directory) => directory.replace(/\/$/, "")),
];
const ignoredLocalAndSecretPatterns = [
  ".codex/",
  "~$*.docx",
  "node_modules/",
  "dist/",
  ".tmp/",
  "*.tsbuildinfo",
  ".env",
  ".env.*",
  "!.env.example",
];
const frontendDeploymentFragments = [
  "前端发布",
  "VITE_API_BASE_URL",
  "npm run build -w @zkgl/web",
  "node scripts/verify-web-dist-security.mjs",
  "apps/web/dist",
  "Nginx",
  "HTTPS",
  "/api",
  "不得包含账号密码、查询参数或片段",
  "session.get",
];
const cloudbaseCliPrerequisiteFragments = [
  "历史 CloudBase 函数包（非主部署）",
  "正式上线不再部署到 CloudBase",
  "tcb --version",
  "tcb login",
  "tcb fn deploy zkgl-api --yes",
];
const onsitePerformanceAcceptanceFragments = [
  "AC-14",
  "腾讯云轻量应用服务器生产环境",
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
  "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
  "docs/architecture.md",
  "docs/deployment.md",
  "docs/operations-acceptance.md",
  "docs/performance-acceptance-template.md",
  "docs/backup-recovery-acceptance-template.md",
  "docs/acceptance-traceability.md",
  "docs/local-development-completion-report.md",
  "docs/final-acceptance-checklist.md",
  "V2.2 结果型验收用例",
  "交付前必跑命令",
];
const finalAcceptanceChecklistFragments = [
  "最终交付验收总清单",
  "npm run verify:acceptance",
  "87 个测试文件 / 457 条测试",
  "10 个测试文件 / 52 条测试",
  "npm audit --omit=dev",
  "npm run verify:deployment-config",
  "npm run verify:performance-acceptance",
  "git status --short --branch",
  "origin/main",
  "GitHub Actions",
  ".github/workflows/verify.yml",
  "database/init/schema.sql",
  "不存在数据库迁移",
  "上线初始化资料清单",
  "193.112.79.220",
  "Ubuntu 24.04",
  "MySQL 8.0",
  "VITE_API_BASE_URL",
  "zkglDailyReminder",
  "zkglExportWorker",
  "apps/web/dist",
  "Nginx",
  "deploy/systemd/zkgl-auth-adapter.service",
  "session.get",
  "内部账号停用",
  "敏感字段",
  "扩展名与 MIME 类型",
  "预分配的 `private/files/...` 私有存储路径",
  "路径存在额外前缀",
  "HTTPS 临时地址",
  "后端强制校验 HTTPS 临时地址",
  "noopener,noreferrer",
  "业务主流程验收",
  "completed_by",
  "AC-01 至 AC-15",
  "AC-14",
  "30 用户",
  "docs/performance-acceptance-template.md",
  "docs/backup-recovery-acceptance-template.md",
  "P95 统计",
  "Nginx 访问日志",
  "systemd/journal 日志",
  "MySQL 慢查询记录",
  "备份恢复",
  "每日自动备份",
  "每半年",
  "上线判定",
];
const performanceAcceptanceTemplateFragments = [
  "AC-14 现场性能验收记录模板",
  "腾讯云轻量应用服务器生产环境",
  "193.112.79.220",
  "Ubuntu 24.04",
  "MySQL 8.0",
  "基准数据量确认",
  "不少于 3000 个",
  "不少于 10000 份",
  "不少于 50000 条",
  "合计并发用户",
  "30",
  "P95 响应时间",
  "≤3 秒",
  "≤5 秒",
  "越权查询/保存/审批",
  "重复审批",
  "Nginx 访问日志",
  "systemd/journal 日志",
  "数据库慢查询记录",
  "验收会议纪要或签字页",
  "是否通过 AC-14",
];

const extractAcceptanceCaseCodes = (source: string) =>
  [...new Set([...source.matchAll(/\bAC-\d{2}\b/g)].map((match) => match[0]!))]
    .sort();

const extractBacktickedPaths = (source: string) =>
  [...new Set([...source.matchAll(/`([^`]+\.(?:test\.ts|md))`/g)].map(
    (match) => match[1]!,
  ))].sort();

function countTestFiles(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) return count + countTestFiles(fullPath);
      return count + (entry.name.endsWith(".test.ts") ? 1 : 0);
    },
    0,
  );
}

function documentedTestFileCount(source: string, label: "API" | "Web") {
  const match = new RegExp(`${label}[^\\n\\d]*(\\d+) 个测试文件`).exec(source);
  return match ? Number(match[1]) : null;
}
const backupRecoveryAcceptanceTemplateFragments = [
  "备份恢复验收记录模板",
  "193.112.79.220",
  "Ubuntu 24.04",
  "MySQL 8.0",
  "生产环境是否被覆盖",
  "deploy/systemd/zkgl-mysql-backup.timer",
  "scripts/create-mysql-backup.mjs",
  "scripts/restore-mysql-backup.mjs",
  "BACKUP_RETENTION_DAYS",
  "RESTORE_CONFIRM=I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
  "关键发布前手工备份",
  "附件恢复点与数据库恢复点可对应同一业务时间窗口",
  "不得为节省额度关闭审计日志、安全配置或备份恢复能力",
  "MySQL 数据库",
  "项目附件对象存储",
  "后台导出文件",
  "至少 3 个项目",
  "至少 3 份合同",
  "审批记录、待办状态和审计日志可追溯",
  "至少 3 个项目附件可生成 HTTPS 临时地址并下载",
  "未授权账号下载被拒绝并留下访问日志",
  "过期导出文件被拒绝",
  "systemctl status zkgl-mysql-backup.timer",
  "node scripts/verify-backup-assets.mjs",
  "scripts/restore-mysql-backup.mjs",
  "是否通过备份恢复验收",
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
    expect(packageJson.scripts["verify:acceptance"]).toBe(
      "npm run verify && npm audit --omit=dev",
    );
    expect(packageJson.scripts["verify:github-sync"]).toBe(
      "node scripts/verify-github-sync.mjs",
    );
    expect(packageJson.scripts["verify:deployment-config"]).toBe(
      "node scripts/verify-deployment-config.mjs",
    );
    expect(packageJson.scripts["verify:performance-acceptance"]).toBe(
      "node scripts/verify-performance-acceptance-assets.mjs",
    );
    expect(packageJson.scripts["verify:public-demo"]).toBe(
      "node scripts/verify-public-demo.mjs",
    );
    expect(packageJson.scripts["verify:local-demo"]).toBe(
      "node scripts/verify-local-demo.mjs",
    );
    expect(packageJson.scripts["verify:requirements"]).toBe(
      "node scripts/verify-requirement-baseline.mjs",
    );
    expect(packageJson.scripts["demo:local"]).toBe(
      "node scripts/serve-local-demo.mjs",
    );
    expect(packageJson.scripts["verify:server-env"]).toBe(
      "node scripts/verify-server-env.mjs",
    );
    expect(githubVerifyWorkflow).toContain("npm ci");
    expect(githubVerifyWorkflow).toContain("npm run verify:acceptance");
    expect(githubVerifyWorkflow).toContain("push:");
    expect(githubVerifyWorkflow).toContain("pull_request:");
    expect(githubVerifyWorkflow).toContain("permissions:");
    expect(githubVerifyWorkflow).toContain("contents: read");
    expect(githubSyncScript).toContain(
      "https://github.com/xiufengdong169-del/zkgl.git",
    );
    expect(githubSyncScript).toContain("fetch");
    expect(githubSyncScript).toContain("origin/main");
    expect(readme).toContain("npm run verify:github-sync");
    expect(readme).toContain("git -c http.proxy=http://127.0.0.1:7078");
    expect(readme).toContain("Failed to connect to github.com port 443");
    expect(readme).toContain("npm run verify:local-demo");
    expect(readme).toContain("npm run verify:requirements");
    expect(readme).toContain("npm run verify:performance-acceptance");
    expect(readme).toContain("npm run demo:local");
    expect(acceptanceTraceabilityDoc).toContain("npm run verify:github-sync");
    expect(acceptanceTraceabilityDoc).toContain("npm run verify:github-actions");
    expect(acceptanceTraceabilityDoc).toContain("github.com:443");
    expect(acceptanceTraceabilityDoc).toContain("README.md");
    expect(acceptanceTraceabilityDoc).toContain("npm run verify:local-demo");
    expect(acceptanceTraceabilityDoc).toContain("npm run verify:requirements");
    expect(acceptanceTraceabilityDoc).toContain(
      "npm run verify:performance-acceptance",
    );
    expect(acceptanceTraceabilityDoc).toContain(
      `最后复核日期：${expectedAcceptanceReviewDate}`,
    );
    expect(finalAcceptanceChecklist).toContain("npm run verify:github-sync");
    expect(finalAcceptanceChecklist).toContain("git -c http.proxy=...");
    expect(finalAcceptanceChecklist).toContain("github.com:443");
    expect(finalAcceptanceChecklist).toContain("npm run demo:local");
    expect(packageJson.scripts.verify).toContain(
      "npm run verify:deployment-config",
    );
    expect(packageJson.scripts.verify).toContain("npm run verify:requirements");
    expect(packageJson.scripts.verify).toContain(
      "npm run verify:performance-acceptance",
    );
    expect(packageJson.scripts.verify).toContain("npm run verify:local-demo");
    expect(packageJson.scripts.verify).not.toContain(
      "node scripts/verify-cloudbase-function-packages.mjs",
    );
    expect(packageJson.scripts["verify:legacy-cloudbase"]).toContain(
      "node scripts/verify-cloudbase-function-packages.mjs",
    );
    expect(deploymentConfigVerifier).toContain(expectedCloudbaseEnvId);
    expect(deploymentConfigVerifier).toContain(expectedCloudbaseRegion);
    expect(deploymentConfigVerifier).toContain("VITE_API_BASE_URL");
    expect(deploymentConfigVerifier).toContain("demo:local");
    expect(deploymentConfigVerifier).toContain("DB_PASSWORD");
    expect(deploymentConfigVerifier).toContain("zkglDailyReminder");
    expect(deploymentConfigVerifier).toContain("zkglExportWorker");
    expect(sourceSecretHygieneScript).toContain('"docs"');
    expect(sourceSecretHygieneScript).toContain('"deploy"');
    expect(sourceSecretHygieneScript).toContain("需求评审修订基线_V2.2.md");
    expect(sourceSecretHygieneScript).toContain(
      "众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx",
    );
    expect(sourceSecretHygieneScript).toContain(
      "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
    );
    expect(sourceSecretHygieneScript).toContain("word/document.xml");
    expect(requirementBaselineVerifier).toContain("currentWordBaseline");
    expect(requirementBaselineVerifier).toContain(
      "众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx",
    );
    expect(requirementBaselineVerifier).toContain("CloudBase 部署版");
    expect(requirementBaselineVerifier).toContain("cloudbase-d7gc2b32cd4196059");
    expect(deploymentDoc).toContain("node scripts/verify-requirement-baseline.mjs");
    expect(cloudbaseFunctionPackageVerifier).toContain("unexpected root entries");
    expect(cloudbaseFunctionPackageVerifier).toContain("non-JavaScript dist artifact");
    expect(cloudbaseFunctionPackageVerifier).toContain("sourceMappingURL");
    for (const doc of [
      readme,
      deploymentDoc,
      operationsAcceptanceDoc,
      acceptanceTraceabilityDoc,
      finalAcceptanceChecklist,
      localDevelopmentCompletionReport,
    ]) {
      expect(doc).toContain("npm run verify:acceptance");
    }
    expect(deploymentDoc).toContain("npm run verify:acceptance");
    expect(deploymentDoc).not.toMatch(
      /npm run typecheck\s+npm run test\s+npm run build\s+npm run build:function/,
    );

    for (const command of verificationCommands) {
      expect(readme).toContain(command);
      expect(operationsAcceptanceDoc).toContain(command);
      expect(acceptanceTraceabilityDoc).toContain(command);
    }
    for (const command of legacyCloudbaseVerificationCommands) {
      expect(deploymentDoc).toContain(command);
    }
    for (const doc of [readme, operationsAcceptanceDoc, acceptanceTraceabilityDoc]) {
      expect(doc).toContain("npm run verify:legacy-cloudbase");
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

  it("documents the current local development completion baseline", () => {
    for (const fragment of [
      "本地开发测试完成报告",
      "复核日期：2026-08-14",
      "npm run verify:acceptance",
      "API 测试通过：87 个测试文件 / 457 条测试",
      "Web 测试通过：10 个测试文件 / 52 条测试",
      "本项目仍按全新开发口径执行，不存在数据库迁移",
      "腾讯云轻量服务器正式部署",
      "AC-14 现场性能验收",
      "备份恢复演练",
      "用户浏览器可视化演示访问",
    ]) {
      expect(
        localDevelopmentCompletionReport,
        `local completion report missing ${fragment}`,
      ).toContain(fragment);
    }
    expect(readme).toContain("docs/local-development-completion-report.md");
    expect(finalAcceptanceChecklist).toContain(
      "docs/local-development-completion-report.md",
    );
    expect(acceptanceTraceabilityDoc).toContain(
      "docs/local-development-completion-report.md",
    );
  });

  it("keeps acceptance traceability aligned with requirement baseline AC cases", () => {
    const expectedCaseCodes = Array.from({ length: 15 }, (_, index) =>
      `AC-${String(index + 1).padStart(2, "0")}`,
    );
    const requirementCaseCodes =
      extractAcceptanceCaseCodes(requirementBaselineDoc);
    const traceabilityCaseCodes =
      extractAcceptanceCaseCodes(acceptanceTraceabilityDoc);
    const finalChecklistCaseCodes =
      extractAcceptanceCaseCodes(finalAcceptanceChecklist);

    expect(requirementCaseCodes).toEqual(expectedCaseCodes);
    expect(traceabilityCaseCodes).toEqual(expectedCaseCodes);
    expect(finalChecklistCaseCodes).toEqual(["AC-01", "AC-14", "AC-15"]);
    for (const caseCode of expectedCaseCodes) {
      expect(
        acceptanceTraceabilityDoc,
        `acceptance traceability missing ${caseCode}`,
      ).toMatch(new RegExp(`\\| ${caseCode} \\|[\\s\\S]*?\\|`));
    }
  });

  it("keeps acceptance traceability references pointed at existing artifacts", () => {
    const referencedPaths = extractBacktickedPaths(acceptanceTraceabilityDoc);

    expect(referencedPaths.length).toBeGreaterThan(5);
    for (const referencedPath of referencedPaths) {
      expect(
        existsSync(new URL(`../../../${referencedPath}`, import.meta.url)),
        `acceptance traceability references missing artifact ${referencedPath}`,
      ).toBe(true);
    }
  });

  it("keeps documented test file baselines aligned with the workspace", () => {
    const actualApiTestFiles = countTestFiles(apiSourceDir);
    const actualWebTestFiles = countTestFiles(webSourceDir);

    expect(actualApiTestFiles).toBe(87);
    expect(actualWebTestFiles).toBe(10);
    for (const doc of [acceptanceTraceabilityDoc, finalAcceptanceChecklist]) {
      expect(documentedTestFileCount(doc, "API")).toBe(actualApiTestFiles);
      expect(documentedTestFileCount(doc, "Web")).toBe(actualWebTestFiles);
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
        webEnvTypes,
        `frontend env type must not expose server-only variable ${variable}`,
      ).not.toMatch(new RegExp(`readonly\\s+${variable}\\??:`));
      expect(
        webDistSecurityScript,
        `web dist security verifier must scan ${variable}`,
      ).toContain(variable);
      expect(
        deploymentDoc,
        `deployment docs missing server-only variable ${variable}`,
      ).toContain(variable);
    }
    expect(deploymentDoc).toContain("VITE_API_BASE_URL");
  });

  it("documents and implements Tencent Cloud Lighthouse standalone server deployment", () => {
    for (const fragment of [
      expectedServerPublicIp,
      expectedServerOs,
      expectedServerMysql,
      "Tencent Cloud Lighthouse",
      "systemd",
      "Nginx",
      "npm run start -w @zkgl/api",
      "127.0.0.1:3000",
      "X-ZKGL-CloudBase-UID",
      "Authorization: Bearer",
      "AUTH_TOKEN_VERIFIER_MODULE",
      "AUTH_TRUSTED_PROXY",
    ]) {
      expect(deploymentDoc).toContain(fragment);
      expect(finalAcceptanceChecklist).toContain(fragment);
    }
    expect(envExample).toContain(`DEPLOY_TARGET_HOST=${expectedServerPublicIp}`);
    expect(envExample).toContain(`DEPLOY_TARGET_OS=${expectedServerOs}`);
    expect(envExample).toContain("DEPLOY_TARGET_MYSQL=8.0");
    expect(deploymentConfigVerifier).toContain(expectedServerPublicIp);
    expect(deploymentConfigVerifier).toContain(expectedServerOs);
    expect(deploymentConfigVerifier).toContain("serverMysql");
    expect(packageJson.scripts.verify).toContain("npm run verify:deployment-config");
    expect(standaloneServerSource).toContain("createServer");
    expect(standaloneServerAuthSource).toContain("x-zkgl-cloudbase-uid");
    expect(standaloneServerAuthSource).toContain("AUTH_TRUSTED_PROXY");
    expect(standaloneServerSource).toContain("resolveServerCloudbaseUid");
    expect(standaloneServerSource).toContain("/healthz");
    expect(standaloneServerSource).toContain("/readyz");
    expect(standaloneServerSource).toContain("maxBodyBytes");
    expect(standaloneServerSource).toContain("API_ALLOWED_ORIGINS");
    expect(deploymentDoc).toContain("deploy/systemd/zkgl-api.service");
    expect(deploymentDoc).toContain("deploy/systemd/zkgl-auth-adapter.service");
    expect(deploymentDoc).toContain("deploy/auth/cloudbase-token-verifier.example.mjs");
    expect(deploymentDoc).toContain("AUTH_TOKEN_VERIFIER_MODULE");
    expect(deploymentDoc).toContain("npm run verify:server-env");
    expect(deploymentDoc).toContain("拒绝把 `.example.` 文件作为生产 verifier 使用");
    expect(deploymentDoc).toContain("deploy/systemd/zkgl-reminder.timer");
    expect(deploymentDoc).toContain("deploy/systemd/zkgl-export-worker.timer");
    expect(deploymentDoc).toContain("deploy/nginx/zkgl.conf");
    expect(deploymentDoc).toContain("scripts/bootstrap-lighthouse-demo.sh");
    expect(deploymentDoc).toContain("scripts/deploy-lighthouse-demo.sh");
    expect(deploymentDoc).toContain("scripts/deploy-lighthouse-production.sh");
    expect(deploymentDoc).toContain("npm run verify:public-demo");
    expect(deploymentDoc).toContain("npm run verify:local-demo");
    expect(deploymentDoc).toContain("curl http://127.0.0.1:3000/readyz");
    expect(finalAcceptanceChecklist).toContain(
      "curl http://127.0.0.1:3000/readyz",
    );
    expect(deploymentDoc).toContain(
      "curl -fsSL https://raw.githubusercontent.com/xiufengdong169-del/zkgl/main/scripts/bootstrap-lighthouse-demo.sh | sudo bash",
    );
    expect(finalAcceptanceChecklist).toContain("deploy/systemd/zkgl-api.service");
    expect(finalAcceptanceChecklist).toContain("deploy/systemd/zkgl-auth-adapter.service");
    expect(finalAcceptanceChecklist).toContain("deploy/auth/cloudbase-token-verifier.example.mjs");
    expect(finalAcceptanceChecklist).toContain("npm run verify:server-env");
    expect(finalAcceptanceChecklist).toContain("deploy/systemd/zkgl-reminder.timer");
    expect(finalAcceptanceChecklist).toContain("deploy/systemd/zkgl-export-worker.timer");
    expect(finalAcceptanceChecklist).toContain("deploy/nginx/zkgl.conf");
    expect(finalAcceptanceChecklist).toContain("scripts/bootstrap-lighthouse-demo.sh");
    expect(finalAcceptanceChecklist).toContain("scripts/deploy-lighthouse-production.sh");
    expect(finalAcceptanceChecklist).toContain("npm run verify:public-demo");
    expect(finalAcceptanceChecklist).toContain("npm run verify:local-demo");
    expect(publicDemoScript).toContain("http://127.0.0.1:4173/");
    expect(publicDemoScript).toContain("众肯项目管理系统");
    expect(publicDemoScript).toContain("apps/web/src/routes.ts");
    expect(publicDemoScript).toContain("extractDemoRoutes");
    expect(publicDemoScript).toContain("readDefaultDemoRoutes");
    expect(publicDemoScript).toContain("path:");
    expect(localDemoScript).toContain("VITE_DEMO_MODE");
    expect(localDemoScript).toContain(".tmp");
    expect(localDemoScript).toContain("createDemoStaticServer");
    expect(localDemoScript).toContain("verifyPublicDemo");
    expect(localDemoScript).toContain("collectLocalDemoAssetRoutes");
    expect(localDemoScript).toContain("verifyLocalDemoAssets");
    expect(localDemoServerScript).toContain("serveLocalDemo");
    expect(localDemoServerScript).toContain("http://");
    expect(localDemoServerScript).toContain("4173");
    expect(localDemoServerScript).toContain("verifyLocalDemoAssets");
    expect(deploymentDoc).toContain("npm run demo:local");
    expect(deploymentDoc).toContain("http://127.0.0.1:4173/");
    expect(deploymentDoc).toContain("不会访问远程服务器");
    expect(deploymentDoc).toContain(
      "node scripts/verify-public-demo.mjs http://193.112.79.220/",
    );
    expect(deploymentDoc).toContain(
      "不带参数的 `npm run verify:public-demo` 默认只校验本机",
    );
    expect(finalAcceptanceChecklist).toContain("http://127.0.0.1:4173/");
    expect(finalAcceptanceChecklist).toContain(
      "未显式传入 URL 的 `npm run verify:public-demo` 默认只校验本机",
    );
    expect(publicDemoScript).toContain("extractFrontendModuleEntries");
    expect(publicDemoScript).toContain("frontend module");
    expect(publicDemoScript).toContain("extractStylesheetEntries");
    expect(publicDemoScript).toContain("frontend stylesheet");
    expect(nginxDeploymentTemplate).toContain("auth_request /_zkgl_auth");
    expect(nginxDeploymentTemplate).toContain(
      "proxy_set_header X-ZKGL-CloudBase-UID \"\"",
    );
    expect(serverDeploymentAssetVerifier).toContain("auth_request /_zkgl_auth");
    expect(serverDeploymentAssetVerifier).toContain("deploy/systemd/zkgl-auth-adapter.service");
    expect(serverDeploymentAssetVerifier).toContain("deploy/auth/cloudbase-token-verifier.example.mjs");
    expect(serverDeploymentAssetVerifier).toContain("scripts/verify-server-env.mjs");
    expect(serverDeploymentAssetVerifier).toContain("scripts/bootstrap-lighthouse-demo.sh");
    expect(serverDeploymentAssetVerifier).toContain("scripts/deploy-lighthouse-production.sh");
    expect(packageJson.scripts.verify).toContain(
      "node scripts/verify-server-deployment-assets.mjs",
    );
    expect(packageJson.scripts.verify).toContain(
      "node scripts/verify-backup-assets.mjs",
    );
    expect(packageJson.scripts.verify).toContain(
      "node scripts/verify-server-preflight.mjs",
    );
    expect(deploymentDoc).toContain("deploy/systemd/zkgl-mysql-backup.timer");
    expect(deploymentDoc).toContain("scripts/create-mysql-backup.mjs");
    expect(finalAcceptanceChecklist).toContain(
      "deploy/systemd/zkgl-mysql-backup.timer",
    );
    expect(backupAssetVerifier).toContain("mysqldump");
    expect(backupAssetVerifier).toContain("OnCalendar=*-*-* 02:30:00");
    expect(serverPreflightVerifier).toContain(expectedServerPublicIp);
    expect(serverPreflightVerifier).toContain("Tencent Cloud Lighthouse");
    expect(serverPreflightVerifier).toContain(
      "node scripts/verify-server-preflight.mjs",
    );
    expect(serverEnvScript).toContain("AUTH_TOKEN_VERIFIER_MODULE must not point to an example verifier");
    expect(serverEnvScript).toContain("TLS certificate files are missing");
  });

  it("keeps new-system empty-database initialization guidance aligned", () => {
    for (const doc of [readme, architectureDoc, deploymentDoc]) {
      expect(doc).toContain("database/init/schema.sql");
      expect(doc).toContain("空");
      expect(doc).toContain("迁移");
    }

    expect(readme).toContain("本项目不存在数据库迁移");
    expect(architectureDoc).toContain("当前阶段不维护数据库迁移");
    expect(architectureDoc).toContain("ALTER TABLE");
    expect(architectureDoc).toContain("CREATE DATABASE");
    expect(deploymentDoc).toContain("不存在数据库迁移步骤");
    expect(deploymentDoc).toContain("历史数据导入");
    expect(deploymentDoc).toContain("TRUNCATE");
    expect(deploymentDoc).toContain("绑定具体库名");
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
    expect(requirementDocxXml).toContain("腾讯云轻量服务器版");
    expect(requirementDocxXml).toContain("193.112.79.220");
    expect(requirementDocxXml).toContain("MySQL 8.0");
    expect(requirementDocxXml).not.toContain("cloudbase-d7gc2b32cd4196059");
    expect(requirementDocxXml).not.toContain("CloudBase 部署版");
    expect(requirementDocxXml).not.toMatch(/pm_\*|contract_\*|purchase_\*/);
    expect(requirementDocxXml).not.toMatch(/迁移版本|迁移脚本|首个迁移/);
  });

  it("documents and ignores generated build output directories", () => {
    expect(gitignore).toContain("dist/");
    for (const pattern of ignoredLocalAndSecretPatterns) {
      expect(gitignore, `.gitignore missing ${pattern}`).toContain(pattern);
    }
    for (const directory of generatedFunctionPackages) {
      expect(gitignore, `.gitignore missing generated package ${directory}`).toContain(
        directory,
      );
      expect(
        deploymentDoc,
        `deployment docs missing generated package ${directory}`,
      ).toContain(directory.replace(/\/$/, ""));
    }

    const trackedGeneratedOutputs = execFileSync(
      "git",
      ["ls-files", ...generatedBuildOutputs],
      { encoding: "utf8" },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    expect(trackedGeneratedOutputs).toEqual([]);
  });

  it("documents executable frontend deployment after API URL is known", () => {
    for (const fragment of frontendDeploymentFragments) {
      expect(
        deploymentDoc,
        `deployment docs missing frontend deployment item ${fragment}`,
      ).toContain(fragment);
    }
    for (const doc of [
      finalAcceptanceChecklist,
      operationsAcceptanceDoc,
      localDevelopmentCompletionReport,
    ]) {
      expect(doc).toContain("VITE_API_BASE_URL");
      expect(doc).toContain("/api");
    }
    expect(finalAcceptanceChecklist).toContain("账号密码、查询参数或片段");
    expect(operationsAcceptanceDoc).toContain("账号密码、查询参数或片段");
  });

  it("documents CloudBase CLI prerequisite before deployment commands", () => {
    for (const fragment of cloudbaseCliPrerequisiteFragments) {
      expect(
        deploymentDoc,
        `deployment docs missing CloudBase CLI prerequisite ${fragment}`,
      ).toContain(fragment);
    }
  });

  it("keeps the CloudBase environment id and region aligned across deployment artifacts", () => {
    expect(cloudbaseConfig.envId).toBe(expectedCloudbaseEnvId);
    expect(envExample).toContain(
      `VITE_CLOUDBASE_ENV_ID=${expectedCloudbaseEnvId}`,
    );
    expect(envExample).toContain(`CLOUDBASE_ENV_ID=${expectedCloudbaseEnvId}`);
    expect(envExample).toContain(
      `VITE_CLOUDBASE_REGION=${expectedCloudbaseRegion}`,
    );

    for (const doc of [deploymentDoc]) {
      expect(doc).toContain(expectedCloudbaseEnvId);
    }
    expect(deploymentDoc).toContain(expectedCloudbaseRegion);
    expect(deploymentDoc).toContain("广州");
    expect(finalAcceptanceChecklist).toContain("广州");
  });

  it("deployment docs and verification cover CloudBase function config", () => {
    expect(deploymentDoc).toContain("cloudbaserc.json");
    expect(operationsAcceptanceDoc).not.toContain("cloudbaserc.json");
    expect(operationsAcceptanceDoc).toContain("当前腾讯云轻量服务器主部署验收");

    for (const fn of cloudbaseConfig.functions) {
      expect(deploymentDoc, `deployment docs missing ${fn.name}`).toContain(
        fn.name,
      );
      expect(fn.handler, `${fn.name} handler`).toBe("index.main");
      expect(fn.runtime, `${fn.name} runtime`).toBe("Nodejs18.15");
    }
  });

  it("documents overdue abnormal reminders for approved early-start projects", () => {
    for (const fragment of [
      "先开工签约逾期异常",
      "超过预计签约日后将",
      "持续生成异常提醒",
      "先开工项目超过预计签约日后将",
      "current_contract_status",
      "SIGNING_OVERDUE",
    ]) {
      const docs = [deploymentDoc, finalAcceptanceChecklist, operationsAcceptanceDoc];
      expect(
        docs.some((doc) => doc.includes(fragment)),
        `delivery docs missing early-start overdue reminder fragment ${fragment}`,
      ).toBe(true);
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

  it("provides a fillable AC-14 performance acceptance record template", () => {
    for (const fragment of performanceAcceptanceTemplateFragments) {
      expect(
        performanceAcceptanceTemplate,
        `performance acceptance template missing ${fragment}`,
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
    expect(operationsAcceptanceDoc).toContain(
      "docs/backup-recovery-acceptance-template.md",
    );
    expect(finalAcceptanceChecklist).toContain(
      "docs/backup-recovery-acceptance-template.md",
    );
  });

  it("provides a fillable backup and recovery acceptance record template", () => {
    for (const fragment of backupRecoveryAcceptanceTemplateFragments) {
      expect(
        backupRecoveryAcceptanceTemplate,
        `backup recovery acceptance template missing ${fragment}`,
      ).toContain(fragment);
    }
  });
});
