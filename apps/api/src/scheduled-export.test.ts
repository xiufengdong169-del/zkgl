import { describe, expect, it } from "vitest";

import { EXPORT_TRIGGER_NAME, isExportTimerEvent } from "./scheduled-export.js";

describe("scheduled export worker", () => {
  it("only accepts the export worker timer trigger", () => {
    expect(isExportTimerEvent({ Type: "Timer", TriggerName: EXPORT_TRIGGER_NAME })).toBe(true);
    expect(isExportTimerEvent({ Type: "Timer", TriggerName: "zkglDailyReminder" })).toBe(false);
    expect(isExportTimerEvent({ Type: "HTTP", TriggerName: EXPORT_TRIGGER_NAME })).toBe(false);
  });
});
