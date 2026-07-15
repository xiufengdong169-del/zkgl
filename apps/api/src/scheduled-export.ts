import { randomUUID } from "node:crypto";

import tcb from "@cloudbase/node-sdk";

import { recordAudit } from "./audit.js";
import { getPool, MySqlAuditWriter, withTransaction } from "./database.js";
import { processPendingProjectExportTasks } from "./export-tasks.js";

export const EXPORT_TRIGGER_NAME = "zkglExportWorker";

interface TimerEvent {
  Type?: unknown;
  TriggerName?: unknown;
  Time?: unknown;
  TriggerTime?: unknown;
}

export function isExportTimerEvent(event: TimerEvent): boolean {
  return event.Type === "Timer" && event.TriggerName === EXPORT_TRIGGER_NAME;
}

export async function main(event: TimerEvent) {
  if (!isExportTimerEvent(event))
    return { ok: false, ignored: true, reason: "NOT_EXPORT_TIMER" };

  const pool = getPool();
  const storage = tcb.init({
    env: process.env.CLOUDBASE_ENV_ID || tcb.SYMBOL_CURRENT_ENV,
  });
  const requestId = randomUUID();
  try {
    const result = await withTransaction(pool, (connection) =>
      processPendingProjectExportTasks(connection, {
        uploadFile: async (cloudPath, fileContent) => {
          const uploaded = await storage.uploadFile({ cloudPath, fileContent });
          return uploaded.fileID;
        },
      }),
    );
    await recordAudit(new MySqlAuditWriter(pool), {
      requestId,
      actorUserId: null,
      action: "export.process.scheduled",
      resourceType: "export_task",
      resourceId: null,
      outcome: "SUCCESS",
      ipAddress: null,
      userAgent: null,
      occurredAt: new Date(),
      details: {
        ...result,
        triggerTime: event.TriggerTime ?? event.Time ?? null,
      },
    });
    return { ok: true, ...result, requestId };
  } catch (error) {
    await recordAudit(new MySqlAuditWriter(pool), {
      requestId,
      actorUserId: null,
      action: "export.process.scheduled",
      resourceType: "export_task",
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
