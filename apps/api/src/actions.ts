import type { SessionUser } from '@zkgl/shared'
import type { ZodType } from 'zod'
import { z } from 'zod'

import { bidApplicationInput } from './bids.js'
import { contractInput } from './contracts.js'
import { projectStartInput } from './delivery.js'
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
