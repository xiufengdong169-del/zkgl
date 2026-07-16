import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_MANAGER"],
  permissionCodes: ["approval.task.read", "approval.task.process"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

describe("approval inbox processed statuses", () => {
  it("lists approved, returned and rejected tasks as processed by the current employee", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const connection = {
      calls,
      beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
      commit: async () => calls.push({ sql: "COMMIT", params: [] }),
      rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
      release: () => calls.push({ sql: "RELEASE", params: [] }),
      execute: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM wf_task t JOIN wf_instance i"))
          return [[{ id: "task-1", taskStatus: "REJECTED" }], []];
        return [[], []];
      },
    };
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = (await executor.execute(
      "approval.inbox.list",
      { mode: "PROCESSED", page: 1, pageSize: 20 },
      user,
    )) as { items: Array<{ taskStatus: string }> };

    expect(result.items).toEqual([expect.objectContaining({ taskStatus: "REJECTED" })]);
    const query = calls.find((call) =>
      call.sql.includes("t.status IN ('APPROVED','RETURNED','REJECTED')"),
    );
    expect(query?.params).toEqual(["e1", 20, 0]);
    expect(calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("keeps the acting approver task rejected while cancelling sibling pending tasks", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const connection = {
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
                node_order: 1,
                position_code: "PROJECT_MANAGER",
                assignee_id: "e1",
                task_status: "PENDING",
                instance_status: "PENDING",
                current_node_order: 1,
                applicant_id: "u-applicant",
                configuration_snapshot: "{}",
                business_type: "CUSTOM_BUSINESS",
                business_id: "business-1",
              },
            ],
            [],
          ];
        return [{ affectedRows: 1 }, []];
      },
    };
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "approval.task.action",
        {
          taskId: "task-1",
          action: "REJECT",
          actionKey: "reject-task-1",
          comment: "not acceptable",
        },
        user,
      ),
    ).resolves.toEqual({ idempotent: false, status: "REJECT" });

    const taskUpdate = calls.find((call) =>
      call.sql.startsWith("UPDATE wf_task SET status=CASE WHEN id=? THEN ?"),
    );
    expect(taskUpdate?.params).toEqual([
      "task-1",
      "REJECTED",
      "task-1",
      "e1",
      "instance-1",
    ]);
    expect(calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
