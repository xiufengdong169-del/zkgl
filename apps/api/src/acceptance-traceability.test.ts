import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const baseline = readFileSync(
  new URL("../../../需求评审修订基线_V2.2.md", import.meta.url),
  "utf8",
);
const traceability = readFileSync(
  new URL("../../../docs/acceptance-traceability.md", import.meta.url),
  "utf8",
);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function extractAcceptanceRows(markdown: string) {
  return new Map(
    markdown
      .split(/\r?\n/)
      .map((line) => /^\|\s*(AC-\d{2})\s*\|\s*([^|]+?)\s*\|/.exec(line))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => [match[1]!, match[2]!.trim()]),
  );
}

const requiredTraceabilityFragments: Record<string, string[]> = {
  "AC-01": ["累计开票", "合同"],
  "AC-02": ["发票", "收款", "核销"],
  "AC-03": ["核销", "余额"],
  "AC-04": ["合作方", "实际收款", "历史"],
  "AC-05": ["付款", "重复"],
  "AC-06": ["保证金", "退回", "成本"],
  "AC-07": ["保证金", "没收", "成本"],
  "AC-08": ["报销", "明细"],
  "AC-09": ["立项", "驳回", "项目编号"],
  "AC-10": ["无正式合同", "提前启动"],
  "AC-11": ["结算", "快照"],
  "AC-12": ["项目详情", "导出", "附件"],
  "AC-13": ["暂定金额", "变更"],
  "AC-14": ["30 用户", "基准数据量", "95%"],
  "AC-15": ["未收款", "未退保证金", "未关闭问题", "公司负责人"],
};

describe("V2.2 acceptance traceability", () => {
  it("验收追踪表覆盖 V2.2 结果型验收用例且编号语义不漂移", () => {
    const baselineRows = extractAcceptanceRows(baseline);
    const traceabilityRows = extractAcceptanceRows(traceability);

    expect([...baselineRows.keys()]).toEqual(
      Object.keys(requiredTraceabilityFragments),
    );
    expect([...traceabilityRows.keys()]).toEqual(
      Object.keys(requiredTraceabilityFragments),
    );

    for (const [acceptanceCode, fragments] of Object.entries(
      requiredTraceabilityFragments,
    )) {
      const baselineText = baselineRows.get(acceptanceCode) ?? "";
      const traceabilityText = traceabilityRows.get(acceptanceCode) ?? "";

      for (const fragment of fragments) {
        expect(
          `${baselineText}\n${traceabilityText}`,
          `${acceptanceCode} missing fragment ${fragment}`,
        ).toContain(fragment);
      }
    }
  });

  it("验收追踪表引用的自动化测试与现场验收文档均存在", () => {
    const traceabilityRows = traceability
      .split(/\r?\n/)
      .filter((line) => /^\|\s*AC-\d{2}\s*\|/.test(line));

    for (const row of traceabilityRows) {
      const paths = [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
      expect(
        paths.length,
        `missing referenced artifact in row: ${row}`,
      ).toBeGreaterThan(0);
      for (const path of paths) {
        expect(existsSync(join(repoRoot, path))).toBe(true);
      }
    }
  });
});
