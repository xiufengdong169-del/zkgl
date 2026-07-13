import type { SettlementBasis } from "@zkgl/shared";
import { z } from "zod";
import { AppError } from "./errors.js";

export const partnerPlanInput = z
  .object({
    projectId: z.string().min(1),
    partnerId: z.string().min(1),
    ownerId: z.string().min(1),
    settlementMethod: z.enum(["FIXED", "RATIO"]),
    fixedAmount: z.number().nonnegative().nullable().optional(),
    ratio: z.number().min(0).max(1).nullable().optional(),
    calculationBasis: z.enum([
      "FIXED",
      "CONTRACT_REVENUE_EX_TAX",
      "ACTUAL_RECEIPTS",
      "PROJECT_GROSS_PROFIT",
    ]),
    deductibleCostScope: z.array(z.string()).default([]),
    upperLimit: z.number().nonnegative().nullable().optional(),
    lowerLimit: z.number().nonnegative().nullable().optional(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date().nullable().optional(),
    conditions: z.string().trim().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.settlementMethod === "FIXED" && value.fixedAmount == null)
      ctx.addIssue({
        code: "custom",
        path: ["fixedAmount"],
        message: "固定金额方案必须填写金额",
      });
    if (value.settlementMethod === "RATIO" && value.ratio == null)
      ctx.addIssue({
        code: "custom",
        path: ["ratio"],
        message: "比例方案必须填写比例",
      });
  });

export const settlementCreateInput = z.object({
  planId: z.string().min(1),
  periodStartOn: z.iso.date(),
  periodEndOn: z.iso.date(),
  deductionAmount: z.number().nonnegative().default(0),
  invoiceRequirement: z.string().trim().nullable().optional(),
});
export const depositInput = z.object({
  projectId: z.string().min(1),
  bidId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  depositType: z.string().min(1),
  direction: z.enum(["PAY", "RECEIVE"]),
  counterpartyId: z.string().min(1),
  amount: z.number().positive(),
  duePaymentOn: z.iso.date(),
  dueReturnOn: z.iso.date().nullable().optional(),
  account: z.string().trim().max(128).nullable().optional(),
});
export const depositEventInput = z.object({
  depositId: z.string().min(1),
  eventType: z.enum(["PAY", "RETURN", "FORFEIT", "VOID"]),
  amount: z.number().positive(),
  occurredOn: z.iso.date(),
  description: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export const closeApplicationInput = z
  .object({
    projectId: z.string().min(1),
    appliedOn: z.iso.date(),
    completionSummary: z.string().min(2),
    acceptanceConclusion: z.string().min(2),
    archiveCheckPassed: z.boolean(),
    closeDescription: z.string().min(2),
    closeType: z.enum(["NORMAL", "WITH_OPEN_ITEMS"]),
    specialApprovalComment: z.string().trim().nullable().optional(),
    openItems: z
      .array(
        z.object({
          type: z.enum(["RECEIVABLE", "DEPOSIT_RETURN", "RISK_ISSUE", "OTHER"]),
          description: z.string().trim().min(1),
          responsibleId: z.string().min(1),
          dueOn: z.iso.date(),
        }),
      )
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.closeType === "WITH_OPEN_ITEMS" && !value.specialApprovalComment)
      ctx.addIssue({
        code: "custom",
        path: ["specialApprovalComment"],
        message: "带遗留事项结项必须填写特批说明",
      });
  });

export function roundHalfUpFraction(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n || numerator < 0n)
    throw new AppError("INVALID_ROUNDING_INPUT", "舍入参数非法");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export interface SettlementCalculation {
  basis: SettlementBasis;
  basisCents: bigint;
  ratioPpm: bigint | null;
  fixedCents: bigint | null;
  historicalSettledCents: bigint;
  deductionCents: bigint;
  lowerLimitCents: bigint | null;
  upperLimitCents: bigint | null;
}
export function calculateSettlement(input: SettlementCalculation) {
  let theoretical =
    input.basis === "FIXED"
      ? (input.fixedCents ?? 0n)
      : roundHalfUpFraction(
          input.basisCents * (input.ratioPpm ?? 0n),
          1_000_000n,
        );
  if (input.lowerLimitCents !== null && theoretical < input.lowerLimitCents)
    theoretical = input.lowerLimitCents;
  if (input.upperLimitCents !== null && theoretical > input.upperLimitCents)
    theoretical = input.upperLimitCents;
  const available = theoretical - input.historicalSettledCents;
  const net = available - input.deductionCents;
  if (available < 0n || net < 0n)
    throw new AppError(
      "SETTLEMENT_LIMIT_EXCEEDED",
      "历史结算或扣减超过理论累计可结算额",
      409,
    );
  return {
    theoreticalCents: theoretical,
    availableCents: available,
    netSettlementCents: net,
  };
}

export function validateRatioTotal(
  existingRatioPpm: bigint,
  newRatioPpm: bigint,
): void {
  if (existingRatioPpm + newRatioPpm > 1_000_000n)
    throw new AppError(
      "PARTNER_RATIO_EXCEEDED",
      "同一项目同一基数的合作比例合计不得超过 100%",
      409,
    );
}

export function freezeSettlementSnapshot<T extends object>(
  input: T,
): Readonly<T> {
  return Object.freeze(structuredClone(input));
}

export function depositMetrics(input: {
  paidCents: bigint;
  returnedCents: bigint;
  forfeitedCents: bigint;
  lossApproved: boolean;
}) {
  const occupied = input.paidCents - input.returnedCents - input.forfeitedCents;
  if (occupied < 0n)
    throw new AppError(
      "DEPOSIT_BALANCE_INVALID",
      "保证金退回或没收金额超过实缴金额",
      409,
    );
  return {
    occupiedCents: occupied,
    confirmedCostCents: input.lossApproved ? input.forfeitedCents : 0n,
  };
}

export interface CloseCheck {
  acceptancePassed: boolean;
  archivePassed: boolean;
  outstandingReceivable: boolean;
  unreturnedDeposit: boolean;
  openIssues: boolean;
}
export interface OpenItem {
  type: string;
  description: string;
  responsibleId: string;
  dueOn: string;
}
export function validateProjectClose(
  check: CloseCheck,
  type: "NORMAL" | "WITH_OPEN_ITEMS",
  items: OpenItem[],
): void {
  if (!check.acceptancePassed || !check.archivePassed)
    throw new AppError(
      "CLOSE_PREREQUISITE_FAILED",
      "验收或文件归档检查未通过",
      409,
    );
  const hasOpen =
    check.outstandingReceivable || check.unreturnedDeposit || check.openIssues;
  if (hasOpen && type === "NORMAL")
    throw new AppError("OPEN_ITEMS_EXIST", "存在遗留事项，不能普通结项", 409);
  if (
    hasOpen &&
    (items.length === 0 ||
      items.some(
        (item) => !item.description || !item.responsibleId || !item.dueOn,
      ))
  )
    throw new AppError(
      "OPEN_ITEMS_INCOMPLETE",
      "必须完整填写遗留事项责任人和期限",
      409,
    );
  if (hasOpen) {
    const requiredTypes = [
      check.outstandingReceivable ? "RECEIVABLE" : null,
      check.unreturnedDeposit ? "DEPOSIT_RETURN" : null,
      check.openIssues ? "RISK_ISSUE" : null,
    ].filter((type): type is string => Boolean(type));
    const missing = requiredTypes.filter(
      (type) => !items.some((item) => item.type === type),
    );
    if (missing.length)
      throw new AppError(
        "OPEN_ITEM_TYPES_INCOMPLETE",
        "必须逐项登记未收款、未退保证金和未关闭问题",
        409,
      );
  }
}

export function validateSpecialCloseFinalApprover(
  closeType: string,
  positionCode: string,
): void {
  if (closeType === "WITH_OPEN_ITEMS" && positionCode !== "COMPANY_PRINCIPAL")
    throw new AppError(
      "SPECIAL_CLOSE_APPROVER_REQUIRED",
      "带遗留事项结项仅公司负责人可特批",
      403,
    );
}
