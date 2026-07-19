import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["BID_VIEWER"],
  permissionCodes: ["bid.application.read"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

const scopeParams = [0, "e1", "e1", "p9", "d2", "e1"];

function bidConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM bid_application b JOIN prj_project p"))
        return [[{ id: "b1", projectId: "p9", status: "PREPARING" }], []];
      return [[], []];
    },
  };
}

function expectBidProjectScope(query: { sql: string; params: unknown[] }) {
  expect(query.sql).toContain(
    "JOIN prj_project p ON p.id=b.project_id AND p.is_deleted=0",
  );
  expect(query.sql).toContain("b.business_owner_id=?");
  expect(query.sql).toContain("b.technical_owner_id=?");
  expect(query.sql).toContain("b.pricing_owner_id=?");
  expect(query.sql).toContain(
    "EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm",
  );
  expect(query.sql).toContain("p.id IN (?)");
  expect(query.sql).toContain("pm.department_id IN (?)");
  expect(query.sql).toContain("iam_project_grant");
}

describe("bid read data scopes", () => {
  it("applies project scopes to bid list while preserving bid owner visibility", async () => {
    const connection = bidConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "bid.application.list",
      { page: 1, pageSize: 20 },
      scopedUser,
    );

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM bid_application b JOIN prj_project p"),
    )!;
    expectBidProjectScope(query);
    expect(query.params).toEqual([
      "e1",
      "e1",
      "e1",
      ...scopeParams,
      "",
      "%%",
      "%%",
      20,
      0,
    ]);
  });

  it("applies project scopes to bid detail before loading child records", async () => {
    const connection = bidConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("bid.detail", { bidId: "b1" }, scopedUser);

    const query = connection.calls.find((call) =>
      call.sql.includes("WHERE b.id=?"),
    )!;
    expectBidProjectScope(query);
    expect(query.params).toEqual(["b1", "e1", "e1", "e1", ...scopeParams]);
    expect(
      connection.calls.some((call) => call.sql.includes("FROM bid_task")),
    ).toBe(true);
    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM bid_partner_cooperation"),
      ),
    ).toBe(true);
  });
});
