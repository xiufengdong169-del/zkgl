import type { ContractStatus } from "@zkgl/shared";
import { z } from "zod";

import { AppError } from "./errors.js";

export const contractInput = z
  .object({
    contractName: z.string().trim().min(2).max(255),
    contractType: z.enum(["INCOME", "EXPENSE"]),
    projectId: z.string().min(1),
    partyAId: z.string().min(1),
    partyBId: z.string().min(1),
    signingEntityId: z.string().min(1),
    taxInclusiveAmount: z.number().nonnegative(),
    taxExclusiveAmount: z.number().nonnegative(),
    taxRate: z.number().min(0).max(1),
    taxAmount: z.number().nonnegative(),
    amountStatus: z.enum(["PROVISIONAL", "CONFIRMED"]).default("CONFIRMED"),
    signedOn: z.iso.date().nullable().optional(),
    effectiveOn: z.iso.date().nullable().optional(),
    expiresOn: z.iso.date().nullable().optional(),
    serviceContent: z.string().trim().min(2),
    paymentTerms: z.string().trim().min(2),
    invoiceTerms: z.string().trim().nullable().optional(),
    parentContractId: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      Math.abs(
        value.taxInclusiveAmount - value.taxExclusiveAmount - value.taxAmount,
      ) <= 0.02,
    {
      message: "含税金额必须等于不含税金额与税额之和",
      path: ["taxAmount"],
    },
  )
  .refine(
    (value) =>
      !value.effectiveOn ||
      !value.expiresOn ||
      value.expiresOn >= value.effectiveOn,
    {
      message: "到期日期不得早于生效日期",
      path: ["expiresOn"],
    },
  );

export const contractChangeInput = z
  .object({
    contractId: z.string().min(1),
    changeType: z.enum(["AMOUNT", "TERM", "SCOPE", "COMPOSITE"]),
    newTaxInclusiveAmount: z.number().nonnegative(),
    newTaxExclusiveAmount: z.number().nonnegative(),
    newTaxRate: z.number().min(0).max(1),
    newTaxAmount: z.number().nonnegative(),
    newEndOn: z.iso.date().nullable().optional(),
    changeContent: z.string().trim().min(2),
    reason: z.string().trim().min(2),
    effectiveOn: z.iso.date(),
  })
  .refine(
    (value) =>
      Math.abs(
        value.newTaxInclusiveAmount -
          value.newTaxExclusiveAmount -
          value.newTaxAmount,
      ) <= 0.02,
    {
      message: "变更后含税金额必须等于不含税金额与税额之和",
      path: ["newTaxAmount"],
    },
  );

export function resolveContractAmountStatus(
  currentStatus: "PROVISIONAL" | "CONFIRMED",
  changeType: "AMOUNT" | "TERM" | "SCOPE" | "COMPOSITE",
): "PROVISIONAL" | "CONFIRMED" {
  return changeType === "AMOUNT" || changeType === "COMPOSITE"
    ? "CONFIRMED"
    : currentStatus;
}

export const contractMilestoneInput = z.object({
  contractId: z.string().min(1),
  milestoneType: z.enum([
    "DELIVERY",
    "ACCEPTANCE",
    "INVOICE",
    "PAYMENT",
    "OTHER",
  ]),
  milestoneName: z.string().trim().min(2).max(255),
  plannedOn: z.iso.date(),
  plannedAmount: z.number().nonnegative().nullable().optional(),
  conditionDescription: z.string().trim().nullable().optional(),
});

type ContractAction =
  | "SUBMIT"
  | "RETURN"
  | "REJECT"
  | "WITHDRAW"
  | "SIGN"
  | "START"
  | "COMPLETE"
  | "CHANGE"
  | "TERMINATE"
  | "VOID";
const transitions: Record<
  ContractStatus,
  Partial<Record<ContractAction, ContractStatus>>
> = {
  DRAFT: { SUBMIT: "APPROVAL_PENDING", VOID: "VOID" },
  APPROVAL_PENDING: {
    RETURN: "RETURNED",
    REJECT: "REJECTED",
    WITHDRAW: "WITHDRAWN",
    SIGN: "PENDING_SIGNATURE",
  },
  PENDING_SIGNATURE: { START: "PERFORMING", VOID: "VOID" },
  PERFORMING: {
    COMPLETE: "COMPLETED",
    CHANGE: "CHANGED",
    TERMINATE: "TERMINATED",
  },
  CHANGED: { START: "PERFORMING", TERMINATE: "TERMINATED" },
  RETURNED: { SUBMIT: "APPROVAL_PENDING", VOID: "VOID" },
  REJECTED: { SUBMIT: "APPROVAL_PENDING" },
  WITHDRAWN: { SUBMIT: "APPROVAL_PENDING" },
  COMPLETED: {},
  TERMINATED: {},
  VOID: {},
};
export function transitionContract(
  status: ContractStatus,
  action: ContractAction,
): ContractStatus {
  const next = transitions[status][action];
  if (!next)
    throw new AppError(
      "INVALID_CONTRACT_TRANSITION",
      `合同状态 ${status} 不允许执行 ${action}`,
      409,
    );
  return next;
}

export function confirmedIncomeAmount(
  contracts: Array<{
    type: "INCOME" | "EXPENSE";
    amountStatus: "PROVISIONAL" | "CONFIRMED";
    taxExclusiveAmount: number;
    status: ContractStatus;
  }>,
): number {
  const effectiveStatuses: ContractStatus[] = [
    "PENDING_SIGNATURE",
    "PERFORMING",
    "COMPLETED",
  ];
  return contracts
    .filter(
      (item) =>
        item.type === "INCOME" &&
        item.amountStatus === "CONFIRMED" &&
        effectiveStatuses.includes(item.status),
    )
    .reduce((sum, item) => sum + item.taxExclusiveAmount, 0);
}
