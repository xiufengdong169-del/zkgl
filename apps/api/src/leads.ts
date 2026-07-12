import type { LeadStatus } from '@zkgl/shared'
import { z } from 'zod'

import { AppError } from './errors.js'

export const leadInput = z.object({
  projectName: z.string().trim().min(2).max(255),
  customerId: z.string().min(1),
  sourceCode: z.string().trim().min(1).max(64),
  sourceDescription: z.string().trim().max(500).nullable().optional(),
  discoveredOn: z.iso.date(),
  estimatedAmount: z.number().nonnegative().max(9999999999999999).nullable().optional(),
  estimatedStartOn: z.iso.date().nullable().optional(),
  projectType: z.string().trim().min(1).max(64),
  projectBackground: z.string().trim().nullable().optional(),
  requirementSummary: z.string().trim().min(2),
  competition: z.string().trim().nullable().optional(),
  successProbability: z.number().int().min(0).max(100),
  ownerId: z.string().min(1),
  collaboratorIds: z.array(z.string().min(1)).default([]),
  nextFollowUpAt: z.iso.datetime().nullable().optional(),
  sourceVisitId: z.string().nullable().optional()
})

export const followUpInput = z.object({
  leadId: z.string().min(1),
  followedUpAt: z.iso.datetime(),
  method: z.enum(['ONSITE', 'PHONE', 'VIDEO', 'EMAIL', 'WECHAT', 'OTHER']),
  participantIds: z.array(z.string().min(1)).default([]),
  communication: z.string().trim().min(2),
  customerFeedback: z.string().trim().nullable().optional(),
  opportunityChange: z.string().trim().nullable().optional(),
  successProbability: z.number().int().min(0).max(100),
  nextAction: z.string().trim().min(2),
  nextFollowUpAt: z.iso.datetime().nullable().optional()
})

export type LeadAction = 'SUBMIT' | 'RETURN' | 'REJECT' | 'APPROVE' | 'CONVERT' | 'CLOSE'

const transitions: Record<LeadStatus, Partial<Record<LeadAction, LeadStatus>>> = {
  DRAFT: { SUBMIT: 'PENDING_REGISTRATION', CLOSE: 'INVALID' },
  PENDING_REGISTRATION: { RETURN: 'RETURNED', REJECT: 'REJECTED', APPROVE: 'FOLLOWING' },
  RETURNED: { SUBMIT: 'PENDING_REGISTRATION', CLOSE: 'INVALID' },
  REJECTED: {},
  FOLLOWING: { CONVERT: 'CONVERTED', CLOSE: 'INVALID' },
  CONVERTED: {},
  INVALID: {}
}

export function transitionLead(status: LeadStatus, action: LeadAction): LeadStatus {
  const next = transitions[status][action]
  if (!next) throw new AppError('INVALID_LEAD_TRANSITION', `线索状态 ${status} 不允许执行 ${action}`, 409)
  return next
}

export type LeadInput = z.infer<typeof leadInput>
export type FollowUpInput = z.infer<typeof followUpInput>
