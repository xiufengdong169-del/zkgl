import { describe, expect, it } from 'vitest'

import { deriveAuditResourceId, sanitizeAuditDetails } from './audit.js'

describe('audit sanitization', () => {
  it('遮蔽敏感字段', () => {
    expect(sanitizeAuditDetails({ token: 'abc', projectId: 'p-1' })).toEqual({
      token: '[REDACTED]',
      projectId: 'p-1'
    })
  })
  it('记录系统管理动作的资源 ID', () => {
    expect(deriveAuditResourceId({ roleId: 'r-admin' })).toBe('r-admin')
    expect(deriveAuditResourceId({ nodeId: 'wf-node-1' })).toBe('wf-node-1')
  })

  it('优先使用执行结果里的新建资源 ID', () => {
    expect(
      deriveAuditResourceId({ departmentId: 'old-dept' }, { id: 'new-dept' })
    ).toBe('new-dept')
  })
})
