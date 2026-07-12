import type { ApiResult, SessionUser } from '@zkgl/shared'

import type { AuditWriter } from './audit.js'
import { recordAudit } from './audit.js'
import { AppError } from './errors.js'
import { authorizeAndParseAction } from './actions.js'
import { requireEnabledUser, requirePermission } from './rbac.js'

export interface FunctionEvent {
  action?: unknown
  payload?: unknown
  requestId?: string
  auth?: { uid?: string }
}

export interface Dependencies {
  audit: AuditWriter
  findUserByCloudbaseUid(uid: string): Promise<SessionUser | null>
  execute(action: string, input: unknown, user: SessionUser): Promise<unknown>
}

const requestId = (event: FunctionEvent) => event.requestId || crypto.randomUUID()

export async function handle(event: FunctionEvent, dependencies: Dependencies): Promise<ApiResult<unknown>> {
  const id = requestId(event)
  let user: SessionUser | null = null
  const action = typeof event.action === 'string' ? event.action : 'unknown'
  try {
    user = event.auth?.uid ? await dependencies.findUserByCloudbaseUid(event.auth.uid) : null
    requireEnabledUser(user)
    if (action === 'session.get') return { ok: true, data: user, requestId: id }
    const input = authorizeAndParseAction(user, action, event.payload)
    if (input !== undefined) {
      const data = await dependencies.execute(action, input, user)
      await recordAudit(dependencies.audit, {
        requestId: id, actorUserId: user.id, action, resourceType: action.split('.')[0] || 'api',
        resourceId: null, outcome: 'SUCCESS', ipAddress: null, userAgent: null,
        occurredAt: new Date(), details: {}
      })
      return { ok: true, data, requestId: id }
    }
    requirePermission(user, action)
    throw new AppError('NOT_IMPLEMENTED', `操作尚未实现：${action}`, 501)
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError('INTERNAL_ERROR', '系统内部错误', 500)
    await recordAudit(dependencies.audit, {
      requestId: id,
      actorUserId: user?.id ?? null,
      action,
      resourceType: 'api',
      resourceId: null,
      outcome: appError.status === 403 ? 'DENIED' : 'FAILED',
      ipAddress: null,
      userAgent: null,
      occurredAt: new Date(),
      details: { code: appError.code }
    })
    return { ok: false, error: { code: appError.code, message: appError.message }, requestId: id }
  }
}
