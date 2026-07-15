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
  permissionCodes: ["payment.detail.create"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function executorWithExistingPaymentDetail(row: Record<string, unknown>) {
  const calls: string[] = [];
  const connection = {
    calls,
    beginTransaction: async () => calls.push("BEGIN"),
    commit: async () => calls.push("COMMIT"),
    rollback: async () => calls.push("ROLLBACK"),
    release: () => calls.push("RELEASE"),
    execute: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM fin_payment_detail")) return [[row], []];
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

const paymentDetailInput = {
  paymentId: "pay-1",
  paidOn: "2026-07-16",
  amount: 100,
  payingAccount: "付款户",
  receivingAccount: "6222",
  bankReference: "BANK-001",
  idempotencyKey: "payment-key-001",
};

describe("payment detail persistence idempotency", () => {
  it("同一付款明细重复提交时返回幂等成功", async () => {
    const { calls, executor } = executorWithExistingPaymentDetail({
      id: "detail-1",
      paymentId: "pay-1",
      amount: "100.00",
      receivingAccount: "6222",
      bankReference: "BANK-001",
    });

    await expect(
      executor.execute("payment.detail.create", paymentDetailInput, user),
    ).resolves.toEqual({ idempotent: true, id: "detail-1" });
    expect(calls).toContain("COMMIT");
  });

  it("付款明细幂等键被其他付款单或流水复用时拒绝", async () => {
    const { calls, executor } = executorWithExistingPaymentDetail({
      id: "detail-1",
      paymentId: "other-pay",
      amount: "100.00",
      receivingAccount: "6222",
      bankReference: "BANK-001",
    });

    await expect(
      executor.execute("payment.detail.create", paymentDetailInput, user),
    ).rejects.toThrow(AppError);
    await expect(
      executor.execute("payment.detail.create", paymentDetailInput, user),
    ).rejects.toThrow("幂等键已用于其他付款明细");
    expect(calls).toContain("ROLLBACK");
  });
});
