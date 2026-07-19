import { describe, expect, it } from "vitest";
import {
  calculateSettlement,
  depositEventInput,
  depositMetrics,
  freezeSettlementSnapshot,
  roundHalfUpFraction,
  validateProjectClose,
  validateRatioTotal,
  validateSpecialCloseFinalApprover,
} from "./settlements.js";

describe("partner settlement and close", () => {
  it("使用 ROUND_HALF_UP 精确到分", () =>
    expect(roundHalfUpFraction(1005n, 10n)).toBe(101n));
  it("AC-04 按实际收款20%扣除历史结算计算本次上限", () => {
    const result = calculateSettlement({
      basis: "ACTUAL_RECEIPTS",
      basisCents: 100_000_000n,
      ratioPpm: 200_000n,
      fixedCents: null,
      historicalSettledCents: 10_000_000n,
      deductionCents: 0n,
      lowerLimitCents: null,
      upperLimitCents: null,
    });
    expect(result.availableCents).toBe(10_000_000n);
  });
  it("合作比例合计不得超过100%", () =>
    expect(() => validateRatioTotal(900_000n, 100_001n)).toThrow());
  it("AC-11 历史结算快照不受方案修改影响", () => {
    const source = { ratioPpm: 200_000, rule: { basis: "ACTUAL_RECEIPTS" } };
    const snapshot = freezeSettlementSnapshot(source);
    source.ratioPpm = 300_000;
    expect(snapshot.ratioPpm).toBe(200_000);
  });
  it("AC-06 保证金支付退回不计成本", () =>
    expect(
      depositMetrics({
        paidCents: 500_000n,
        returnedCents: 500_000n,
        forfeitedCents: 0n,
        lossApproved: false,
      }),
    ).toEqual({ occupiedCents: 0n, confirmedCostCents: 0n }));
  it("AC-07 没收审批后才计成本", () => {
    expect(
      depositMetrics({
        paidCents: 500_000n,
        returnedCents: 0n,
        forfeitedCents: 500_000n,
        lossApproved: false,
      }).confirmedCostCents,
    ).toBe(0n);
    expect(
      depositMetrics({
        paidCents: 500_000n,
        returnedCents: 0n,
        forfeitedCents: 500_000n,
        lossApproved: true,
      }).confirmedCostCents,
    ).toBe(500_000n);
  });
  it("没收事件只登记申请事实，不接受前端伪造审批结果", () => {
    const parsed = depositEventInput.parse({
      depositId: "1",
      eventType: "FORFEIT",
      amount: 100,
      occurredOn: "2026-07-13",
      idempotencyKey: "deposit-loss-001",
      lossApprovalPassed: true,
    });
    expect(parsed.eventType).toBe("FORFEIT");
    expect(parsed).not.toHaveProperty("lossApprovalPassed");
    expect(() =>
      depositEventInput.parse({ ...parsed, eventType: "CONFIRM_LOSS" }),
    ).toThrow();
  });
  it("AC-14 普通结项必须通过验收归档且不存在遗留事项", () => {
    const cleanCheck = {
      acceptancePassed: true,
      archivePassed: true,
      outstandingReceivable: false,
      outstandingPayable: false,
      unreturnedDeposit: false,
      openIssues: false,
    };
    expect(() => validateProjectClose(cleanCheck, "NORMAL", [])).not.toThrow();
    expect(() =>
      validateProjectClose(
        { ...cleanCheck, acceptancePassed: false },
        "NORMAL",
        [],
      ),
    ).toThrow("验收或文件归档检查未通过");
    expect(() =>
      validateProjectClose(
        { ...cleanCheck, archivePassed: false },
        "NORMAL",
        [],
      ),
    ).toThrow("验收或文件归档检查未通过");
    expect(() =>
      validateProjectClose(
        { ...cleanCheck, outstandingReceivable: true },
        "NORMAL",
        [],
      ),
    ).toThrow("存在遗留事项");
  });
  it("AC-15 可发起完整的带遗留事项结项，但仅公司负责人可最终特批", () => {
    const check = {
      acceptancePassed: true,
      archivePassed: true,
      outstandingReceivable: true,
      outstandingPayable: true,
      unreturnedDeposit: true,
      openIssues: true,
    };
    expect(() => validateProjectClose(check, "NORMAL", [])).toThrow();
    const items = [
      {
        type: "RECEIVABLE",
        description: "催收",
        responsibleId: "u1",
        dueOn: "2026-08-01",
      },
      {
        type: "PAYABLE",
        description: "完成应付款支付",
        responsibleId: "u1",
        dueOn: "2026-08-01",
      },
      {
        type: "DEPOSIT_RETURN",
        description: "追踪保证金退回",
        responsibleId: "u1",
        dueOn: "2026-08-01",
      },
      {
        type: "RISK_ISSUE",
        description: "关闭问题",
        responsibleId: "u1",
        dueOn: "2026-08-01",
      },
    ];
    expect(() =>
      validateProjectClose(check, "WITH_OPEN_ITEMS", items.slice(0, 1)),
    ).toThrow("必须逐项登记");
    expect(() =>
      validateProjectClose(check, "WITH_OPEN_ITEMS", items),
    ).not.toThrow();
    expect(() =>
      validateSpecialCloseFinalApprover(
        "WITH_OPEN_ITEMS",
        "OPERATIONS_MANAGER",
      ),
    ).toThrow("仅公司负责人");
    expect(() =>
      validateSpecialCloseFinalApprover("WITH_OPEN_ITEMS", "COMPANY_PRINCIPAL"),
    ).not.toThrow();
  });
});
