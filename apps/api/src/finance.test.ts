import { describe, expect, it } from "vitest";
import {
  calculateCostMetrics,
  dailyPurchaseInput,
  paymentDetailInput,
  reimbursementTotal,
  salesInvoiceInput,
  validateInvoiceCapacity,
  validatePaymentSource,
  validateReceiptInvoiceAllocation,
} from "./finance.js";

describe("finance invariants", () => {
  it("AC-01 阻止累计开票超过合同金额", () => {
    expect(validateInvoiceCapacity(100, 80, 20)).toBe(20);
    expect(() => validateInvoiceCapacity(100, 80, 30)).toThrow(
      "超过合同可开票余额",
    );
  });
  it("AC-02/03 支持多对多核销并限制双方余额", () => {
    expect(() =>
      validateReceiptInvoiceAllocation({
        receiptAmount: 60,
        receiptAllocated: 50,
        invoiceAmount: 50,
        invoiceAllocated: 40,
        allocationAmount: 10,
        receiptType: "NORMAL",
      }),
    ).not.toThrow();
    expect(() =>
      validateReceiptInvoiceAllocation({
        receiptAmount: 60,
        receiptAllocated: 50,
        invoiceAmount: 50,
        invoiceAllocated: 40,
        allocationAmount: 11,
        receiptType: "NORMAL",
      }),
    ).toThrow();
  });
  it("预收款暂不核销", () =>
    expect(() =>
      validateReceiptInvoiceAllocation({
        receiptAmount: 10,
        receiptAllocated: 0,
        invoiceAmount: 10,
        invoiceAllocated: 0,
        allocationAmount: 10,
        receiptType: "ADVANCE",
      }),
    ).toThrow());
  it("AC-08 报销总额只由明细汇总", () =>
    expect(
      reimbursementTotal([{ amount: 1000 }, { amount: 2000 }, { amount: 500 }]),
    ).toBe(3500));
  it("AC-05 付款不重复增加已确认成本", () => {
    const before = calculateCostMetrics({
      approvedReimbursement: 0,
      approvedPartnerSettlement: 10,
      confirmedExpensePerformance: 0,
      confirmedDepositLoss: 0,
      actualOperatingPayments: 0,
    });
    const after = calculateCostMetrics({
      approvedReimbursement: 0,
      approvedPartnerSettlement: 10,
      confirmedExpensePerformance: 0,
      confirmedDepositLoss: 0,
      actualOperatingPayments: 10,
    });
    expect(before.confirmedCost).toBe(10);
    expect(after.confirmedCost).toBe(10);
    expect(after.paidAmount).toBe(10);
  });
  it("日常采购关联合同时必须选择合同", () => {
    const base = {
      applicantId: "e1",
      departmentId: "d1",
      purchaseType: "OFFICE",
      itemDescription: "办公用品",
      quantity: 1,
      budgetAmount: 100,
      purpose: "日常办公",
      expectedOn: "2026-07-20",
      paymentMethod: "TRANSFER",
    };
    expect(() =>
      dailyPurchaseInput.parse({ ...base, contractRelated: true }),
    ).toThrow("必须选择合同");
    expect(
      dailyPurchaseInput.parse({ ...base, contractRelated: false })
        .contractRelated,
    ).toBe(false);
    expect(
      dailyPurchaseInput.parse({ ...base, contractRelated: false }),
    ).not.toHaveProperty("applicantId");
  });
  it("销项发票价税合计必须平衡", () => {
    const invoice = {
      applicationId: "1",
      invoiceNumber: "INV-1",
      invoicedOn: "2026-07-13",
      taxInclusiveAmount: 106,
      taxExclusiveAmount: 100,
      taxAmount: 6,
      buyerName: "客户",
    };
    expect(salesInvoiceInput.parse(invoice).taxAmount).toBe(6);
    expect(() => salesInvoiceInput.parse({ ...invoice, taxAmount: 5 })).toThrow(
      "价税合计",
    );
  });
  it("实际付款明细要求幂等键和流水号", () => {
    expect(
      paymentDetailInput.parse({
        paymentId: "1",
        paidOn: "2026-07-13",
        amount: 100,
        payingAccount: "A",
        receivingAccount: "B",
        bankReference: "BANK-1",
        idempotencyKey: "payment-001",
      }).amount,
    ).toBe(100);
    expect(() =>
      paymentDetailInput.parse({
        paymentId: "1",
        paidOn: "2026-07-13",
        amount: 100,
        payingAccount: "A",
        receivingAccount: "B",
        bankReference: "",
        idempotencyKey: "short",
      }),
    ).toThrow();
  });
  it("已审批付款来源必须原项目、原收款信息、原金额且只能生成一次", () => {
    const valid = {
      sourceType: "REIMBURSEMENT" as const,
      source: {
        projectId: "p1",
        recipientName: "张三",
        receivingAccount: "6222",
        approvalStatus: "APPROVED",
        paymentStatus: "UNPAID",
        sourceAmount: "100.00",
      },
      application: {
        projectId: "p1",
        recipientName: "张三",
        receivingAccount: "6222",
        requestedAmount: 100,
      },
      alreadyUsed: false,
    };
    expect(() => validatePaymentSource(valid)).not.toThrow();
    expect(() =>
      validatePaymentSource({
        ...valid,
        application: { ...valid.application, requestedAmount: 99 },
      }),
    ).toThrow("申请金额与付款来源不一致");
    expect(() =>
      validatePaymentSource({ ...valid, alreadyUsed: true }),
    ).toThrow("已生成付款申请");
    expect(() =>
      validatePaymentSource({
        ...valid,
        source: { ...valid.source, approvalStatus: "DRAFT" },
      }),
    ).toThrow("尚未审批通过");
  });

  it("保证金审批后才能生成唯一付款申请", () => {
    const valid = {
      sourceType: "DEPOSIT" as const,
      source: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        approvalStatus: "PENDING_PAYMENT",
        paymentStatus: "PENDING_PAYMENT",
        sourceAmount: "100.00",
      },
      application: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        requestedAmount: 100,
      },
      alreadyUsed: false,
    };
    expect(() => validatePaymentSource(valid)).not.toThrow();
    expect(() =>
      validatePaymentSource({
        ...valid,
        source: { ...valid.source, approvalStatus: "DRAFT" },
      }),
    ).toThrow("尚未审批通过");
    expect(() =>
      validatePaymentSource({
        ...valid,
        application: { ...valid.application, receivingAccount: "other" },
      }),
    ).toThrow("收款账户");
  });

  it("支出合同必须已履约且累计付款申请不得超过合同金额", () => {
    const valid = {
      sourceType: "EXPENSE_CONTRACT" as const,
      source: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        approvalStatus: "PERFORMING",
        paymentStatus: "UNPAID",
        sourceAmount: "1000.00",
      },
      application: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        requestedAmount: 400,
      },
      alreadyUsed: true,
      alreadyAppliedAmount: 600,
    };
    expect(() => validatePaymentSource(valid)).not.toThrow();
    expect(() =>
      validatePaymentSource({
        ...valid,
        application: { ...valid.application, requestedAmount: 400.01 },
      }),
    ).toThrow("超过支出合同可申请付款余额");
    expect(() =>
      validatePaymentSource({
        ...valid,
        source: { ...valid.source, approvalStatus: "PENDING_SIGNATURE" },
      }),
    ).toThrow("尚未审批通过");
    expect(() =>
      validatePaymentSource({
        ...valid,
        source: { ...valid.source, receivingAccount: null },
      }),
    ).toThrow("未维护收款账户");
  });

  it("日常采购必须按已审批预算向原供应商生成唯一付款申请", () => {
    const valid = {
      sourceType: "PURCHASE" as const,
      source: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        approvalStatus: "APPROVED",
        paymentStatus: "UNPAID",
        sourceAmount: "300.00",
      },
      application: {
        projectId: "p1",
        recipientName: "供应商",
        receivingAccount: "6222",
        requestedAmount: 300,
      },
      alreadyUsed: false,
    };
    expect(() => validatePaymentSource(valid)).not.toThrow();
    expect(() =>
      validatePaymentSource({ ...valid, alreadyUsed: true }),
    ).toThrow("已生成付款申请");
    expect(() =>
      validatePaymentSource({
        ...valid,
        application: { ...valid.application, recipientName: "其他供应商" },
      }),
    ).toThrow("收款方与付款来源不一致");
  });
});
