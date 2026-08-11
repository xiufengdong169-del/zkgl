import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Performance acceptance asset verification failed: ${message}`);
};

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

export async function readPerformanceAcceptanceAssets(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [
    packageJson,
    operationsDoc,
    performanceTemplate,
    finalChecklist,
    acceptanceTraceability,
  ] = await Promise.all([
    readText("package.json"),
    readText("docs/operations-acceptance.md"),
    readText("docs/performance-acceptance-template.md"),
    readText("docs/final-acceptance-checklist.md"),
    readText("docs/acceptance-traceability.md"),
  ]);
  return {
    packageJson,
    operationsDoc,
    performanceTemplate,
    finalChecklist,
    acceptanceTraceability,
  };
}

export function verifyPerformanceAcceptanceInputs({
  packageJson,
  operationsDoc,
  performanceTemplate,
  finalChecklist,
  acceptanceTraceability,
} = {}) {
  const packageConfig = JSON.parse(packageJson ?? "{}");
  const scripts = packageConfig.scripts ?? {};

  if (
    scripts["verify:performance-acceptance"] !==
    "node scripts/verify-performance-acceptance-assets.mjs"
  ) {
    fail("package.json missing verify:performance-acceptance script");
  }
  if (
    !String(scripts.verify ?? "").includes(
      "npm run verify:performance-acceptance",
    )
  ) {
    fail("package.json scripts.verify must run verify:performance-acceptance");
  }

  includesAll(
    operationsDoc,
    [
      "AC-14",
      "腾讯云轻量应用服务器生产环境",
      "不以本地单元测试替代",
      "不少于 3000 个项目",
      "不少于 10000 份合同",
      "不少于 50000 条",
      "30 用户并发登录系统",
      "P95 响应时间必须 ≤3 秒",
      "P95 响应时间必须 ≤5 秒",
      "不得产生重复审批记录",
      "越权查询、越权保存和越权审批必须被拒绝",
      "Nginx 访问日志",
      "systemd/journal 日志",
      "MySQL 慢查询记录",
    ],
    "docs/operations-acceptance.md",
  );

  includesAll(
    performanceTemplate,
    [
      "AC-14 现场性能验收记录模板",
      "基准数据量确认",
      "不少于 3000 个",
      "不少于 10000 份",
      "不少于 50000 条",
      "30 用户",
      "P95",
      "≤3 秒",
      "≤5 秒",
      "重复审批",
      "越权",
      "Nginx 访问日志",
      "systemd/journal 日志",
      "MySQL 慢查询记录",
      "是否通过 AC-14",
    ],
    "docs/performance-acceptance-template.md",
  );

  includesAll(
    finalChecklist,
    [
      "AC-14 现场性能验收",
      "30 用户混合查询",
      "95% 请求满足 V2.2 性能阈值",
      "docs/performance-acceptance-template.md",
      "压测原始记录",
      "MySQL 慢查询记录",
    ],
    "docs/final-acceptance-checklist.md",
  );

  includesAll(
    acceptanceTraceability,
    [
      "| AC-14 |",
      "30 用户",
      "基准数据量",
      "95%",
      "docs/operations-acceptance.md",
      "现场负载验收",
    ],
    "docs/acceptance-traceability.md",
  );

  return "Performance acceptance assets verified";
}

export async function verifyPerformanceAcceptanceAssets({
  root = defaultRoot,
} = {}) {
  return verifyPerformanceAcceptanceInputs(
    await readPerformanceAcceptanceAssets(root),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyPerformanceAcceptanceAssets());
}
