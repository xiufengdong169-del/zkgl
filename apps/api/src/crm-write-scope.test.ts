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
  permissionCodes: ["crm.contact.create", "crm.visit.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function crmWriteConnection(options: { counterpartyAccessible: boolean }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM crm_counterparty WHERE id=?")) {
        return [
          options.counterpartyAccessible ? [{ id: params[0] }] : [],
          [],
        ];
      }
      if (sql.includes("FROM crm_contact WHERE id=?"))
        return [[{ id: params[0] }], []];
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "VISIT",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      return [{ affectedRows: 1, insertId: 22 }, []];
    },
  };
}

describe("CRM write data scopes", () => {
  it("requires counterparty ownership before creating contacts", async () => {
    const connection = crmWriteConnection({ counterpartyAccessible: true });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "crm.contact.create",
      {
        counterpartyId: "c1",
        name: "张三",
        mobile: "13800138000",
      },
      scopedUser,
    );

    const access = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(access.sql).toContain("owner_id=?");
    expect(access.params).toEqual(["c1", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO crm_contact"),
      ),
    ).toBe(true);
  });

  it("does not create visits or generated leads when counterparty scope checks fail", async () => {
    const connection = crmWriteConnection({ counterpartyAccessible: false });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "crm.visit.create",
        {
          customerId: "c-out",
          contactId: "ct1",
          visitedAt: "2026-07-17T10:00:00.000Z",
          method: "ONSITE",
          participantIds: ["e1"],
          purpose: "沟通需求",
          communication: "客户需求沟通",
          generateLead: true,
        },
        scopedUser,
      ),
    ).rejects.toMatchObject({ code: "COUNTERPARTY_NOT_FOUND", status: 404 });

    const access = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(access.sql).toContain("owner_id=?");
    expect(access.params).toEqual(["c-out", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO crm_visit"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO mkt_lead"),
      ),
    ).toBe(false);
  });
});
