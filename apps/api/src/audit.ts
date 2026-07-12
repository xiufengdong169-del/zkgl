export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED'

export interface AuditEvent {
  requestId: string
  actorUserId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  outcome: AuditOutcome
  ipAddress: string | null
  userAgent: string | null
  occurredAt: Date
  details: Record<string, unknown>
}

export interface AuditWriter {
  write(event: AuditEvent): Promise<void>
}

export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const blocked = /password|secret|token|api.?key|authorization|cookie/i
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, blocked.test(key) ? '[REDACTED]' : value])
  )
}

export async function recordAudit(writer: AuditWriter, event: AuditEvent): Promise<void> {
  await writer.write({ ...event, details: sanitizeAuditDetails(event.details) })
}
