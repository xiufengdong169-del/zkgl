import { describe, expect, it, vi } from "vitest";

import {
  buildReminderStatements,
  refreshReminders,
  reminderStatements,
} from "./reminders.js";
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

  it("读取系统参数后逐项执行幂等提醒 SQL 并汇总新增消息数", async () => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("FROM sys_parameter"))
        return [
          [
            {
              paramKey: "reminder.contract_expiry_days",
              paramValue: "45",
            },
            { paramKey: "reminder.bid_deadline_days", paramValue: "14" },
          ],
          [],
        ];
      return [{ affectedRows: 2 }];
    });

    await expect(refreshReminders({ execute } as never)).resolves.toEqual({
      created: reminderStatements.length * 2,
    });

    expect(execute).toHaveBeenCalledTimes(reminderStatements.length + 1);
    const executedSql = execute.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(executedSql).toContain("INTERVAL 45 DAY");
    expect(executedSql).toContain("INTERVAL 14 DAY");
    for (const sql of reminderStatements) expect(sql).toContain("NOT EXISTS");
  });

  it("参数非法时回退默认提醒提前天数", () => {
    const sql = buildReminderStatements({
      contractExpiryDays: 99999,
      bidDeadlineDays: Number.NaN,
    }).join("\n");

    expect(sql).toContain("INTERVAL 30 DAY");
    expect(sql).toContain("INTERVAL 7 DAY");
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

  it("prevents duplicate reminders by recipient, type, business id and recent window", () => {
    for (const sql of reminderStatements) {
      const messageType = /,'([^']+)',CONCAT/.exec(sql)?.[1];

      expect(messageType).toBeTruthy();
      expect(sql).toContain("NOT EXISTS(SELECT 1 FROM sys_message m WHERE");
      expect(sql).toContain("m.recipient_id=");
      expect(sql).toContain(`m.message_type='${messageType}'`);
      expect(sql).toContain("m.business_id=");
      expect(sql).toContain("m.created_at>=DATE_SUB(NOW(),INTERVAL");
    }
  });
});
