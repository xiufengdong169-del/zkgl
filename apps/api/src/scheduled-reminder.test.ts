import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isReminderTimerEvent,
  REMINDER_TRIGGER_NAME,
} from "./scheduled-reminder.js";

const source = readFileSync(
  new URL("./scheduled-reminder.ts", import.meta.url),
  "utf8",
);

describe("scheduled reminder worker", () => {
  it("only accepts the reminder timer trigger", () => {
    expect(
      isReminderTimerEvent({
        Type: "Timer",
        TriggerName: REMINDER_TRIGGER_NAME,
      }),
    ).toBe(true);
    expect(
      isReminderTimerEvent({
        Type: "Timer",
        TriggerName: "zkglExportWorker",
      }),
    ).toBe(false);
    expect(
      isReminderTimerEvent({
        Type: "HTTP",
        TriggerName: REMINDER_TRIGGER_NAME,
      }),
    ).toBe(false);
  });

  it("audits failed scheduled reminders without persisting exception messages or stacks", () => {
    expect(source).toContain('outcome: "FAILED"');
    expect(source).toContain("errorType");
    expect(source).not.toContain("error.message");
    expect(source).not.toContain("error.stack");
  });
});
