export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILED";

export interface AuditEvent {
  requestId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: Date;
  details: Record<string, unknown>;
}

export interface AuditWriter {
  write(event: AuditEvent): Promise<void>;
}

export function sanitizeAuditDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeAuditObject(details);
}

const blockedAuditDetailKey =
  /password|secret|token|api.?key|authorization|cookie|bank.?account|receiving.?account|paying.?account|payer.?account|buyer.?information/i;

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (!value || typeof value !== "object") return value;
  if (Object.prototype.toString.call(value) !== "[object Object]") return value;
  return sanitizeAuditObject(value as Record<string, unknown>);
}

function sanitizeAuditObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      blockedAuditDetailKey.test(key) ? "[REDACTED]" : sanitizeAuditValue(item),
    ]),
  );
}

export async function recordAudit(
  writer: AuditWriter,
  event: AuditEvent,
): Promise<void> {
  await writer.write({
    ...event,
    details: sanitizeAuditDetails(event.details),
  });
}

const resourceIdKeys = [
  "businessId",
  "projectId",
  "applicationId",
  "leadId",
  "bidId",
  "contractId",
  "changeId",
  "milestoneId",
  "paymentId",
  "receiptId",
  "invoiceId",
  "reimbursementId",
  "purchaseId",
  "planId",
  "settlementId",
  "depositId",
  "deliverableId",
  "acceptanceId",
  "riskId",
  "stageId",
  "fileId",
  "instanceId",
  "taskId",
  "messageId",
  "roleId",
  "userId",
  "employeeId",
  "departmentId",
  "assignmentId",
  "grantId",
  "ruleId",
  "parameterId",
  "typeId",
  "itemId",
  "nodeId",
] as const;

function recordId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function deriveAuditResourceId(
  input: unknown,
  result?: unknown,
): string | null {
  if (result && typeof result === "object") {
    const resultId = recordId((result as Record<string, unknown>).id);
    if (resultId) return resultId;
  }
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  for (const key of resourceIdKeys) {
    const id = recordId(record[key]);
    if (id) return id;
  }
  return null;
}

export function auditResourceType(action: string): string {
  const segments = action.split(".").filter(Boolean);
  return segments.slice(0, Math.min(2, segments.length)).join(".") || "api";
}

export function auditInputKeys(input: unknown): string[] {
  return input && typeof input === "object" && !Array.isArray(input)
    ? Object.keys(input as Record<string, unknown>).sort()
    : [];
}
