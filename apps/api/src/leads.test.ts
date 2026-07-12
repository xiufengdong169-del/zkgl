import { describe, expect, it } from 'vitest'

import { AppError } from './errors.js'
import { leadInput, transitionLead } from './leads.js'

describe('lead workflow', () => {
  it('按报备流程推进线索', () => {
    expect(transitionLead('DRAFT', 'SUBMIT')).toBe('PENDING_REGISTRATION')
    expect(transitionLead('PENDING_REGISTRATION', 'APPROVE')).toBe('FOLLOWING')
    expect(transitionLead('FOLLOWING', 'CONVERT')).toBe('CONVERTED')
  })

  it('拒绝客户端跳过报备直接转项目', () => {
    expect(() => transitionLead('DRAFT', 'CONVERT')).toThrow(AppError)
  })

  it('限制成功概率范围', () => {
    const result = leadInput.safeParse({
      projectName: '测试项目', customerId: 'c1', sourceCode: 'VISIT', discoveredOn: '2026-07-12',
      projectType: 'CONSULTING', requirementSummary: '项目需求', successProbability: 101,
      ownerId: 'u1', collaboratorIds: []
    })
    expect(result.success).toBe(false)
  })
})
