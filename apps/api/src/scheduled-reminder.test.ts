import { describe, expect, it } from "vitest";

import {
  isReminderTimerEvent,
  REMINDER_TRIGGER_NAME,
} from "./scheduled-reminder.js";

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
});
