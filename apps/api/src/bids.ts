import type { BidStatus, BidTaskStatus } from "@zkgl/shared";
import { z } from "zod";

import { AppError } from "./errors.js";

export const bidApplicationInput = z
  .object({
    projectId: z.string().min(1),
    tendererId: z.string().min(1),
    agencyId: z.string().nullable().optional(),
    tenderNumber: z.string().trim().max(128).nullable().optional(),
    projectBudget: z.number().nonnegative().nullable().optional(),
    bidCeiling: z.number().nonnegative().nullable().optional(),
    registrationAt: z.iso.datetime().nullable().optional(),
    documentPurchaseAt: z.iso.datetime().nullable().optional(),
    clarificationAt: z.iso.datetime().nullable().optional(),
    deadlineAt: z.iso.datetime(),
    openingAt: z.iso.datetime().nullable().optional(),
    bidLocation: z.string().trim().max(255).nullable().optional(),
    bidMethod: z.string().trim().min(1).max(64),
    depositAmount: z.number().nonnegative().default(0),
    documentFee: z.number().nonnegative().default(0),
    businessOwnerId: z.string().min(1),
    technicalOwnerId: z.string().min(1),
    pricingOwnerId: z.string().min(1),
    applicationReason: z.string().trim().min(2),
  })
  .refine((value) => !value.openingAt || value.openingAt >= value.deadlineAt, {
    message: "开标时间不得早于投标截止时间",
    path: ["openingAt"],
  });
export const bidResultInput = z
  .object({
    bidId: z.string().min(1),
    openedOn: z.iso.date(),
    quotedAmount: z.number().nonnegative(),
    ranking: z.number().int().positive().nullable().optional(),
    result: z.enum(["WON", "LOST", "FAILED"]),
    winningAmount: z.number().nonnegative().nullable().optional(),
    noticeOn: z.iso.date().nullable().optional(),
    lossReason: z.string().trim().nullable().optional(),
    competitors: z.string().trim().nullable().optional(),
    retrospective: z.string().trim().nullable().optional(),
  })
  .superRefine((v, c) => {
    if (v.result === "WON" && v.winningAmount == null)
      c.addIssue({
        code: "custom",
        path: ["winningAmount"],
        message: "中标必须填写中标金额",
      });
    if (v.result !== "WON" && !v.lossReason)
      c.addIssue({
        code: "custom",
        path: ["lossReason"],
        message: "未中标必须填写原因",
      });
  });

export const bidTaskInput = z.object({
  bidId: z.string().min(1),
  taskType: z.string().trim().min(1).max(64),
  taskName: z.string().trim().min(2).max(255),
  assigneeId: z.string().min(1),
  collaboratorIds: z.array(z.string().min(1)).default([]),
  startsAt: z.iso.datetime().nullable().optional(),
  dueAt: z.iso.datetime(),
  deliveryRequirement: z.string().trim().min(2),
  checkerId: z.string().min(1).nullable().optional(),
});
export const bidCheckInput = z.object({
  bidId: z.string().min(1),
  checkItem: z.string().trim().min(2).max(255),
  checkStandard: z.string().trim().min(2),
  responsibleId: z.string().min(1),
});
export const bidCheckResultInput = z
  .object({
    checkId: z.string().min(1),
    result: z.enum(["PASSED", "FAILED"]),
    issueDescription: z.string().trim().nullable().optional(),
    rectifierId: z.string().min(1).nullable().optional(),
    rectificationDueAt: z.iso.datetime().nullable().optional(),
    recheckResult: z.enum(["PASSED", "FAILED"]).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.result === "FAILED" &&
      (!value.issueDescription ||
        !value.rectifierId ||
        !value.rectificationDueAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "检查不通过时必须填写问题、整改人和整改期限",
      });
  });
export const bidPartnerInput = z
  .object({
    projectId: z.string().min(1).nullable().optional(),
    leadId: z.string().min(1).nullable().optional(),
    partnerId: z.string().min(1),
    finalCustomerId: z.string().min(1),
    cooperationType: z.string().trim().min(1).max(64),
    registrationAt: z.iso.datetime().nullable().optional(),
    quotationAt: z.iso.datetime().nullable().optional(),
    biddingAt: z.iso.datetime().nullable().optional(),
    ourQuotation: z.number().nonnegative().nullable().optional(),
    result: z.string().trim().max(64).nullable().optional(),
    description: z.string().trim().nullable().optional(),
  })
  .refine((value) => Boolean(value.projectId || value.leadId), {
    message: "项目或线索至少填写一个",
    path: ["projectId"],
  });

type BidAction =
  | "SUBMIT_APPROVAL"
  | "APPROVE"
  | "START_PREPARING"
  | "SUBMIT_BID"
  | "OPEN"
  | "WIN"
  | "LOSE"
  | "FAIL"
  | "ABANDON";
const bidTransitions: Record<
  BidStatus,
  Partial<Record<BidAction, BidStatus>>
> = {
  DRAFT: { SUBMIT_APPROVAL: "APPROVAL_PENDING", ABANDON: "ABANDONED" },
  APPROVAL_PENDING: { APPROVE: "PREPARING", ABANDON: "ABANDONED" },
  PREPARING: { SUBMIT_BID: "SUBMITTED", ABANDON: "ABANDONED" },
  SUBMITTED: { OPEN: "OPENED" },
  OPENED: { WIN: "WON", LOSE: "LOST", FAIL: "FAILED" },
  WON: {},
  LOST: {},
  FAILED: {},
  ABANDONED: {},
};
export function transitionBid(status: BidStatus, action: BidAction): BidStatus {
  const next = bidTransitions[status][action];
  if (!next)
    throw new AppError(
      "INVALID_BID_TRANSITION",
      `投标状态 ${status} 不允许执行 ${action}`,
      409,
    );
  return next;
}

type BidTaskAction =
  "ASSIGN" | "START" | "SUBMIT_CHECK" | "COMPLETE" | "MARK_OVERDUE" | "CANCEL";
const taskTransitions: Record<
  BidTaskStatus,
  Partial<Record<BidTaskAction, BidTaskStatus>>
> = {
  UNASSIGNED: { ASSIGN: "PENDING", CANCEL: "CANCELLED" },
  PENDING: {
    START: "IN_PROGRESS",
    MARK_OVERDUE: "OVERDUE",
    CANCEL: "CANCELLED",
  },
  IN_PROGRESS: {
    SUBMIT_CHECK: "PENDING_CHECK",
    MARK_OVERDUE: "OVERDUE",
    CANCEL: "CANCELLED",
  },
  PENDING_CHECK: { COMPLETE: "COMPLETED", MARK_OVERDUE: "OVERDUE" },
  COMPLETED: {},
  OVERDUE: { START: "IN_PROGRESS", CANCEL: "CANCELLED" },
  CANCELLED: {},
};
export function transitionBidTask(
  status: BidTaskStatus,
  action: BidTaskAction,
): BidTaskStatus {
  const next = taskTransitions[status][action];
  if (!next)
    throw new AppError(
      "INVALID_BID_TASK_TRANSITION",
      `投标任务状态 ${status} 不允许执行 ${action}`,
      409,
    );
  return next;
}
