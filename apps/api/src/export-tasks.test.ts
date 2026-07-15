import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { processPendingProjectExportTasks } from "./export-tasks.js";
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
  const paramCalls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    paramCalls,
    beginTransaction: async () => calls.push("BEGIN"),
    commit: async () => calls.push("COMMIT"),
    rollback: async () => calls.push("ROLLBACK"),
    release: () => calls.push("RELEASE"),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      paramCalls.push({ sql, params });
      if (sql.includes("COUNT(*) count FROM prj_project")) return [[{ count: 1000 }], []];
      if (sql.includes("FROM iam_project_grant"))
        return [[{ projectId: "p-temp" }], []];
      if (sql.includes("FROM sys_number_rule"))
        return [[{ id: 1, prefix: "DC", serial_length: 4, next_serial: 7, current_year: new Date().getFullYear(), version: 0 }], []];
      if (sql.startsWith("INSERT INTO sys_export_task")) return [{ insertId: 42 }, []];
      if (sql.includes("FROM sys_export_task t"))
        return [[{ id: "7", taskCode: "DC-2026-0007", exportType: "PROJECT_OPERATING", estimatedRows: 1000, status: "COMPLETED", fileId: "88", logicalName: "DC-2026-0007.csv" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("export task persistence", () => {
  it("lists the current user background export tasks with the generated file id", async () => {
    const connection = fakeConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute("report.exportTasks", { page: 1, pageSize: 20 }, user) as { items: Array<Record<string, unknown>> };

    expect(result.items[0]).toMatchObject({
      taskCode: "DC-2026-0007",
      status: "COMPLETED",
      fileId: "88",
    });
  });

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
    const insertCall = connection.paramCalls.find((call) =>
      call.sql.startsWith("INSERT INTO sys_export_task"),
    )!;
    expect(JSON.parse(String(insertCall.params[4]))).toMatchObject({
      employeeId: "e1",
      temporaryProjectIds: ["p-temp"],
    });
    expect(connection.calls.some((sql) => sql.includes("project_code projectCode"))).toBe(false);
    expect(connection.calls).toContain("COMMIT");
  });

  it("uses explicit project and department scopes when estimating export size", async () => {
    const connection = fakeConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);
    const scopedUser: SessionUser = {
      ...user,
      dataScopes: [
        { type: "PROJECT", projectIds: ["p9"] },
        { type: "DEPARTMENT", departmentIds: ["d2"] },
      ],
    };

    await executor.execute("report.project.export", {}, scopedUser);

    const countCall = connection.paramCalls.find((call) =>
      call.sql.includes("COUNT(*) count FROM prj_project"),
    );
    expect(countCall!.sql).toContain("JOIN org_employee pm");
    expect(countCall!.sql).toContain("p.id IN (?)");
    expect(countCall!.sql).toContain("pm.department_id IN (?)");
    expect(countCall!.params).toEqual([0, "e1", "e1", "p9", "d2", "e1"]);
  });
});

function exportWorkerConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM sys_parameter"))
        return [[{ paramValue: "21" }], []];
      if (sql.includes("FROM sys_export_task"))
        return [[{ id: 7, taskCode: "DC-2026-0007", requesterId: "u1", permissionSnapshot: JSON.stringify({ employeeId: "e1", dataScopes: [{ type: "PROJECT", projectIds: ["p9"] }, { type: "DEPARTMENT", departmentIds: ["d2"] }], temporaryProjectIds: ["p-temp"] }) }], []];
      if (sql.includes("FROM prj_project p"))
        return [[{ projectCode: "=ZK-001", projectName: "项目A", customerName: "客户A", status: "IN_PROGRESS", estimatedRevenue: "100.00", estimatedCost: "20.00", confirmedIncome: "80.00", receivedAmount: "60.00" }], []];
      if (sql.startsWith("INSERT INTO file_object")) return [{ insertId: 88 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("export task worker", () => {
  it("uploads CSV output and links the finished task to a private file", async () => {
    const connection = exportWorkerConnection();
    const uploads: Array<{ cloudPath: string; content: Buffer }> = [];

    const result = await processPendingProjectExportTasks(connection as never, {
      uploadFile: async (cloudPath, content) => {
        uploads.push({ cloudPath, content });
        return "cloud://exports/DC-2026-0007.csv";
      },
    });

    expect(result).toEqual({ processed: 1, completed: 1, failed: 0 });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.cloudPath).toBe("exports/DC-2026-0007.csv");
    expect(uploads[0]!.content.toString("utf8")).toContain('"\'=ZK-001"');
    const projectQuery = connection.calls.find((call) => call.sql.includes("FROM prj_project p"));
    expect(projectQuery!.sql).toContain("p.id IN (?)");
    expect(projectQuery!.sql).toContain("pm.department_id IN (?)");
    expect(projectQuery!.params).toEqual([0, "e1", "e1", "p9", "d2", "p-temp"]);
    expect(connection.calls.some((call) => call.sql.startsWith("INSERT INTO file_object"))).toBe(true);
    expect(connection.calls.some((call) => call.sql.startsWith("INSERT INTO file_version"))).toBe(true);
    expect(
      connection.calls.some(
        (call) =>
          call.sql.includes("status='COMPLETED'") &&
          call.sql.includes("INTERVAL 21 DAY"),
      ),
    ).toBe(true);
  });
});
