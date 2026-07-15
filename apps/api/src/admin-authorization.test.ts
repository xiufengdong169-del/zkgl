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

function adminConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id,code FROM iam_role"))
        return [[{ id: params[0], code: params[0] === "r-admin" ? "ADMIN" : "PROJECT_MANAGER" }], []];
      if (sql.includes("SELECT id FROM iam_role"))
        return [[{ id: params[0] }], []];
      if (sql.includes("SELECT id,code FROM iam_permission"))
        return [[{ id: "p-project", code: "project.read" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("admin role authorization maintenance", () => {
  it("keeps the ADMIN role from losing system.admin", async () => {
    const connection = adminConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.role.permission.set",
        { roleId: "r-admin", permissionIds: ["p-project"] },
        admin,
      ),
    ).rejects.toThrow("管理员角色必须保留系统管理权限");
    expect(connection.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
  });

  it("replaces role data scopes with deduplicated entries", async () => {
    const connection = adminConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "admin.role.dataScope.set",
      {
        roleId: "r-project",
        scopes: [
          { scopeType: "PROJECT", scopeValue: "p1" },
          { scopeType: "PROJECT", scopeValue: "p1" },
          { scopeType: "DEPARTMENT", scopeValue: "d1" },
        ],
      },
      admin,
    );

    expect(result).toEqual({ roleId: "r-project", scopeCount: 2 });
    expect(connection.calls.some((call) => call.sql.includes("DELETE FROM iam_role_data_scope"))).toBe(true);
    expect(
      connection.calls.filter((call) => call.sql.includes("INSERT INTO iam_role_data_scope")),
    ).toHaveLength(2);
  });

  it("replaces sensitive field grants by field code", async () => {
    const connection = adminConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "admin.role.sensitiveField.set",
      {
        roleId: "r-project",
        grants: [
          { fieldCode: "profit", accessLevel: "FULL", explicitDeny: false },
          { fieldCode: "profit", accessLevel: "MASKED", explicitDeny: true },
        ],
      },
      admin,
    );

    expect(result).toEqual({ roleId: "r-project", grantCount: 1 });
    const insert = connection.calls.find((call) =>
      call.sql.includes("INSERT INTO iam_sensitive_field_grant"),
    );
    expect(insert!.params).toEqual(["r-project", "profit", "MASKED", 1]);
  });
});
