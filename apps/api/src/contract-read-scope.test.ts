import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["CONTRACT_VIEWER"],
  permissionCodes: ["contract.read"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

const scopeParams = [0, "e1", "e1", "p9", "d2", "e1"];

function contractConnection() {
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
        return [[{ paramValue: "45" }], []];
      if (sql.includes("FROM con_contract c") && sql.includes("c.id=?"))
        return [[{ id: "c1", code: "HT-1" }], []];
      if (sql.includes("FROM con_contract c"))
        return [[{ incomeAmount: "0.00", expenseAmount: "0.00" }], []];
      return [[], []];
    },
  };
}

function expectProjectScope(query: { sql: string; params: unknown[] }) {
  expect(query.sql).toContain(
    "EXISTS(SELECT 1 FROM prj_project p WHERE p.id=c.project_id AND p.is_deleted=0)",
  );
  expect(query.sql).toContain(
    "EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm",
  );
  expect(query.sql).toContain("p.id IN (?)");
  expect(query.sql).toContain("pm.department_id IN (?)");
  expect(query.sql).toContain("iam_project_grant");
}

describe("contract read data scopes", () => {
  it("applies project scopes to contract list while preserving owner visibility", async () => {
    const connection = contractConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "contract.list",
      { page: 1, pageSize: 20 },
      scopedUser,
    );

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract c JOIN crm_counterparty"),
    )!;
    expectProjectScope(query);
    expect(query.sql).toContain("c.owner_id=? OR");
    expect(query.params).toEqual([
      "e1",
      ...scopeParams,
      "",
      "%%",
      "%%",
      20,
      0,
    ]);
  });

  it("applies project scopes to contract detail", async () => {
    const connection = contractConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("contract.detail", { contractId: "c1" }, scopedUser);

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract c WHERE c.id=?"),
    )!;
    expectProjectScope(query);
    expect(query.sql).toContain("c.owner_id=? OR");
    expect(query.params).toEqual(["c1", "e1", ...scopeParams]);
  });

  it("applies project scopes to contract summary", async () => {
    const connection = contractConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("contract.summary", {}, scopedUser);

    const query = connection.calls.find((call) =>
      call.sql.includes("expiringCount FROM con_contract c"),
    )!;
    expectProjectScope(query);
    expect(query.sql).toContain("INTERVAL 45 DAY");
    expect(query.params).toEqual(["e1", ...scopeParams]);
  });
});
