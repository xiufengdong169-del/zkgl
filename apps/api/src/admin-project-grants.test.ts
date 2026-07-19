import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const admin: SessionUser = {
  id: "u-admin",
  cloudbaseUid: "cb-admin",
  employeeId: "e-admin",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["ADMIN"],
  permissionCodes: ["system.admin"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function grantConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM prj_project"))
        return [[{ id: params[0] }], []];
      if (sql.includes("SELECT id FROM org_employee"))
        return [[{ id: params[0] }], []];
      return [{ insertId: 77, affectedRows: 1 }, []];
    },
  };
}

describe("admin temporary project grants", () => {
  it("omits deleted projects from project grant overview rows", async () => {
    const connection = grantConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute("admin.overview", {}, admin);

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM iam_project_grant g JOIN prj_project p"),
    );
    expect(query?.sql).toContain("p.is_deleted=0");
  });

  it("creates a dated project grant with grantor recorded", async () => {
    const connection = grantConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "admin.projectGrant.create",
      {
        projectId: "p9",
        employeeId: "e8",
        startsOn: "2026-07-16",
        endsOn: "2026-08-16",
        reason: "临时支援",
      },
      admin,
    );

    expect(result).toEqual({ id: "77" });
    const insert = connection.calls.find((call) =>
      call.sql.includes("INSERT INTO iam_project_grant"),
    );
    expect(insert?.params).toEqual([
      "p9",
      "e8",
      "2026-07-16",
      "2026-08-16",
      "临时支援",
      admin.id,
    ]);
  });

  it("can disable an existing project grant", async () => {
    const connection = grantConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "admin.projectGrant.status",
      { grantId: "g1", status: "DISABLED" },
      admin,
    );

    expect(result).toEqual({ id: "g1", status: "DISABLED" });
    expect(
      connection.calls.some((call) =>
        call.sql.includes("UPDATE iam_project_grant SET status=?"),
      ),
    ).toBe(true);
  });
});
