import { getPool, findSessionUserByCloudbaseUid, MySqlAuditWriter } from './database.js'
import { handle, type FunctionEvent } from './handler.js'
import { MySqlActionExecutor } from './persistence.js'

interface CloudContext { auth?: { uid?: string }; requestId?: string }

export async function main(event: FunctionEvent, context: CloudContext = {}) {
  const pool = getPool()
  const executor = new MySqlActionExecutor(pool)
  const requestId = event.requestId ?? context.requestId
  const auth = event.auth?.uid ? event.auth : context.auth
  const normalizedEvent: FunctionEvent = {
    ...event,
    ...(requestId ? { requestId } : {}),
    ...(auth ? { auth } : {})
  }
  return handle(normalizedEvent, {
    audit: new MySqlAuditWriter(pool),
    findUserByCloudbaseUid: (uid) => findSessionUserByCloudbaseUid(pool, uid),
    execute: (action, input, user) => executor.execute(action, input, user)
  })
}
