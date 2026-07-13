import { describe, expect, it, vi } from "vitest";
import { refreshReminders, reminderStatements } from "./reminders.js";
import {
  isReminderTimerEvent,
  REMINDER_TRIGGER_NAME,
} from "./scheduled-reminder.js";

describe("scheduled reminders", () => {
  it("仅接受部署配置中的 CloudBase 定时触发器", () => {
    expect(
      isReminderTimerEvent({
        Type: "Timer",
        TriggerName: REMINDER_TRIGGER_NAME,
      }),
    ).toBe(true);
    expect(isReminderTimerEvent({ Type: "Timer", TriggerName: "other" })).toBe(
      false,
    );
    expect(
      isReminderTimerEvent({
        Type: "HTTP",
        TriggerName: REMINDER_TRIGGER_NAME,
      }),
    ).toBe(false);
  });

  it("逐项执行幂等提醒 SQL 并汇总新增消息数", async () => {
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 2 }]);
    await expect(refreshReminders({ execute } as never)).resolves.toEqual({
      created: reminderStatements.length * 2,
    });
    expect(execute).toHaveBeenCalledTimes(reminderStatements.length);
    for (const sql of reminderStatements) expect(sql).toContain("NOT EXISTS");
  });

  it("覆盖合同、投标、保证金、先开工、结项和风险提醒", () => {
    const sql = reminderStatements.join("\n");
    expect(sql).toContain("'CONTRACT_EXPIRY'");
    expect(sql).toContain("'BID_DEADLINE'");
    expect(sql).toContain("'DEPOSIT_OVERDUE'");
    expect(sql).toContain("'DEPOSIT_PAYMENT_OVERDUE'");
    expect(sql).toContain("'EARLY_START_CONTRACT_MISSING'");
    expect(sql).toContain("'CLOSE_OPEN_ITEM_OVERDUE'");
    expect(sql).toContain("'RISK_DUE'");
  });
});
