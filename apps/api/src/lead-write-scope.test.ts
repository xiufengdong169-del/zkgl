import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["MARKET"],
  permissionCodes: ["lead.create", "lead.followUp.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function leadWriteConnection(options: { accessible: boolean }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM mkt_lead WHERE id=?")) {
        return [options.accessible ? [{ status: "FOLLOWING" }] : [], []];
      }
      return [{ affectedRows: 1, insertId: 11 }, []];
    },
  };
}

describe("lead write data scopes", () => {
  it("requires owner or creator visibility before closing leads", async () => {
    const connection = leadWriteConnection({ accessible: true });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "lead.close",
      { leadId: "lead-1", reason: "客户确认无需求" },
      scopedUser,
    );

    const lock = connection.calls.find((call) =>
      call.sql.includes("FROM mkt_lead WHERE id=?"),
    )!;
    expect(lock.sql).toContain("owner_id=? OR created_by=?");
    expect(lock.params).toEqual(["lead-1", 0, "e1", "u1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE mkt_lead SET status="),
      ),
    ).toBe(true);
  });

  it("does not write follow-ups when lead scope checks fail", async () => {
    const connection = leadWriteConnection({ accessible: false });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "lead.followUp.create",
        {
          leadId: "lead-out",
          followedUpAt: "2026-07-17T10:00:00.000Z",
          method: "PHONE",
          participantIds: ["e1"],
          communication: "沟通项目需求",
          successProbability: 30,
          nextAction: "继续跟进",
          nextFollowUpAt: "2026-07-24",
        },
        scopedUser,
      ),
    ).rejects.toMatchObject({ code: "LEAD_NOT_FOUND", status: 404 });

    const lock = connection.calls.find((call) =>
      call.sql.includes("FROM mkt_lead WHERE id=?"),
    )!;
    expect(lock.sql).toContain("owner_id=? OR created_by=?");
    expect(lock.params).toEqual(["lead-out", 0, "e1", "u1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO mkt_lead_follow_up"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE mkt_lead SET success_probability="),
      ),
    ).toBe(false);
  });
});
