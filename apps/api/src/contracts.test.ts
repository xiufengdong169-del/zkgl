import { describe, expect, it } from "vitest";
import {
  confirmedIncomeAmount,
  contractChangeInput,
  contractInput,
  transitionContract,
} from "./contracts.js";

describe("contracts", () => {
  it("校验合同价税组成", () => {
    const result = contractInput.safeParse({
      contractName: "收入合同",
      contractType: "INCOME",
      projectId: "p1",
      partyAId: "c1",
      partyBId: "c2",
      signingEntityId: "c2",
      taxInclusiveAmount: 106,
      taxExclusiveAmount: 100,
      taxRate: 0.06,
      taxAmount: 5,
      serviceContent: "咨询服务",
      paymentTerms: "验收后付款",
      ownerId: "u1",
    });
    expect(result.success).toBe(false);
  });

  it("合同状态独立推进", () => {
    expect(transitionContract("DRAFT", "SUBMIT")).toBe("APPROVAL_PENDING");
    expect(transitionContract("APPROVAL_PENDING", "SIGN")).toBe(
      "PENDING_SIGNATURE",
    );
    expect(transitionContract("PENDING_SIGNATURE", "START")).toBe("PERFORMING");
  });

  it("暂定金额不进入合同经营收入", () => {
    const amount = confirmedIncomeAmount([
      {
        type: "INCOME",
        amountStatus: "PROVISIONAL",
        taxExclusiveAmount: 100,
        status: "PERFORMING",
      },
      {
        type: "INCOME",
        amountStatus: "CONFIRMED",
        taxExclusiveAmount: 200,
        status: "PERFORMING",
      },
      {
        type: "EXPENSE",
        amountStatus: "CONFIRMED",
        taxExclusiveAmount: 50,
        status: "PERFORMING",
      },
    ]);
    expect(amount).toBe(200);
  });

  it("校验合同变更后的价税组成", () => {
    const base = {
      contractId: "1",
      changeType: "AMOUNT",
      newTaxInclusiveAmount: 106,
      newTaxExclusiveAmount: 100,
      newTaxRate: 0.06,
      newEndOn: null,
      changeContent: "调整服务金额",
      reason: "服务范围扩大",
      effectiveOn: "2026-07-13",
    } as const;
    expect(
      contractChangeInput.safeParse({ ...base, newTaxAmount: 6 }).success,
    ).toBe(true);
    expect(
      contractChangeInput.safeParse({ ...base, newTaxAmount: 5 }).success,
    ).toBe(false);
  });
});
