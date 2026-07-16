import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const approver: SessionUser = {
  id: "u-approver",
  cloudbaseUid: "cb-approver",
  employeeId: "e-approver",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["APPROVER"],
  permissionCodes: ["approval.task.process"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function approvalConnection(options: {
  closeType: "NORMAL" | "WITH_OPEN_ITEMS";
  positionCode: string;
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
      if (sql.includes("FROM wf_action_history")) return [[], []];
      if (sql.includes("FROM wf_task t JOIN wf_instance i"))
        return [
          [
            {
              task_id: "task-1",
              instance_id: "instance-1",
              node_order: 3,
              position_code: options.positionCode,
              assignee_id: "e-approver",
              task_status: "PENDING",
              instance_status: "PENDING",
              current_node_order: 3,
              applicant_id: "e-applicant",
              configuration_snapshot: "{}",
              business_type: "PROJECT_CLOSE",
              business_id: "close-1",
            },
          ],
          [],
        ];
      if (sql.includes("MIN(node_order) next_order"))
        return [[{ next_order: null }], []];
      if (sql.includes("SELECT close_type closeType"))
        return [[{ closeType: options.closeType }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

function executorFor(options: {
  closeType: "NORMAL" | "WITH_OPEN_ITEMS";
  positionCode: string;
}) {
  const connection = approvalConnection(options);
  const executor = new MySqlActionExecutor({
    getConnection: async () => connection,
  } as never);
  return { connection, executor };
}

const approvalInput = {
  taskId: "task-1",
  action: "APPROVE",
  actionKey: "close-final-approve-001",
};

describe("project close approval final approver guard", () => {
  it("rejects special close approval when the final approver is not company principal", async () => {
    const { connection, executor } = executorFor({
      closeType: "WITH_OPEN_ITEMS",
      positionCode: "OPERATIONS_MANAGER",
    });

    await expect(
      executor.execute("approval.task.action", approvalInput, approver),
    ).rejects.toMatchObject({ code: "SPECIAL_CLOSE_APPROVER_REQUIRED" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE wf_instance SET status='APPROVED'"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE prj_close_application SET"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE prj_project p JOIN prj_close_application"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("allows company principal to finally approve special close applications", async () => {
    const { connection, executor } = executorFor({
      closeType: "WITH_OPEN_ITEMS",
      positionCode: "COMPANY_PRINCIPAL",
    });

    await expect(
      executor.execute("approval.task.action", approvalInput, approver),
    ).resolves.toEqual({ idempotent: false, status: "APPROVE" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE wf_instance SET status='APPROVED'"),
      ),
    ).toBe(true);
    const closeUpdate = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE prj_close_application SET"),
    );
    expect(closeUpdate?.params).toEqual(["CLOSED", "u-approver", "close-1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE prj_project p JOIN prj_close_application"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
