import type { SessionUser } from '@zkgl/shared'
import type { ZodType } from 'zod'

import { bidApplicationInput } from './bids.js'
import { contactInput, counterpartyInput, visitInput } from './crm.js'
import { followUpInput, leadInput } from './leads.js'
import { projectApplicationInput } from './project-applications.js'
import { requirePermission } from './rbac.js'

interface ActionDefinition {
  permission: string
  input: ZodType
}

export const actionDefinitions: Record<string, ActionDefinition> = {
  'crm.counterparty.create': { permission: 'crm.counterparty.create', input: counterpartyInput },
  'crm.contact.create': { permission: 'crm.contact.create', input: contactInput },
  'crm.visit.create': { permission: 'crm.visit.create', input: visitInput },
  'lead.create': { permission: 'lead.create', input: leadInput },
  'lead.followUp.create': { permission: 'lead.followUp.create', input: followUpInput },
  'project.application.create': { permission: 'project.application.create', input: projectApplicationInput },
  'bid.application.create': { permission: 'bid.application.create', input: bidApplicationInput }
}

export function authorizeAndParseAction(user: SessionUser, action: string, payload: unknown): unknown {
  const definition = actionDefinitions[action]
  if (!definition) return undefined
  requirePermission(user, definition.permission)
  return definition.input.parse(payload)
}
