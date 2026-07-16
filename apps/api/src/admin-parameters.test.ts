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

function parameterConnection(valueType = "NUMBER", affectedRows = 1) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT value_type valueType FROM sys_parameter"))
        return [[{ valueType }], []];
      return [{ affectedRows }, []];
    },
  };
}

describe("admin system parameters", () => {
  it("updates a parameter with optimistic version control", async () => {
    const connection = parameterConnection("NUMBER");
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "admin.parameter.update",
      {
        parameterId: "p-export-retention",
        name: "导出文件保留天数",
        parameterValue: "14",
        description: "保留两周",
        status: "ENABLED",
        version: 2,
      },
      admin,
    );

    expect(result).toEqual({ id: "p-export-retention", version: 3 });
    const update = connection.calls.find((call) =>
      call.sql.includes("UPDATE sys_parameter SET"),
    );
    expect(update?.params).toEqual([
      "导出文件保留天数",
      "14",
      "保留两周",
      "ENABLED",
      admin.id,
      "p-export-retention",
      2,
    ]);
  });

  it("rejects invalid number parameter values", async () => {
    const connection = parameterConnection("NUMBER");
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.parameter.update",
        {
          parameterId: "p-export-retention",
          name: "导出文件保留天数",
          parameterValue: "abc",
          description: null,
          status: "ENABLED",
          version: 1,
        },
        admin,
      ),
    ).rejects.toThrow("数字参数值非法");
    expect(connection.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
  });

  it("rejects invalid JSON parameter values before updating", async () => {
    const connection = parameterConnection("JSON");
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.parameter.update",
        {
          parameterId: "p-json",
          name: "JSON 参数",
          parameterValue: "{bad-json",
          description: null,
          status: "ENABLED",
          version: 1,
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: "PARAMETER_VALUE_INVALID" });
    expect(
      connection.calls.some((call) =>
        call.sql.includes("UPDATE sys_parameter SET"),
      ),
    ).toBe(false);
    expect(connection.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
  });

  it("rejects stale parameter versions with optimistic conflict", async () => {
    const connection = parameterConnection("BOOLEAN", 0);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "admin.parameter.update",
        {
          parameterId: "p-boolean",
          name: "布尔参数",
          parameterValue: "true",
          description: null,
          status: "ENABLED",
          version: 3,
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: "PARAMETER_CONFLICT" });

    const update = connection.calls.find((call) =>
      call.sql.includes("UPDATE sys_parameter SET"),
    );
    expect(update?.params).toEqual([
      "布尔参数",
      "true",
      null,
      "ENABLED",
      admin.id,
      "p-boolean",
      3,
    ]);
    expect(connection.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
  });
});
