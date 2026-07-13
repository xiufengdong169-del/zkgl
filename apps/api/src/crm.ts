import { z } from 'zod'

export const counterpartyInput = z.object({
  name: z.string().trim().min(2).max(255),
  shortName: z.string().trim().max(128).nullable().optional(),
  creditCode: z.string().trim().min(15).max(32).nullable().optional(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'GENERAL_CONTRACTOR', 'PARTNER', 'OTHER']),
  industry: z.string().trim().max(128).nullable().optional(),
  region: z.string().trim().max(128).nullable().optional(),
  address: z.string().trim().max(512).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  website: z.url().max(255).nullable().optional(),
  sourceCode: z.string().trim().max(64).nullable().optional(),
  cooperationStatus: z.enum(['POTENTIAL', 'ACTIVE', 'SUSPENDED', 'ENDED']).default('POTENTIAL'),
  remark: z.string().trim().max(1000).nullable().optional()
})

export const contactInput = z.object({
  counterpartyId: z.string().min(1),
  name: z.string().trim().min(1).max(128),
  gender: z.enum(['MALE', 'FEMALE', 'UNSPECIFIED']).nullable().optional(),
  departmentName: z.string().trim().max(128).nullable().optional(),
  positionName: z.string().trim().max(128).nullable().optional(),
  mobile: z.string().trim().max(32).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.email().max(255).nullable().optional(),
  wechat: z.string().trim().max(128).nullable().optional(),
  isKeyContact: z.boolean().default(false),
  relationshipLevel: z.enum(['UNKNOWN', 'NORMAL', 'GOOD', 'STRONG']).nullable().optional(),
  decisionRole: z.string().trim().max(64).nullable().optional(),
  remark: z.string().trim().max(1000).nullable().optional()
}).refine((value) => Boolean(value.mobile || value.phone || value.email || value.wechat), {
  message: '联系人至少需要一种联系方式'
})

export const visitInput = z.object({
  customerId: z.string().min(1),
  contactId: z.string().nullable().optional(),
  visitedAt: z.iso.datetime(),
  method: z.enum(['ONSITE', 'PHONE', 'VIDEO', 'OTHER']),
  location: z.string().trim().max(255).nullable().optional(),
  participantIds: z.array(z.string().min(1)).min(1),
  purpose: z.string().trim().min(2).max(500),
  communication: z.string().trim().min(2),
  customerNeeds: z.string().trim().nullable().optional(),
  opportunityAssessment: z.string().trim().nullable().optional(),
  nextAction: z.string().trim().nullable().optional(),
  nextFollowUpAt: z.iso.datetime().nullable().optional(),
  generateLead: z.boolean().default(false)
})

export type CounterpartyInput = z.infer<typeof counterpartyInput>
export type ContactInput = z.infer<typeof contactInput>
export type VisitInput = z.infer<typeof visitInput>
