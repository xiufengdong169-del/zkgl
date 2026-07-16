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

function accountStatusConnection(input: {
  targetUserId: string;
  isAdmin: number;
  enabledAdminCount: number;
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("EXISTS(SELECT 1 FROM iam_user_role"))
        return [
          [
            {
              id: input.targetUserId,
              status: "ENABLED",
              isAdmin: input.isAdmin,
            },
          ],
          [],
        ];
      if (sql.includes("COUNT(DISTINCT u.id) count"))
        return [[{ count: input.enabledAdminCount }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

function affectedRowsConnection(affectedRows = 0) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [{ affectedRows }, []];
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

  it("rejects disabling the current logged-in account at the persistence boundary", async () => {
    const connection = accountStatusConnection({
      targetUserId: "u-admin",
      isAdmin: 1,
      enabledAdminCount: 2,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.user.status",
        { userId: "u-admin", status: "DISABLED" },
        admin,
      ),
    ).rejects.toMatchObject({ code: "SELF_DISABLE_FORBIDDEN" });

    expect(
      connection.calls.some((call) => call.sql.startsWith("UPDATE iam_user")),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rejects disabling the last enabled admin at the persistence boundary", async () => {
    const connection = accountStatusConnection({
      targetUserId: "u-other-admin",
      isAdmin: 1,
      enabledAdminCount: 1,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.user.status",
        { userId: "u-other-admin", status: "DISABLED" },
        admin,
      ),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_REQUIRED" });

    expect(
      connection.calls.some((call) => call.sql.startsWith("UPDATE iam_user")),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rejects stale dictionary item updates and rolls back", async () => {
    const connection = affectedRowsConnection(0);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.dictionary.item.update",
        {
          itemId: "item-1",
          label: "项目类型",
          valueText: "CONSULTING",
          sortOrder: 1,
          status: "ENABLED",
          version: 3,
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: "DICTIONARY_ITEM_CONFLICT" });

    const update = connection.calls.find((call) =>
      call.sql.includes("UPDATE sys_dictionary_item SET"),
    );
    expect(update?.params).toEqual([
      "项目类型",
      "CONSULTING",
      1,
      "ENABLED",
      admin.id,
      "item-1",
      3,
    ]);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rejects stale approval node updates and rolls back", async () => {
    const connection = affectedRowsConnection(0);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.approvalNode.update",
        {
          nodeId: "node-1",
          nodeName: "财务复核",
          positionCode: "FINANCE_REVIEWER",
          minimumAmount: 1000,
          maximumAmount: 5000,
          isCc: false,
          status: "ENABLED",
          version: 8,
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_NODE_CONFLICT" });

    const update = connection.calls.find((call) =>
      call.sql.includes("UPDATE wf_template_node SET"),
    );
    expect(update?.params).toEqual([
      "财务复核",
      "FINANCE_REVIEWER",
      1000,
      5000,
      false,
      "ENABLED",
      "node-1",
      8,
    ]);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
