import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["REPORT"],
  permissionCodes: ["report.financial.read", "project.export"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

function reportConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("expectedProfit")) return [[{ projectCount: 0 }], []];
      if (sql.includes("contractAmount")) return [[{}], []];
      return [[], []];
    },
  };
}

describe("report project data scopes", () => {
  it("applies explicit project and department scopes to dashboard metrics", async () => {
    const connection = reportConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("report.dashboard", {}, scopedUser);

    const query = connection.calls.find((call) => call.sql.includes("expectedProfit"))!;
    expect(query.sql).toContain("JOIN org_employee pm");
    expect(query.sql).toContain("p.id IN (?)");
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual([0, "e1", "e1", "p9", "d2", "e1"]);
  });

  it("applies the same project scope to analytics project rollups", async () => {
    const connection = reportConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("report.analytics", {}, scopedUser);

    const projectQueries = connection.calls.filter((call) =>
      call.sql.includes("JOIN org_employee pm"),
    );
    expect(projectQueries).toHaveLength(3);
    for (const query of projectQueries) {
      expect(query.sql).toContain("p.id IN (?)");
      expect(query.sql).toContain("pm.department_id IN (?)");
      expect(query.params).toEqual([0, "e1", "e1", "p9", "d2", "e1"]);
    }
  });

  it("applies project scope before receivables pagination", async () => {
    const connection = reportConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("report.receivables", { page: 2, pageSize: 20 }, scopedUser);

    const query = connection.calls.find((call) => call.sql.includes("outstandingAmount"))!;
    expect(query.sql).toContain("JOIN org_employee pm");
    expect(query.sql).toContain("p.id IN (?)");
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual([0, "e1", "e1", "p9", "d2", "e1", 20, 20]);
  });
});
