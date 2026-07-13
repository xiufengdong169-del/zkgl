import { describe, expect, it } from "vitest";
import {
  calculateCostMetrics,
  dailyPurchaseInput,
  paymentDetailInput,
  reimbursementTotal,
  salesInvoiceInput,
  validateInvoiceCapacity,
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
});
