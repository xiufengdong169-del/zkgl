import type { SessionUser } from '@zkgl/shared'
import { describe, expect, it } from 'vitest'

import { authorizeAndParseAction } from './actions.js'
import { ForbiddenError } from './errors.js'

const user: SessionUser = {
  id: 'u1', cloudbaseUid: 'cb1', employeeId: 'e1', departmentId: 'd1', enabled: true,
  roleCodes: ['MARKET'], permissionCodes: ['crm.counterparty.create'], dataScopes: [{ type: 'ALL' }]
}

describe('domain actions', () => {
  it('校验并接受有权限的客户创建命令', () => {
    const result = authorizeAndParseAction(user, 'crm.counterparty.create', {
      name: '测试客户有限公司', type: 'CUSTOMER', ownerId: 'u1'
    })
    expect(result).toMatchObject({ name: '测试客户有限公司', cooperationStatus: 'POTENTIAL' })
  })

  it('拒绝无权限创建线索', () => {
    expect(() => authorizeAndParseAction(user, 'lead.create', {})).toThrow(ForbiddenError)
  })
})
