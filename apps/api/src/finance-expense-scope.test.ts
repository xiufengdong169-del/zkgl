import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["FINANCE"],
  permissionCodes: ["reimbursement.create"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

const scopeParams = [0, "e1", "e1", "p9", "d2", "e1"];

function expenseConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [[], []];
    },
  };
}

function expectProjectScope(query: { sql: string; params: unknown[] }) {
  expect(query.sql).toContain(
    "EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm",
  );
  expect(query.sql).toContain("p.id IN (?)");
  expect(query.sql).toContain("pm.department_id IN (?)");
  expect(query.sql).toContain("iam_project_grant");
}

describe("finance expense application scopes", () => {
  it("keeps applicant visibility and adds project scopes for reimbursements and purchases", async () => {
    const connection = expenseConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("finance.expenseApplications", {}, scopedUser);

    const reimbursementQuery = connection.calls.find((call) =>
      call.sql.includes("FROM fin_reimbursement h"),
    )!;
    expectProjectScope(reimbursementQuery);
    expect(reimbursementQuery.sql).toContain("h.claimant_id=? OR");
    expect(reimbursementQuery.sql).toContain("p.id=h.project_id");
    expect(reimbursementQuery.params).toEqual(["e1", ...scopeParams]);

    const purchaseQuery = connection.calls.find((call) =>
      call.sql.includes("FROM fin_daily_purchase p"),
    )!;
    expectProjectScope(purchaseQuery);
    expect(purchaseQuery.sql).toContain("p.applicant_id=? OR");
    expect(purchaseQuery.sql).toContain("p.id=c.project_id");
    expect(purchaseQuery.params).toEqual(["e1", ...scopeParams]);
  });
});
