import { describe, expect, it } from 'vitest'
import { bidApplicationInput, transitionBid, transitionBidTask } from './bids.js'

describe('bidding', () => {
  it('严格按申请、准备、提交、开标和结果推进', () => {
    expect(transitionBid('DRAFT', 'SUBMIT_APPROVAL')).toBe('APPROVAL_PENDING')
    expect(transitionBid('APPROVAL_PENDING', 'APPROVE')).toBe('PREPARING')
    expect(transitionBid('PREPARING', 'SUBMIT_BID')).toBe('SUBMITTED')
    expect(transitionBid('SUBMITTED', 'OPEN')).toBe('OPENED')
    expect(transitionBid('OPENED', 'WIN')).toBe('WON')
  })
  it('禁止未提交就登记开标结果', () => expect(() => transitionBid('PREPARING', 'WIN')).toThrow())
  it('任务必须提交检查后才能完成', () => {
    expect(() => transitionBidTask('IN_PROGRESS', 'COMPLETE')).toThrow()
    expect(transitionBidTask('PENDING_CHECK', 'COMPLETE')).toBe('COMPLETED')
  })
  it('校验开标时间不早于截止时间', () => {
    const base = { projectId: 'p1', tendererId: 'c1', deadlineAt: '2026-08-02T00:00:00.000Z', openingAt: '2026-08-01T00:00:00.000Z', bidMethod: 'ONLINE', businessOwnerId: 'e1', technicalOwnerId: 'e2', pricingOwnerId: 'e3', applicationReason: '参与投标' }
    expect(bidApplicationInput.safeParse(base).success).toBe(false)
  })
})
