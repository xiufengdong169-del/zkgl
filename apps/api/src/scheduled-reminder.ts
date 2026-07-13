import { randomUUID } from "node:crypto";

import { recordAudit } from "./audit.js";
import { getPool, MySqlAuditWriter, withTransaction } from "./database.js";
import { refreshReminders } from "./reminders.js";

export const REMINDER_TRIGGER_NAME = "zkglDailyReminder";

interface TimerEvent {
  Type?: unknown;
  TriggerName?: unknown;
  Time?: unknown;
  TriggerTime?: unknown;
}

export function isReminderTimerEvent(event: TimerEvent): boolean {
  return event.Type === "Timer" && event.TriggerName === REMINDER_TRIGGER_NAME;
}

export async function main(event: TimerEvent) {
  if (!isReminderTimerEvent(event))
    return { ok: false, ignored: true, reason: "NOT_REMINDER_TIMER" };

  const pool = getPool();
  const requestId = randomUUID();
  try {
    const result = await withTransaction(pool, (connection) =>
      refreshReminders(connection),
    );
    await recordAudit(new MySqlAuditWriter(pool), {
      requestId,
      actorUserId: null,
      action: "reminder.refresh.scheduled",
      resourceType: "reminder",
      resourceId: null,
      outcome: "SUCCESS",
      ipAddress: null,
      userAgent: null,
      occurredAt: new Date(),
      details: {
        created: result.created,
        triggerTime: event.TriggerTime ?? event.Time ?? null,
      },
    });
    return { ok: true, ...result, requestId };
  } catch (error) {
    await recordAudit(new MySqlAuditWriter(pool), {
      requestId,
      actorUserId: null,
      action: "reminder.refresh.scheduled",
      resourceType: "reminder",
      resourceId: null,
      outcome: "FAILED",
      ipAddress: null,
      userAgent: null,
      occurredAt: new Date(),
      details: { errorType: error instanceof Error ? error.name : "Unknown" },
    });
    throw error;
  }
}
