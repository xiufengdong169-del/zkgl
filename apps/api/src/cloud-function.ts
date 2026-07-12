import { getPool, findSessionUserByCloudbaseUid, MySqlAuditWriter } from './database.js'
import { handle, type FunctionEvent } from './handler.js'
import { MySqlActionExecutor } from './persistence.js'
import tcb from '@cloudbase/node-sdk'

interface CloudContext { auth?: { uid?: string }; requestId?: string }
interface HttpLikeEvent extends FunctionEvent {
  body?: string | Record<string, unknown>
  headers?: Record<string, string>
}

export async function main(rawEvent: HttpLikeEvent, context: CloudContext = {}) {
  const pool = getPool()
  const storage=tcb.init({env:process.env.CLOUDBASE_ENV_ID||tcb.SYMBOL_CURRENT_ENV})
  const executor = new MySqlActionExecutor(pool,async(fileId,maxAge)=>{const result=await storage.getTempFileURL({fileList:[{fileID:fileId,maxAge}]});const url=result.fileList?.[0]?.tempFileURL;if(!url)throw new Error('未获取到文件临时地址');return url})
  let body: Partial<FunctionEvent> = {}
  if (typeof rawEvent.body === 'string') {
    try { body = JSON.parse(rawEvent.body) as Partial<FunctionEvent> } catch { body = {} }
  } else if (rawEvent.body && typeof rawEvent.body === 'object') body = rawEvent.body as Partial<FunctionEvent>
  const event: FunctionEvent = { ...rawEvent, ...body }
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
