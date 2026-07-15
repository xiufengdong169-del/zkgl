import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["ADMIN"],
  permissionCodes: ["project.export", "project.read"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function fakeConnection() {
  const calls: string[] = [];
  return {
    calls,
    beginTransaction: async () => calls.push("BEGIN"),
    commit: async () => calls.push("COMMIT"),
    rollback: async () => calls.push("ROLLBACK"),
    release: () => calls.push("RELEASE"),
    execute: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("COUNT(*) count FROM prj_project")) return [[{ count: 1000 }], []];
      if (sql.includes("FROM sys_number_rule"))
        return [[{ id: 1, prefix: "DC", serial_length: 4, next_serial: 7, current_year: new Date().getFullYear(), version: 0 }], []];
      if (sql.startsWith("INSERT INTO sys_export_task")) return [{ insertId: 42 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("export task persistence", () => {
  it("creates a background export task instead of rejecting 1000-row project exports", async () => {
    const connection = fakeConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute("report.project.export", {}, user);

    expect(result).toMatchObject({
      mode: "BACKGROUND",
      taskId: "42",
      taskCode: expect.stringMatching(/^DC-/),
      status: "PENDING",
      estimatedRows: 1000,
    });
    expect(connection.calls.some((sql) => sql.startsWith("INSERT INTO sys_export_task"))).toBe(true);
    expect(connection.calls.some((sql) => sql.includes("project_code projectCode"))).toBe(false);
    expect(connection.calls).toContain("COMMIT");
  });
});
