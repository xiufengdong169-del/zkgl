import { describe, expect, it } from 'vitest'

import { contactInput, counterpartyInput, visitInput } from './crm.js'

describe('CRM input validation', () => {
  it('联系人必须有联系方式', () => {
    expect(contactInput.safeParse({ counterpartyId: 'c1', name: '张三', ownerId: 'u1' }).success).toBe(false)
  })

  it('接受合法往来单位', () => {
    expect(counterpartyInput.safeParse({ name: '测试客户有限公司', type: 'CUSTOMER', ownerId: 'u1' }).success).toBe(true)
  })

  it('拜访至少包含一名参与人员', () => {
    expect(visitInput.safeParse({
      customerId: 'c1', visitedAt: '2026-07-12T08:00:00.000Z', method: 'ONSITE', participantIds: [],
      purpose: '需求沟通', communication: '沟通内容', ownerId: 'u1'
    }).success).toBe(false)
  })
})
