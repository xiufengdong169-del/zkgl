import type { ProjectApplicationStatus } from "@zkgl/shared";
import { z } from "zod";

import { AppError } from "./errors.js";

export const memberSuggestionInput = z.object({
  employeeId: z.string().min(1),
  proposedRole: z.string().trim().min(1).max(64),
});

export const projectApplicationInput = z
  .object({
    projectName: z.string().trim().min(2).max(255),
    customerId: z.string().min(1),
    sourceLeadId: z.string().nullable().optional(),
    projectType: z.string().trim().min(1).max(64),
    background: z.string().trim().nullable().optional(),
    serviceScope: z.string().trim().min(2),
    estimatedRevenue: z.number().nonnegative().max(9999999999999999),
    estimatedCost: z.number().nonnegative().max(9999999999999999),
    estimatedStartOn: z.iso.date(),
    estimatedEndOn: z.iso.date(),
    proposedManagerId: z.string().min(1),
    memberSuggestions: z.array(memberSuggestionInput).default([]),
    biddingMethod: z.string().trim().max(64).nullable().optional(),
    riskDescription: z.string().trim().nullable().optional(),
    necessity: z.string().trim().min(2),
  })
  .refine((value) => value.estimatedEndOn >= value.estimatedStartOn, {
    message: "预计结束日期不得早于预计开始日期",
    path: ["estimatedEndOn"],
  });

export type ProjectApplicationInput = z.infer<typeof projectApplicationInput>;
export type ProjectApplicationAction =
  "SUBMIT" | "RETURN" | "REJECT" | "WITHDRAW";

const transitions: Record<
  ProjectApplicationStatus,
  Partial<Record<ProjectApplicationAction, ProjectApplicationStatus>>
> = {
  DRAFT: { SUBMIT: "APPROVAL_PENDING" },
  APPROVAL_PENDING: {
    RETURN: "RETURNED",
    REJECT: "REJECTED",
    WITHDRAW: "WITHDRAWN",
  },
  RETURNED: { SUBMIT: "APPROVAL_PENDING", WITHDRAW: "WITHDRAWN" },
  REJECTED: { SUBMIT: "APPROVAL_PENDING" },
  WITHDRAWN: { SUBMIT: "APPROVAL_PENDING" },
  APPROVED: {},
};

export function transitionProjectApplication(
  status: ProjectApplicationStatus,
  action: ProjectApplicationAction,
): ProjectApplicationStatus {
  const next = transitions[status][action];
  if (!next) {
    throw new AppError(
      "INVALID_APPLICATION_TRANSITION",
      `立项申请状态 ${status} 不允许执行 ${action}`,
      409,
    );
  }
  return next;
}

export function assertProjectApplicationEditable(status: string): void {
  if (!["DRAFT", "RETURNED", "REJECTED", "WITHDRAWN"].includes(status))
    throw new AppError(
      "PROJECT_APPLICATION_NOT_EDITABLE",
      "当前立项申请状态不可修改",
      409,
    );
}

export interface ProjectApplicationRecord {
  id: string;
  applicationCode: string;
  projectName: string;
  customerId: string;
  projectType: string;
  serviceScope: string;
  proposedManagerId: string;
  estimatedRevenue: number;
  estimatedCost: number;
  status: ProjectApplicationStatus;
}

export interface ProjectRecord {
  id: string;
  projectCode: string;
  applicationId: string;
}

export interface ApprovalRepository {
  transaction<T>(work: () => Promise<T>): Promise<T>;
  lockApplication(id: string): Promise<ProjectApplicationRecord | null>;
  findProjectByApplication(id: string): Promise<ProjectRecord | null>;
  allocateNumber(ruleCode: "PROJECT"): Promise<string>;
  createProjectFromApplication(
    application: ProjectApplicationRecord,
    projectCode: string,
    operatorId: string,
  ): Promise<ProjectRecord>;
  markApplicationApproved(id: string, operatorId: string): Promise<void>;
  copySuggestedMembers(
    applicationId: string,
    projectId: string,
    operatorId: string,
  ): Promise<void>;
}

export async function approveProjectApplication(
  repository: ApprovalRepository,
  applicationId: string,
  operatorId: string,
): Promise<ProjectRecord> {
  return repository.transaction(async () => {
    const application = await repository.lockApplication(applicationId);
    if (!application)
      throw new AppError("APPLICATION_NOT_FOUND", "立项申请不存在", 404);

    const existingProject =
      await repository.findProjectByApplication(applicationId);
    if (existingProject) return existingProject;

    if (application.status !== "APPROVAL_PENDING") {
      throw new AppError(
        "APPLICATION_NOT_PENDING",
        "仅审批中的立项申请可通过",
        409,
      );
    }

    const projectCode = await repository.allocateNumber("PROJECT");
    const project = await repository.createProjectFromApplication(
      application,
      projectCode,
      operatorId,
    );
    await repository.copySuggestedMembers(
      applicationId,
      project.id,
      operatorId,
    );
    await repository.markApplicationApproved(applicationId, operatorId);
    return project;
  });
}
