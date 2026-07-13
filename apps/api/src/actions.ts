import type { SessionUser } from "@zkgl/shared";
import type { ZodType } from "zod";
import { z } from "zod";

import { bidApplicationInput } from "./bids.js";
import { contractInput } from "./contracts.js";
import {
  acceptanceInput,
  deliverableConfirmInput,
  deliverableInput,
  progressInput,
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
  fileListInput,
  fileUploadInput,
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
  "lead.list": { permission: "lead.read", input: listInput },
  "project.application.list": {
    permission: "project.application.read",
    input: listInput,
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
  "contract.list": { permission: "contract.read", input: listInput },
  "contract.summary": {
    permission: "contract.read",
    input: z.object({}).default({}),
  },
  "approval.task.list": { permission: "approval.task.read", input: listInput },
  "approval.instance.submit": {
    permission: "approval.instance.submit",
    input: z.object({
      businessType: z.enum([
        "PROJECT_APPLICATION",
        "BID_APPLICATION",
        "CONTRACT",
        "INVOICE_APPLICATION",
        "EXPENSE_REIMBURSEMENT",
        "PROJECT_PAYMENT",
        "PARTNER_SETTLEMENT",
        "DAILY_PURCHASE",
        "PROJECT_START",
        "PROJECT_CLOSE",
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
  "partner.plan.create": {
    permission: "partner.plan.create",
    input: partnerPlanInput,
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
  "project.progress.create": {
    permission: "project.progress.create",
    input: progressInput,
  },
  "project.risk.create": {
    permission: "project.risk.create",
    input: riskInput,
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
  "file.list": { permission: "file.read", input: fileListInput },
  "file.upload.prepare": { permission: "file.upload", input: fileUploadInput },
  "file.upload.complete": {
    permission: "file.upload",
    input: fileCompleteInput,
  },
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
  "admin.user.role.set": {
    permission: "system.admin",
    input: z.object({
      userId: z.string().min(1),
      roleIds: z.array(z.string().min(1)).max(20),
    }),
  },
  "report.dashboard": {
    permission: "report.financial.read",
    input: z.object({}).default({}),
  },
  "report.project.export": {
    permission: "project.export",
    input: z.object({}).default({}),
  },
  "message.list": { permission: "message.read", input: listInput },
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
