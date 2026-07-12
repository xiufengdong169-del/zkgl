import type { SessionUser } from '@zkgl/shared'
import { describe, expect, it } from 'vitest'

import { ForbiddenError } from './errors.js'
import { requireDataAccess, requirePermission } from './rbac.js'

const user: SessionUser = {
  id: 'u-1',
  cloudbaseUid: 'cb-1',
  employeeId: 'e-1',
  departmentId: 'd-1',
  enabled: true,
  roleCodes: ['PROJECT_MEMBER'],
  permissionCodes: ['project.read'],
  dataScopes: [{ type: 'PROJECT', projectIds: ['p-1'] }]
}

describe('RBAC', () => {
  it('允许已授予的功能权限', () => {
    expect(() => requirePermission(user, 'project.read')).not.toThrow()
  })

  it('拒绝未授予的功能权限', () => {
    expect(() => requirePermission(user, 'project.export')).toThrow(ForbiddenError)
  })

  it('按项目数据范围拒绝无关项目', () => {
    expect(() => requireDataAccess(user, { projectId: 'p-2' })).toThrow(ForbiddenError)
  })
})
