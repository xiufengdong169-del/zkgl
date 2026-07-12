import type { BidStatus, BidTaskStatus } from '@zkgl/shared'
import { z } from 'zod'

import { AppError } from './errors.js'

export const bidApplicationInput = z.object({
  projectId: z.string().min(1), tendererId: z.string().min(1), agencyId: z.string().nullable().optional(),
  tenderNumber: z.string().trim().max(128).nullable().optional(), projectBudget: z.number().nonnegative().nullable().optional(),
  bidCeiling: z.number().nonnegative().nullable().optional(), registrationAt: z.iso.datetime().nullable().optional(),
  documentPurchaseAt: z.iso.datetime().nullable().optional(), clarificationAt: z.iso.datetime().nullable().optional(),
  deadlineAt: z.iso.datetime(), openingAt: z.iso.datetime().nullable().optional(),
  bidLocation: z.string().trim().max(255).nullable().optional(), bidMethod: z.string().trim().min(1).max(64),
  depositAmount: z.number().nonnegative().default(0), documentFee: z.number().nonnegative().default(0),
  businessOwnerId: z.string().min(1), technicalOwnerId: z.string().min(1), pricingOwnerId: z.string().min(1),
  applicationReason: z.string().trim().min(2)
}).refine((value) => !value.openingAt || value.openingAt >= value.deadlineAt, {
  message: '开标时间不得早于投标截止时间', path: ['openingAt']
})

type BidAction = 'SUBMIT_APPROVAL' | 'APPROVE' | 'START_PREPARING' | 'SUBMIT_BID' | 'OPEN' | 'WIN' | 'LOSE' | 'FAIL' | 'ABANDON'
const bidTransitions: Record<BidStatus, Partial<Record<BidAction, BidStatus>>> = {
  DRAFT: { SUBMIT_APPROVAL: 'APPROVAL_PENDING', ABANDON: 'ABANDONED' },
  APPROVAL_PENDING: { APPROVE: 'PREPARING', ABANDON: 'ABANDONED' },
  PREPARING: { SUBMIT_BID: 'SUBMITTED', ABANDON: 'ABANDONED' },
  SUBMITTED: { OPEN: 'OPENED' }, OPENED: { WIN: 'WON', LOSE: 'LOST', FAIL: 'FAILED' },
  WON: {}, LOST: {}, FAILED: {}, ABANDONED: {}
}
export function transitionBid(status: BidStatus, action: BidAction): BidStatus {
  const next = bidTransitions[status][action]
  if (!next) throw new AppError('INVALID_BID_TRANSITION', `投标状态 ${status} 不允许执行 ${action}`, 409)
  return next
}

type BidTaskAction = 'ASSIGN' | 'START' | 'SUBMIT_CHECK' | 'COMPLETE' | 'MARK_OVERDUE' | 'CANCEL'
const taskTransitions: Record<BidTaskStatus, Partial<Record<BidTaskAction, BidTaskStatus>>> = {
  UNASSIGNED: { ASSIGN: 'PENDING', CANCEL: 'CANCELLED' }, PENDING: { START: 'IN_PROGRESS', MARK_OVERDUE: 'OVERDUE', CANCEL: 'CANCELLED' },
  IN_PROGRESS: { SUBMIT_CHECK: 'PENDING_CHECK', MARK_OVERDUE: 'OVERDUE', CANCEL: 'CANCELLED' },
  PENDING_CHECK: { COMPLETE: 'COMPLETED', MARK_OVERDUE: 'OVERDUE' }, COMPLETED: {}, OVERDUE: { START: 'IN_PROGRESS', CANCEL: 'CANCELLED' }, CANCELLED: {}
}
export function transitionBidTask(status: BidTaskStatus, action: BidTaskAction): BidTaskStatus {
  const next = taskTransitions[status][action]
  if (!next) throw new AppError('INVALID_BID_TASK_TRANSITION', `投标任务状态 ${status} 不允许执行 ${action}`, 409)
  return next
}
