import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["CONTRACT_VIEWER"],
  permissionCodes: ["contract.read"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function contractSummaryConnection(paramValue: string | null) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM sys_parameter"))
        return [
          paramValue == null ? [] : [{ paramValue }],
          [],
        ];
      if (sql.includes("FROM con_contract"))
        return [
          [{ incomeAmount: "0.00", expenseAmount: "0.00", expiringCount: 0 }],
          [],
        ];
      return [[], []];
    },
  };
}

describe("contract summary parameters", () => {
  it("uses the configured contract expiry reminder window", async () => {
    const connection = contractSummaryConnection("45");
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("contract.summary", {}, user);

    const parameterQuery = connection.calls.find((call) =>
      call.sql.includes("FROM sys_parameter"),
    )!;
    expect(parameterQuery.params).toEqual(["reminder.contract_expiry_days"]);

    const summaryQuery = connection.calls.find((call) =>
      call.sql.includes("expiringCount FROM con_contract"),
    )!;
    expect(summaryQuery.sql).toContain("INTERVAL 45 DAY");
    expect(summaryQuery.params).toEqual([0, "e1"]);
  });

  it("falls back to 30 days when the parameter is missing", async () => {
    const connection = contractSummaryConnection(null);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("contract.summary", {}, user);

    const summaryQuery = connection.calls.find((call) =>
      call.sql.includes("expiringCount FROM con_contract"),
    )!;
    expect(summaryQuery.sql).toContain("INTERVAL 30 DAY");
  });
});
