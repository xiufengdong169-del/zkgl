import { describe, expect, it } from "vitest";

import { buildCsv, quoteCsvCell } from "./csv";

describe("CSV export safety", () => {
  it("escapes formula-like values even when prefixed by whitespace", () => {
    expect(quoteCsvCell(" \t=cmd|' /C calc'!A0")).toBe(
      "\"' \t=cmd|' /C calc'!A0\"",
    );
    expect(quoteCsvCell("\t+SUM(1,2)")).toBe("\"'\t+SUM(1,2)\"");
  });

  it("escapes embedded quotes without altering ordinary text", () => {
    expect(quoteCsvCell('customer "A"')).toBe('"customer ""A"""');
    expect(quoteCsvCell("normal customer")).toBe('"normal customer"');
  });

  it("builds project export CSV with BOM, rows and disclaimer", () => {
    const csv = buildCsv(
      [
        ["projectCode", "项目编号"],
        ["projectName", "项目名称"],
      ],
      [{ projectCode: "ZK-001", projectName: "项目A" }],
      "内部项目经营口径",
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"ZK-001","项目A"');
    expect(csv.endsWith('"内部项目经营口径"')).toBe(true);
  });
});
