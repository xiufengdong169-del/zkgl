import { describe, expect, it } from "vitest";

type PerformanceAcceptanceAssetsModule = {
  verifyPerformanceAcceptanceInputs(inputs: {
    packageJson: string;
    operationsDoc: string;
    performanceTemplate: string;
    finalChecklist: string;
    acceptanceTraceability: string;
  }): string;
};

async function loadPerformanceAcceptanceAssetsModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-performance-acceptance-assets.mjs")) as PerformanceAcceptanceAssetsModule;
}

function validInputs() {
  return {
    packageJson: JSON.stringify({
      scripts: {
        verify:
          "npm run typecheck && npm run verify:performance-acceptance && npm run verify:local-demo",
        "verify:performance-acceptance":
          "node scripts/verify-performance-acceptance-assets.mjs",
      },
    }),
    operationsDoc: [
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
    ].join("\n"),
    performanceTemplate: [
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
    ].join("\n"),
    finalChecklist: [
      "AC-14 现场性能验收",
      "30 用户混合查询",
      "95% 请求满足 V2.2 性能阈值",
      "docs/performance-acceptance-template.md",
      "压测原始记录",
      "MySQL 慢查询记录",
    ].join("\n"),
    acceptanceTraceability:
      "| AC-14 | 30 用户在基准数据量下混合查询，95% 请求满足阈值 | `docs/operations-acceptance.md` 现场负载验收 |",
  };
}

describe("performance acceptance asset verifier script", () => {
  it("accepts aligned AC-14 onsite performance acceptance assets", async () => {
    const { verifyPerformanceAcceptanceInputs } =
      await loadPerformanceAcceptanceAssetsModule();

    expect(verifyPerformanceAcceptanceInputs(validInputs())).toBe(
      "Performance acceptance assets verified",
    );
  });

  it("rejects AC-14 docs that lose the baseline data requirement", async () => {
    const { verifyPerformanceAcceptanceInputs } =
      await loadPerformanceAcceptanceAssetsModule();
    const inputs = validInputs();
    inputs.operationsDoc = inputs.operationsDoc.replace("不少于 3000 个项目", "");

    expect(() => verifyPerformanceAcceptanceInputs(inputs)).toThrow(
      "docs/operations-acceptance.md missing 不少于 3000 个项目",
    );
  });

  it("rejects package scripts that skip the performance acceptance verifier", async () => {
    const { verifyPerformanceAcceptanceInputs } =
      await loadPerformanceAcceptanceAssetsModule();
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({
      scripts: {
        verify: "npm run typecheck",
      },
    });

    expect(() => verifyPerformanceAcceptanceInputs(inputs)).toThrow(
      "package.json missing verify:performance-acceptance script",
    );
  });
});
