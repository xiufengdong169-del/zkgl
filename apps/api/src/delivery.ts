import type { ProjectStartType, RiskStatus, StageStatus } from "@zkgl/shared";
import { z } from "zod";
import { AppError } from "./errors.js";

export const projectStartInput = z
  .object({
    projectId: z.string().min(1),
    startType: z.enum(["NORMAL", "EARLY"]),
    startedOn: z.iso.date(),
    projectManagerId: z.string().min(1),
    objectives: z.string().trim().min(2),
    scopeDescription: z.string().trim().min(2),
    communicationMechanism: z.string().trim().min(2),
    deliverables: z.string().trim().min(2),
    risks: z.string().trim().nullable().optional(),
    currentContractStatus: z.string().nullable().optional(),
    earlyStartReason: z.string().trim().nullable().optional(),
    startBasis: z.string().trim().nullable().optional(),
    estimatedContractAmount: z.number().nonnegative().nullable().optional(),
    expectedSigningOn: z.iso.date().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.startType === "EARLY") {
      for (const [key, data] of [
        ["earlyStartReason", value.earlyStartReason],
        ["startBasis", value.startBasis],
        ["expectedSigningOn", value.expectedSigningOn],
      ] as const) {
        if (!data)
          context.addIssue({
            code: "custom",
            path: [key],
            message: "提前启动必须填写该项",
          });
      }
    }
  });

export const stageInput = z
  .object({
    projectId: z.string().min(1),
    stageName: z.string().trim().min(1).max(255),
    stageOrder: z.number().int().positive(),
    plannedStartOn: z.iso.date(),
    plannedEndOn: z.iso.date(),
    ownerId: z.string().min(1),
    objective: z.string().trim().min(1),
    deliverables: z.string().trim().min(1),
  })
  .refine((v) => v.plannedEndOn >= v.plannedStartOn, {
    path: ["plannedEndOn"],
    message: "计划结束日期不得早于开始日期",
  });
export const progressInput = z.object({
  projectId: z.string().min(1),
  stageId: z.string().nullable().optional(),
  recordedOn: z.iso.date(),
  completedWork: z.string().trim().min(1),
  currentProgress: z.number().min(0).max(100),
  nextPlan: z.string().trim().min(1),
  deviationDescription: z.string().trim().nullable().optional(),
  coordinationNeeded: z.string().trim().nullable().optional(),
  recorderId: z.string().min(1),
});
export const riskInput = z.object({
  projectId: z.string().min(1),
  itemType: z.enum(["ISSUE", "RISK"]),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  impact: z.string().trim().min(1),
  ownerId: z.string().min(1),
  discoveredOn: z.iso.date(),
  plannedResolutionOn: z.iso.date(),
  measures: z.string().trim().min(1),
});
export const deliverableInput = z.object({
  projectId: z.string().min(1),
  stageId: z.string().nullable().optional(),
  deliverableName: z.string().trim().min(1).max(255),
  deliverableType: z.string().trim().min(1).max(64),
  deliverableVersion: z.string().trim().min(1).max(64),
  submittedOn: z.iso.date(),
  submitterId: z.string().min(1),
  recipient: z.string().trim().max(255).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});
export const deliverableConfirmInput = z.object({
  deliverableId: z.string().min(1),
  confirmationResult: z.enum(["ACCEPTED", "REJECTED"]),
  comment: z.string().trim().max(1000).nullable().optional(),
});
export const acceptanceInput = z
  .object({
    projectId: z.string().min(1),
    contractId: z.string().nullable().optional(),
    acceptanceType: z.string().trim().min(1).max(64),
    appliedOn: z.iso.date(),
    acceptanceScope: z.string().trim().min(2),
    acceptanceBasis: z.string().trim().min(2),
    acceptedOn: z.iso.date(),
    acceptanceOrganization: z.string().trim().min(1).max(255),
    result: z.enum(["PASSED", "FAILED", "CONDITIONAL"]),
    remainingIssues: z.string().trim().nullable().optional(),
    rectificationDueOn: z.iso.date().nullable().optional(),
  })
  .superRefine((v, c) => {
    if (
      v.result === "CONDITIONAL" &&
      (!v.remainingIssues || !v.rectificationDueOn)
    )
      c.addIssue({
        code: "custom",
        path: ["remainingIssues"],
        message: "有条件通过必须填写遗留问题和整改期限",
      });
  });
export const projectChangeInput = z.object({
  projectId: z.string().min(1),
  changeType: z.string().trim().min(1).max(64),
  originalContent: z.string().trim().min(1),
  newContent: z.string().trim().min(1),
  reason: z.string().trim().min(2),
  impactScope: z.string().trim().min(1),
  scheduleImpactDays: z.number().int(),
  amountImpact: z.number(),
  applicantId: z.string().min(1),
  effectiveOn: z.iso.date().nullable().optional(),
});

export function validateStartEligibility(
  type: ProjectStartType,
  hasEffectiveContract: boolean,
  approvalPassed: boolean,
): { reminderRequired: boolean } {
  if (type === "NORMAL" && !hasEffectiveContract)
    throw new AppError(
      "EFFECTIVE_CONTRACT_REQUIRED",
      "正常启动必须存在有效合同",
      409,
    );
  if (type === "EARLY" && !approvalPassed)
    throw new AppError(
      "EARLY_START_APPROVAL_REQUIRED",
      "提前启动必须审批通过",
      409,
    );
  return { reminderRequired: type === "EARLY" && !hasEffectiveContract };
}

type StageAction =
  | "START"
  | "SUBMIT_CONFIRMATION"
  | "CONFIRM"
  | "DELAY"
  | "SUSPEND"
  | "RESUME"
  | "CANCEL";
const stageTransitions: Record<
  StageStatus,
  Partial<Record<StageAction, StageStatus>>
> = {
  NOT_STARTED: { START: "IN_PROGRESS", CANCEL: "CANCELLED" },
  IN_PROGRESS: {
    SUBMIT_CONFIRMATION: "PENDING_CONFIRMATION",
    DELAY: "DELAYED",
    SUSPEND: "SUSPENDED",
    CANCEL: "CANCELLED",
  },
  PENDING_CONFIRMATION: { CONFIRM: "COMPLETED", DELAY: "DELAYED" },
  DELAYED: { START: "IN_PROGRESS", SUSPEND: "SUSPENDED", CANCEL: "CANCELLED" },
  SUSPENDED: { RESUME: "IN_PROGRESS", CANCEL: "CANCELLED" },
  COMPLETED: {},
  CANCELLED: {},
};
export function transitionStage(
  status: StageStatus,
  action: StageAction,
): StageStatus {
  const next = stageTransitions[status][action];
  if (!next)
    throw new AppError(
      "INVALID_STAGE_TRANSITION",
      `阶段状态 ${status} 不允许执行 ${action}`,
      409,
    );
  return next;
}

type RiskAction = "START" | "SUBMIT_VERIFY" | "CLOSE" | "REOPEN";
const riskTransitions: Record<
  RiskStatus,
  Partial<Record<RiskAction, RiskStatus>>
> = {
  PENDING: { START: "IN_PROGRESS" },
  IN_PROGRESS: { SUBMIT_VERIFY: "PENDING_VERIFICATION" },
  PENDING_VERIFICATION: { CLOSE: "CLOSED", REOPEN: "REOPENED" },
  CLOSED: { REOPEN: "REOPENED" },
  REOPENED: { START: "IN_PROGRESS" },
};
export function transitionRisk(
  status: RiskStatus,
  action: RiskAction,
): RiskStatus {
  const next = riskTransitions[status][action];
  if (!next)
    throw new AppError(
      "INVALID_RISK_TRANSITION",
      `风险状态 ${status} 不允许执行 ${action}`,
      409,
    );
  return next;
}
