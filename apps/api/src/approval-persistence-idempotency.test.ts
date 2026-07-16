import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u-1",
  cloudbaseUid: "cb-1",
  employeeId: "e-1",
  departmentId: "d-1",
  enabled: true,
  roleCodes: ["PROJECT_MANAGER"],
  permissionCodes: ["approval.task.process", "approval.instance.withdraw"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function executorWithExistingHistory(row: Record<string, unknown>) {
  const calls: string[] = [];
  const connection = {
    calls,
    beginTransaction: async () => calls.push("BEGIN"),
    commit: async () => calls.push("COMMIT"),
    rollback: async () => calls.push("ROLLBACK"),
    release: () => calls.push("RELEASE"),
    execute: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM wf_action_history")) return [[row], []];
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return {
    calls,
    executor: new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never),
  };
}

describe("approval persistence idempotency", () => {
  it("keeps withdrawn lead business status inside the lead state machine", async () => {
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
        if (sql.includes("FROM wf_instance WHERE id=? FOR UPDATE")) {
          return [
            [
              {
                id: "instance-lead-1",
                applicantId: "u-1",
                status: "PENDING",
                businessType: "LEAD",
                businessId: "lead-1",
              },
            ],
            [],
          ];
        }
        return [{ affectedRows: 1 }, []];
      },
    };
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "approval.instance.withdraw",
        {
          instanceId: "instance-lead-1",
          actionKey: "withdraw-lead-001",
          comment: "resubmit later",
        },
        user,
      ),
    ).resolves.toEqual({ idempotent: false, status: "WITHDRAWN" });

    const leadUpdate = calls.find((call) =>
      call.sql.startsWith("UPDATE mkt_lead SET status=?"),
    );
    expect(leadUpdate?.params).toEqual(["DRAFT", "u-1", "lead-1"]);
    expect(calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("同一审批任务和动作重复提交时返回幂等成功", async () => {
    const { calls, executor } = executorWithExistingHistory({
      taskId: "task-1",
      action: "APPROVE",
      operatorId: "u-1",
    });

    await expect(
      executor.execute(
        "approval.task.action",
        { taskId: "task-1", action: "APPROVE", actionKey: "key-1" },
        user,
      ),
    ).resolves.toEqual({ idempotent: true, status: "APPROVE" });
    expect(calls).toContain("COMMIT");
  });

  it("审批动作幂等键被其他任务或动作复用时拒绝", async () => {
    const { calls, executor } = executorWithExistingHistory({
      taskId: "other-task",
      action: "APPROVE",
      operatorId: "u-1",
    });

    await expect(
      executor.execute(
        "approval.task.action",
        { taskId: "task-1", action: "REJECT", actionKey: "key-1" },
        user,
      ),
    ).rejects.toThrow(AppError);
    await expect(
      executor.execute(
        "approval.task.action",
        { taskId: "task-1", action: "REJECT", actionKey: "key-1" },
        user,
      ),
    ).rejects.toThrow("幂等键已用于其他审批动作");
    expect(calls).toContain("ROLLBACK");
  });

  it("撤回幂等键被其他实例复用时拒绝", async () => {
    const { executor } = executorWithExistingHistory({
      instanceId: "other-instance",
      action: "WITHDRAW",
      operatorId: "u-1",
    });

    await expect(
      executor.execute(
        "approval.instance.withdraw",
        { instanceId: "instance-1", actionKey: "key-withdraw" },
        user,
      ),
    ).rejects.toThrow("幂等键已用于其他审批动作");
  });

  it("rejects approval action idempotency replay by another operator", async () => {
    const { calls, executor } = executorWithExistingHistory({
      taskId: "task-1",
      action: "APPROVE",
      operatorId: "other-user",
    });

    await expect(
      executor.execute(
        "approval.task.action",
        { taskId: "task-1", action: "APPROVE", actionKey: "key-1" },
        user,
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
    expect(calls).toContain("ROLLBACK");
  });

  it("rejects approval withdraw idempotency replay by another operator", async () => {
    const { calls, executor } = executorWithExistingHistory({
      instanceId: "instance-1",
      action: "WITHDRAW",
      operatorId: "other-user",
    });

    await expect(
      executor.execute(
        "approval.instance.withdraw",
        { instanceId: "instance-1", actionKey: "key-withdraw" },
        user,
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
    expect(calls).toContain("ROLLBACK");
  });
});
