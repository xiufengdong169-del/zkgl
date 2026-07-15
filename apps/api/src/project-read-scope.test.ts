import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_VIEWER"],
  permissionCodes: ["project.read"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

function projectConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM prj_project p") && sql.includes("p.id=?"))
        return [[{ id: "p9", code: "ZK-1", projectName: "项目A" }], []];
      return [[], []];
    },
  };
}

describe("project read data scopes", () => {
  it("applies explicit project and department scopes to project list", async () => {
    const connection = projectConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "project.list",
      { page: 1, pageSize: 20 },
      scopedUser,
    );

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM prj_project p JOIN org_employee pm"),
    )!;
    expect(query.sql).toContain("p.id IN (?)");
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual([
      0,
      "e1",
      "e1",
      "p9",
      "d2",
      "e1",
      "",
      "%%",
      "%%",
      20,
      0,
    ]);
  });

  it("applies explicit project and department scopes to project detail", async () => {
    const connection = projectConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("project.detail", { projectId: "p9" }, scopedUser);

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM prj_project p JOIN crm_counterparty"),
    )!;
    expect(query.sql).toContain("p.id IN (?)");
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual(["p9", 0, "e1", "e1", "p9", "d2", "e1"]);
  });
});
