import type { SessionUser } from "@zkgl/shared";
import type { ZodType } from "zod";
import { z } from "zod";

import {
  bidApplicationInput,
  bidCheckInput,
  bidCheckResultInput,
  bidPartnerInput,
  bidResultInput,
  bidTaskInput,
} from "./bids.js";
import {
  contractChangeInput,
  contractInput,
  contractMilestoneInput,
} from "./contracts.js";
import {
  acceptanceInput,
  acceptanceResultInput,
  deliverableConfirmInput,
  deliverableInput,
  progressInput,
  projectChangeInput,
  projectStartInput,
  riskInput,
  stageInput,
} from "./delivery.js";
import {
  dailyPurchaseInput,
  invoiceApplicationInput,
  paymentApplicationInput,
  paymentDetailInput,
  receiptInput,
  receiptInvoiceAllocationInput,
  reimbursementInput,
  salesInvoiceInput,
} from "./finance.js";
import {
  closeApplicationInput,
  depositEventInput,
  depositInput,
  partnerPlanInput,
  settlementCreateInput,
} from "./settlements.js";
import { contactInput, counterpartyInput, visitInput } from "./crm.js";
import { followUpInput, leadInput } from "./leads.js";
import { projectApplicationInput } from "./project-applications.js";
import {
  fileCompleteInput,
  fileDownloadInput,
  fileHistoryInput,
  fileListInput,
  fileUploadInput,
  fileVersionCompleteInput,
  fileVersionUploadInput,
} from "./files.js";
import { requirePermission } from "./rbac.js";

interface ActionDefinition {
  permission: string;
  input: ZodType;
}

const listInput = z
  .object({
    page: z.number().int().positive().default(1),
    pageSize: z.union([z.literal(20), z.literal(50)]).default(20),
    keyword: z.string().trim().max(100).optional(),
  })
  .default({ page: 1, pageSize: 20 });

export const actionDefinitions: Record<string, ActionDefinition> = {
  "crm.counterparty.list": {
    permission: "crm.counterparty.read",
    input: listInput,
  },
  "crm.counterparty.detail": {
    permission: "crm.counterparty.read",
    input: z.object({ counterpartyId: z.string().min(1) }),
  },
  "lead.list": { permission: "lead.read", input: listInput },
  "lead.detail": {
    permission: "lead.read",
    input: z.object({ leadId: z.string().min(1) }),
  },
  "lead.close": {
    permission: "lead.create",
    input: z.object({
      leadId: z.string().min(1),
      reason: z.string().trim().min(2).max(1000),
    }),
  },
  "project.application.list": {
    permission: "project.application.read",
    input: listInput,
  },
  "project.application.detail": {
    permission: "project.application.read",
    input: z.object({ applicationId: z.string().min(1) }),
  },
  "project.application.update": {
    permission: "project.application.create",
    input: z.object({
      applicationId: z.string().min(1),
      version: z.number().int().nonnegative(),
      data: projectApplicationInput,
    }),
  },
  "project.list": { permission: "project.read", input: listInput },
  "project.detail": {
    permission: "project.read",
    input: z.object({ projectId: z.string().min(1) }),
  },
  "bid.application.list": {
    permission: "bid.application.read",
    input: listInput,
  },
  "organization.employee.options": {
    permission: "bid.application.read",
    input: z.object({}).default({}),
  },
  "bid.detail": {
    permission: "bid.application.read",
    input: z.object({ bidId: z.string().min(1) }),
  },
  "contract.list": { permission: "contract.read", input: listInput },
  "contract.detail": {
    permission: "contract.read",
    input: z.object({ contractId: z.string().min(1) }),
  },
  "contract.summary": {
    permission: "contract.read",
    input: z.object({}).default({}),
  },
  "contract.activate": {
    permission: "contract.create",
    input: z.object({
      contractId: z.string().min(1),
      signedOn: z.iso.date(),
      effectiveOn: z.iso.date(),
    }),
  },
  "contract.change.create": {
    permission: "contract.change.create",
    input: contractChangeInput,
  },
  "contract.milestone.create": {
    permission: "contract.milestone.create",
    input: contractMilestoneInput,
  },
  "contract.milestone.complete": {
    permission: "contract.milestone.create",
    input: z.object({
      milestoneId: z.string().min(1),
      completedOn: z.iso.date(),
    }),
  },
  "approval.task.list": { permission: "approval.task.read", input: listInput },
  "approval.inbox.list": {
    permission: "approval.task.read",
    input: z.object({
      mode: z.enum(["PENDING", "INITIATED", "CC", "PROCESSED"]),
      page: z.number().int().positive().default(1),
      pageSize: z.union([z.literal(20), z.literal(50)]).default(20),
    }),
  },
  "approval.instance.submit": {
    permission: "approval.instance.submit",
    input: z.object({
      businessType: z.enum([
        "PROJECT_APPLICATION",
        "LEAD",
        "BID_APPLICATION",
        "CONTRACT",
        "CONTRACT_CHANGE",
        "INVOICE_APPLICATION",
        "EXPENSE_REIMBURSEMENT",
        "PROJECT_PAYMENT",
        "PARTNER_SETTLEMENT",
        "DAILY_PURCHASE",
        "PROJECT_START",
        "PROJECT_CHANGE",
        "PROJECT_ACCEPTANCE",
        "PROJECT_CLOSE",
        "DEPOSIT",
        "DEPOSIT_LOSS",
      ]),
      businessId: z.string().min(1),
      title: z.string().trim().min(2).max(255),
      amount: z.number().nonnegative().nullable().optional(),
    }),
  },
  "approval.task.action": {
    permission: "approval.task.process",
    input: z.object({
      taskId: z.string().min(1),
      action: z.enum(["APPROVE", "RETURN", "REJECT"]),
      actionKey: z.string().min(8).max(128),
      comment: z.string().trim().max(1000).nullable().optional(),
    }),
  },
  "approval.instance.withdraw": {
    permission: "approval.instance.withdraw",
    input: z.object({
      instanceId: z.string().min(1),
      actionKey: z.string().min(8).max(128),
      comment: z.string().trim().max(1000).nullable().optional(),
    }),
  },
  "finance.summary": {
    permission: "finance.read",
    input: z.object({ projectId: z.string().optional() }).default({}),
  },
  "invoice.application.create": {
    permission: "invoice.application.create",
    input: invoiceApplicationInput,
  },
  "receipt.create": { permission: "receipt.create", input: receiptInput },
  "finance.documents": {
    permission: "finance.read",
    input: z.object({ projectId: z.string().optional() }).default({}),
  },
  "sales.invoice.create": {
    permission: "sales.invoice.create",
    input: salesInvoiceInput,
  },
  "receipt.invoice.allocate": {
    permission: "receipt.invoice.allocate",
    input: receiptInvoiceAllocationInput,
  },
  "reimbursement.create": {
    permission: "reimbursement.create",
    input: reimbursementInput,
  },
  "finance.expenseApplications": {
    permission: "reimbursement.create",
    input: z.object({}).default({}),
  },
  "payment.application.create": {
    permission: "payment.application.create",
    input: paymentApplicationInput,
  },
  "payment.detail.create": {
    permission: "payment.detail.create",
    input: paymentDetailInput,
  },
  "finance.operations": {
    permission: "finance.read",
    input: z.object({}).default({}),
  },
  "daily.purchase.create": {
    permission: "daily.purchase.create",
    input: dailyPurchaseInput,
  },
  "daily.purchase.complete": {
    permission: "daily.purchase.create",
    input: z.object({ purchaseId: z.string().min(1) }),
  },
  "partner.plan.create": {
    permission: "partner.plan.create",
    input: partnerPlanInput,
  },
  "partner.plan.version.create": {
    permission: "partner.plan.create",
    input: z.object({
      planId: z.string().min(1),
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
    }),
  },
  "partner.plan.version.activate": {
    permission: "partner.plan.create",
    input: z.object({
      planId: z.string().min(1),
      versionId: z.string().min(1),
    }),
  },
  "partner.settlement.create": {
    permission: "partner.settlement.create",
    input: settlementCreateInput,
  },
  "deposit.create": { permission: "deposit.create", input: depositInput },
  "deposit.event.create": {
    permission: "deposit.event.create",
    input: depositEventInput,
  },
  "project.close.create": {
    permission: "project.close.create",
    input: closeApplicationInput,
  },
  "project.close.list": {
    permission: "settlement.read",
    input: listInput,
  },
  "org.employee.options": {
    permission: "settlement.read",
    input: z.object({}).default({}),
  },
  "project.close.openItem.complete": {
    permission: "project.close.openItem.complete",
    input: z.object({
      itemId: z.string().min(1),
      completedOn: z.iso.date(),
    }),
  },
  "settlement.summary": {
    permission: "settlement.read",
    input: z.object({}).default({}),
  },
  "crm.counterparty.create": {
    permission: "crm.counterparty.create",
    input: counterpartyInput,
  },
  "crm.contact.create": {
    permission: "crm.contact.create",
    input: contactInput,
  },
  "crm.visit.create": { permission: "crm.visit.create", input: visitInput },
  "lead.create": { permission: "lead.create", input: leadInput },
  "lead.followUp.create": {
    permission: "lead.followUp.create",
    input: followUpInput,
  },
  "project.application.create": {
    permission: "project.application.create",
    input: projectApplicationInput,
  },
  "bid.application.create": {
    permission: "bid.application.create",
    input: bidApplicationInput,
  },
  "bid.status.transition": {
    permission: "bid.application.create",
    input: z.object({
      bidId: z.string().min(1),
      action: z.enum(["START_PREPARING", "SUBMIT_BID", "OPEN", "ABANDON"]),
    }),
  },
  "bid.result.create": {
    permission: "bid.application.create",
    input: bidResultInput,
  },
  "bid.task.create": {
    permission: "bid.application.create",
    input: bidTaskInput,
  },
  "bid.task.transition": {
    permission: "bid.application.create",
    input: z.object({
      taskId: z.string().min(1),
      action: z.enum([
        "START",
        "SUBMIT_CHECK",
        "COMPLETE",
        "MARK_OVERDUE",
        "CANCEL",
      ]),
      completionDescription: z.string().trim().nullable().optional(),
    }),
  },
  "bid.check.create": {
    permission: "bid.application.create",
    input: bidCheckInput,
  },
  "bid.check.result": {
    permission: "bid.application.create",
    input: bidCheckResultInput,
  },
  "bid.partner.create": {
    permission: "bid.application.create",
    input: bidPartnerInput,
  },
  "contract.create": { permission: "contract.create", input: contractInput },
  "project.start.create": {
    permission: "project.start.create",
    input: projectStartInput,
  },
  "delivery.summary": {
    permission: "project.delivery.read",
    input: z.object({ projectId: z.string().optional() }).default({}),
  },
  "delivery.records": {
    permission: "project.delivery.read",
    input: z.object({}).default({}),
  },
  "project.stage.create": {
    permission: "project.stage.create",
    input: stageInput,
  },
  "project.stage.transition": {
    permission: "project.stage.create",
    input: z.object({
      stageId: z.string().min(1),
      action: z.enum([
        "START",
        "SUBMIT_CONFIRMATION",
        "CONFIRM",
        "DELAY",
        "SUSPEND",
        "RESUME",
        "CANCEL",
      ]),
    }),
  },
  "project.progress.create": {
    permission: "project.progress.create",
    input: progressInput,
  },
  "project.risk.create": {
    permission: "project.risk.create",
    input: riskInput,
  },
  "project.risk.transition": {
    permission: "project.risk.create",
    input: z.object({
      riskId: z.string().min(1),
      action: z.enum(["START", "SUBMIT_VERIFY", "CLOSE", "REOPEN"]),
    }),
  },
  "project.deliverable.create": {
    permission: "project.deliverable.create",
    input: deliverableInput,
  },
  "project.deliverable.confirm": {
    permission: "project.deliverable.confirm",
    input: deliverableConfirmInput,
  },
  "project.acceptance.create": {
    permission: "project.acceptance.create",
    input: acceptanceInput,
  },
  "project.acceptance.result": {
    permission: "project.acceptance.create",
    input: acceptanceResultInput,
  },
  "project.change.create": {
    permission: "project.change.create",
    input: projectChangeInput,
  },
  "file.list": { permission: "file.read", input: fileListInput },
  "file.upload.prepare": { permission: "file.upload", input: fileUploadInput },
  "file.upload.complete": {
    permission: "file.upload",
    input: fileCompleteInput,
  },
  "file.version.prepare": {
    permission: "file.upload",
    input: fileVersionUploadInput,
  },
  "file.version.complete": {
    permission: "file.upload",
    input: fileVersionCompleteInput,
  },
  "file.version.history": { permission: "file.read", input: fileHistoryInput },
  "file.download": { permission: "file.download", input: fileDownloadInput },
  "admin.overview": {
    permission: "system.admin",
    input: z.object({}).default({}),
  },
  "admin.department.create": {
    permission: "system.admin",
    input: z.object({
      code: z.string().trim().min(2).max(64),
      name: z.string().trim().min(2).max(128),
    }),
  },
  "admin.employee.create": {
    permission: "system.admin",
    input: z.object({
      employeeCode: z.string().trim().min(2).max(64),
      name: z.string().trim().min(2).max(128),
      employeeType: z.enum(["EMPLOYEE", "PARTNER", "EXTERNAL"]),
      departmentId: z.string().min(1),
      positionName: z.string().trim().max(128).nullable().optional(),
      mobile: z.string().trim().max(32).nullable().optional(),
      email: z.email().nullable().optional(),
      joinedOn: z.iso.date().nullable().optional(),
    }),
  },
  "admin.positionAssignment.create": {
    permission: "system.admin",
    input: z
      .object({
        positionCode: z.string().min(2).max(64),
        employeeId: z.string().min(1),
        startsOn: z.iso.date(),
        endsOn: z.iso.date().nullable().optional(),
        isDelegate: z.boolean().default(false),
      })
      .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
        message: "结束日期不得早于开始日期",
        path: ["endsOn"],
      }),
  },
  "admin.positionAssignment.status": {
    permission: "system.admin",
    input: z.object({
      assignmentId: z.string().min(1),
      status: z.enum(["ENABLED", "DISABLED"]),
    }),
  },
  "admin.user.role.set": {
    permission: "system.admin",
    input: z.object({
      userId: z.string().min(1),
      roleIds: z.array(z.string().min(1)).max(20),
    }),
  },
  "admin.numberRule.update": {
    permission: "system.admin",
    input: z.object({
      ruleId: z.string().min(1),
      prefix: z.string().trim().min(1).max(32),
      serialLength: z.number().int().min(2).max(12),
      status: z.enum(["ENABLED", "DISABLED"]),
      version: z.number().int().nonnegative(),
    }),
  },
  "admin.audit.list": {
    permission: "system.admin",
    input: z
      .object({
        page: z.number().int().positive().default(1),
        pageSize: z.union([z.literal(20), z.literal(50)]).default(20),
        keyword: z.string().trim().max(100).optional(),
        action: z.string().trim().max(128).optional(),
        outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
      })
      .default({ page: 1, pageSize: 20 }),
  },
  "admin.dictionary.type.create": {
    permission: "system.admin",
    input: z.object({
      typeCode: z
        .string()
        .trim()
        .min(2)
        .max(64)
        .regex(/^[A-Z][A-Z0-9_]*$/),
      name: z.string().trim().min(2).max(128),
      description: z.string().trim().max(500).nullable().optional(),
    }),
  },
  "admin.dictionary.item.create": {
    permission: "system.admin",
    input: z.object({
      typeId: z.string().min(1),
      itemCode: z.string().trim().min(1).max(64),
      label: z.string().trim().min(1).max(128),
      valueText: z.string().trim().min(1).max(255),
      sortOrder: z.number().int().min(-10000).max(10000).default(0),
    }),
  },
  "admin.dictionary.item.update": {
    permission: "system.admin",
    input: z.object({
      itemId: z.string().min(1),
      label: z.string().trim().min(1).max(128),
      valueText: z.string().trim().min(1).max(255),
      sortOrder: z.number().int().min(-10000).max(10000),
      status: z.enum(["ENABLED", "DISABLED"]),
      version: z.number().int().nonnegative(),
    }),
  },
  "admin.approvalNode.update": {
    permission: "system.admin",
    input: z
      .object({
        nodeId: z.string().min(1),
        nodeName: z.string().trim().min(2).max(128),
        positionCode: z.string().trim().min(2).max(64),
        minimumAmount: z.number().nonnegative().nullable(),
        maximumAmount: z.number().nonnegative().nullable(),
        isCc: z.boolean(),
        status: z.enum(["ENABLED", "DISABLED"]),
        version: z.number().int().nonnegative(),
      })
      .refine(
        (value) =>
          value.minimumAmount == null ||
          value.maximumAmount == null ||
          value.maximumAmount >= value.minimumAmount,
        { message: "最高金额不得低于最低金额", path: ["maximumAmount"] },
      ),
  },
  "report.dashboard": {
    permission: "report.financial.read",
    input: z.object({}).default({}),
  },
  "report.analytics": {
    permission: "report.financial.read",
    input: z.object({}).default({}),
  },
  "report.receivables": {
    permission: "report.financial.read",
    input: listInput,
  },
  "report.project.export": {
    permission: "project.export",
    input: z.object({}).default({}),
  },
  "message.list": { permission: "message.read", input: listInput },
  "message.read": {
    permission: "message.read",
    input: z.object({ messageId: z.string().min(1) }),
  },
  "reminder.refresh": {
    permission: "system.admin",
    input: z.object({}).default({}),
  },
};

export function authorizeAndParseAction(
  user: SessionUser,
  action: string,
  payload: unknown,
): unknown {
  const definition = actionDefinitions[action];
  if (!definition) return undefined;
  requirePermission(user, definition.permission);
  return definition.input.parse(payload);
}
