import type { DataScope, SessionUser } from '@zkgl/shared'
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'

import type { AuditEvent, AuditWriter } from './audit.js'
import { AppError } from './errors.js'

const databaseEnvironment = z.object({
  DB_HOST: z.string().min(1), DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1), DB_USER: z.string().min(1), DB_PASSWORD: z.string().min(1)
})

let singletonPool: Pool | undefined
export function getPool(environment: NodeJS.ProcessEnv = process.env): Pool {
  if (singletonPool) return singletonPool
  const config = databaseEnvironment.parse(environment)
  singletonPool = mysql.createPool({
    host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME, user: config.DB_USER, password: config.DB_PASSWORD,
    charset: 'utf8mb4', connectionLimit: 10, waitForConnections: true, queueLimit: 0,
    decimalNumbers: false, enableKeepAlive: true
  })
  return singletonPool
}

export async function withTransaction<T>(pool: Pool, work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

interface UserRow extends RowDataPacket { id: string; cloudbase_uid: string; employee_id: string; department_id: string; status: string }
interface CodeRow extends RowDataPacket { code: string }
interface ScopeRow extends RowDataPacket { scope_type: string; scope_value: string | null }

function mapScope(row: ScopeRow, userId: string, departmentId: string): DataScope | null {
  switch (row.scope_type) {
    case 'ALL': return { type: 'ALL' }
    case 'SELF': return { type: 'SELF', userId }
    case 'OWNER': return { type: 'OWNER', userId }
    case 'CREATOR': return { type: 'CREATOR', userId }
    case 'PARTICIPANT': return { type: 'PARTICIPANT', userId }
    case 'DEPARTMENT': return { type: 'DEPARTMENT', departmentIds: [row.scope_value ?? departmentId] }
    case 'PROJECT': return row.scope_value ? { type: 'PROJECT', projectIds: [row.scope_value] } : null
    default: return null
  }
}

export async function findSessionUserByCloudbaseUid(pool: Pool, uid: string): Promise<SessionUser | null> {
  const [users] = await pool.execute<UserRow[]>(
    `SELECT CAST(id AS CHAR) id, cloudbase_uid, CAST(employee_id AS CHAR) employee_id,
            CAST(department_id AS CHAR) department_id, status
       FROM iam_user WHERE cloudbase_uid = ? AND is_deleted = 0 LIMIT 1`, [uid]
  )
  const user = users[0]
  if (!user) return null
  const [roles] = await pool.execute<CodeRow[]>(
    `SELECT r.code FROM iam_role r JOIN iam_user_role ur ON ur.role_id=r.id
      WHERE ur.user_id=? AND r.status='ENABLED' AND r.is_deleted=0`, [user.id]
  )
  const [permissions] = await pool.execute<CodeRow[]>(
    `SELECT DISTINCT p.code FROM iam_permission p JOIN iam_role_permission rp ON rp.permission_id=p.id
      JOIN iam_user_role ur ON ur.role_id=rp.role_id WHERE ur.user_id=?`, [user.id]
  )
  const [scopes] = await pool.execute<ScopeRow[]>(
    `SELECT s.scope_type,s.scope_value FROM iam_role_data_scope s JOIN iam_user_role ur ON ur.role_id=s.role_id
      WHERE ur.user_id=? AND s.status='ENABLED'`, [user.id]
  )
  return {
    id: user.id, cloudbaseUid: user.cloudbase_uid, employeeId: user.employee_id, departmentId: user.department_id,
    enabled: user.status === 'ENABLED', roleCodes: roles.map((row) => row.code),
    permissionCodes: permissions.map((row) => row.code),
    dataScopes: scopes.map((row) => mapScope(row, user.id, user.department_id)).filter((scope): scope is DataScope => scope !== null)
  }
}

export class MySqlAuditWriter implements AuditWriter {
  constructor(private readonly pool: Pool) {}
  async write(event: AuditEvent): Promise<void> {
    await this.pool.execute(
      `INSERT INTO sys_audit_log
       (request_id,actor_user_id,action,resource_type,resource_id,outcome,ip_address,user_agent,details,occurred_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [event.requestId, event.actorUserId, event.action, event.resourceType, event.resourceId, event.outcome,
        event.ipAddress, event.userAgent, JSON.stringify(event.details), event.occurredAt]
    )
  }
}

export function assertAffectedRows(count: number, message: string): void {
  if (count !== 1) throw new AppError('CONCURRENT_WRITE_CONFLICT', message, 409)
}
