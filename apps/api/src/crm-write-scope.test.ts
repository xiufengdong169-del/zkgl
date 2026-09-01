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

function crmWriteConnection(options: {
  counterpartyAccessible: boolean;
  contactAccessible?: boolean;
}) {
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
        return [
          options.contactAccessible === false ? [] : [{ id: params[0] }],
          [],
        ];
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
  it("continues counterparty numbering after the highest existing code when the rule serial falls behind", async () => {
    const year = new Date().getFullYear();
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const connection = {
      beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
      commit: async () => calls.push({ sql: "COMMIT", params: [] }),
      rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
      release: () => calls.push({ sql: "RELEASE", params: [] }),
      execute: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM sys_number_rule")) {
          return [
            [
              {
                id: 1,
                prefix: "DW",
                serial_length: 4,
                next_serial: 1,
                current_year: year,
                version: 0,
              },
            ],
            [],
          ];
        }
        if (sql.includes("MAX(CAST(SUBSTRING")) return [[{ maxSerial: 3 }], []];
        if (sql.startsWith("INSERT INTO crm_counterparty"))
          return [{ affectedRows: 1, insertId: 14 }, []];
        return [{ affectedRows: 1 }, []];
      },
    };
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = await executor.execute(
      "crm.counterparty.create",
      {
        name: "测试客户有限公司",
        type: "CUSTOMER",
        cooperationStatus: "ACTIVE",
      },
      scopedUser,
    );

    expect(result).toEqual({ id: "14", code: `DW-${year}-0004` });
    expect(
      calls.find((call) => call.sql.startsWith("INSERT INTO crm_counterparty"))
        ?.params[0],
    ).toBe(`DW-${year}-0004`);
    expect(
      calls.find((call) =>
        call.sql.startsWith("UPDATE sys_number_rule SET"),
      )?.params,
    ).toEqual([year, 5, 1, 0]);
  });

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

  it("rejects inactive or deleted contacts before creating visits", async () => {
    const connection = crmWriteConnection({
      counterpartyAccessible: true,
      contactAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "crm.visit.create",
        {
          customerId: "c1",
          contactId: "ct-deleted",
          visitedAt: "2026-07-17T10:00:00.000Z",
          method: "ONSITE",
          participantIds: ["e1"],
          purpose: "沟通需求",
          communication: "客户需求沟通",
          generateLead: false,
        },
        scopedUser,
      ),
    ).rejects.toMatchObject({
      code: "CONTACT_CUSTOMER_MISMATCH",
      status: 409,
    });

    const contactCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_contact WHERE id=?"),
    )!;
    expect(contactCheck.sql).toContain("is_deleted=0");
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO crm_visit"),
      ),
    ).toBe(false);
  });

  it("normalizes ISO datetimes before saving visits and generated leads", async () => {
    const connection = crmWriteConnection({ counterpartyAccessible: true });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "crm.visit.create",
      {
        customerId: "c1",
        contactId: null,
        visitedAt: "2026-08-24T15:30:00.000Z",
        method: "ONSITE",
        location: null,
        participantIds: ["e1"],
        purpose: "测试拜访",
        communication: "测试沟通",
        customerNeeds: "CCCC",
        opportunityAssessment: "RRRRR",
        nextAction: "DFASDFASFSAF",
        nextFollowUpAt: null,
        generateLead: true,
      },
      scopedUser,
    );

    const visitInsert = connection.calls.find((call) =>
      call.sql.startsWith("INSERT INTO crm_visit"),
    )!;
    expect(visitInsert.params[3]).toBe("2026-08-24 15:30:00");

    const leadInsert = connection.calls.find((call) =>
      call.sql.startsWith("INSERT INTO mkt_lead"),
    )!;
    expect(leadInsert.params[8]).toBe("2026-08-24");
  });
});
