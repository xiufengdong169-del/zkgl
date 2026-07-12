import type { SessionUser } from '@zkgl/shared'
import type { ZodType } from 'zod'
import { z } from 'zod'

import { bidApplicationInput } from './bids.js'
import { contractInput } from './contracts.js'
import { projectStartInput } from './delivery.js'
import { invoiceApplicationInput, paymentApplicationInput, receiptInput, reimbursementInput } from './finance.js'
import { contactInput, counterpartyInput, visitInput } from './crm.js'
import { followUpInput, leadInput } from './leads.js'
import { projectApplicationInput } from './project-applications.js'
import { requirePermission } from './rbac.js'

interface ActionDefinition {
  permission: string
  input: ZodType
}

const listInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.union([z.literal(20), z.literal(50)]).default(20),
  keyword: z.string().trim().max(100).optional()
}).default({ page: 1, pageSize: 20 })

export const actionDefinitions: Record<string, ActionDefinition> = {
  'crm.counterparty.list': { permission: 'crm.counterparty.read', input: listInput },
  'lead.list': { permission: 'lead.read', input: listInput },
  'project.application.list': { permission: 'project.application.read', input: listInput },
  'project.list': { permission: 'project.read', input: listInput },
  'bid.application.list': { permission: 'bid.application.read', input: listInput },
  'contract.list': { permission: 'contract.read', input: listInput },
  'approval.task.list': { permission: 'approval.task.read', input: listInput },
  'approval.task.action': { permission: 'approval.task.process', input: z.object({ taskId: z.string().min(1), action: z.enum(['APPROVE','RETURN','REJECT']), actionKey: z.string().min(8).max(128), comment: z.string().trim().max(1000).nullable().optional() }) },
  'approval.instance.withdraw': { permission: 'approval.instance.withdraw', input: z.object({ instanceId: z.string().min(1), actionKey: z.string().min(8).max(128), comment: z.string().trim().max(1000).nullable().optional() }) },
  'finance.summary': { permission: 'finance.read', input: z.object({ projectId:z.string().optional() }).default({}) },
  'invoice.application.create': { permission: 'invoice.application.create', input: invoiceApplicationInput },
  'receipt.create': { permission: 'receipt.create', input: receiptInput },
  'reimbursement.create': { permission: 'reimbursement.create', input: reimbursementInput },
  'payment.application.create': { permission: 'payment.application.create', input: paymentApplicationInput },
  'crm.counterparty.create': { permission: 'crm.counterparty.create', input: counterpartyInput },
  'crm.contact.create': { permission: 'crm.contact.create', input: contactInput },
  'crm.visit.create': { permission: 'crm.visit.create', input: visitInput },
  'lead.create': { permission: 'lead.create', input: leadInput },
  'lead.followUp.create': { permission: 'lead.followUp.create', input: followUpInput },
  'project.application.create': { permission: 'project.application.create', input: projectApplicationInput },
  'bid.application.create': { permission: 'bid.application.create', input: bidApplicationInput },
  'contract.create': { permission: 'contract.create', input: contractInput },
  'project.start.create': { permission: 'project.start.create', input: projectStartInput }
}

export function authorizeAndParseAction(user: SessionUser, action: string, payload: unknown): unknown {
  const definition = actionDefinitions[action]
  if (!definition) return undefined
  requirePermission(user, definition.permission)
  return definition.input.parse(payload)
}
