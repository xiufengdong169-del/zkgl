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
  roleCodes: ["FINANCE"],
  permissionCodes: ["deposit.event.create"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function executorWithExistingDepositEvent(row: Record<string, unknown>) {
  const calls: string[] = [];
  const connection = {
    calls,
    beginTransaction: async () => calls.push("BEGIN"),
    commit: async () => calls.push("COMMIT"),
    rollback: async () => calls.push("ROLLBACK"),
    release: () => calls.push("RELEASE"),
    execute: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM fin_deposit WHERE id="))
        return [[{ projectId: "p-1", amount: "100.00", occupied: "100.00", loss: "0.00", status: "PAID", direction: "RECEIVE" }], []];
      if (sql.includes("FROM prj_project p")) return [[{ id: "p-1" }], []];
      if (sql.includes("FROM fin_deposit_event WHERE idempotency_key"))
        return [[row], []];
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

const depositEventInput = {
  depositId: "deposit-1",
  eventType: "RETURN",
  amount: 50,
  occurredOn: "2026-07-16",
  description: "退回一半",
  idempotencyKey: "deposit-event-key-001",
};

describe("deposit event persistence idempotency", () => {
  it("同一保证金事件重复提交时返回幂等成功", async () => {
    const { calls, executor } = executorWithExistingDepositEvent({
      id: "event-1",
      depositId: "deposit-1",
      eventType: "RETURN",
      amount: "50.00",
    });

    await expect(
      executor.execute("deposit.event.create", depositEventInput, user),
    ).resolves.toEqual({ idempotent: true, id: "event-1" });
    expect(calls).toContain("COMMIT");
  });

  it("保证金事件幂等键被其他事件复用时拒绝", async () => {
    const { calls, executor } = executorWithExistingDepositEvent({
      id: "event-1",
      depositId: "deposit-1",
      eventType: "FORFEIT",
      amount: "50.00",
    });

    await expect(
      executor.execute("deposit.event.create", depositEventInput, user),
    ).rejects.toThrow(AppError);
    await expect(
      executor.execute("deposit.event.create", depositEventInput, user),
    ).rejects.toThrow("幂等键已用于其他保证金事件");
    expect(calls).toContain("ROLLBACK");
  });
});
