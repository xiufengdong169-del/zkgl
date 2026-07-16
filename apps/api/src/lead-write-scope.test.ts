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

const leadCreateInput = {
  projectName: "智慧园区平台",
  customerId: "c1",
  sourceCode: "CUSTOMER_VISIT",
  sourceDescription: "现场拜访形成机会",
  discoveredOn: "2026-07-17",
  estimatedAmount: 100000,
  projectType: "SOFTWARE",
  requirementSummary: "客户需要全过程项目管理系统",
  successProbability: 45,
  sourceVisitId: "v1",
};

function leadCreateConnection(options: {
  customerAccessible: boolean;
  sourceVisitAccessible: boolean;
  duplicate?: boolean;
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
        return [options.customerAccessible ? [{ id: "c1" }] : [], []];
      }
      if (sql.includes("FROM crm_visit WHERE id=?")) {
        return [options.sourceVisitAccessible ? [{ id: "v1" }] : [], []];
      }
      if (sql.includes("FROM mkt_lead") && sql.includes("customer_id=?")) {
        return [
          options.duplicate ? [{ id: "lead-1", code: "LEAD-2026-0001" }] : [],
          [],
        ];
      }
      if (sql.includes("FROM sys_number_rule")) {
        return [
          [
            {
              id: 1,
              prefix: "LEAD",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      }
      if (sql.startsWith("INSERT INTO mkt_lead")) {
        return [{ affectedRows: 1, insertId: 33 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("lead write data scopes", () => {
  it("requires accessible customer ownership before creating leads", async () => {
    const connection = leadCreateConnection({
      customerAccessible: false,
      sourceVisitAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("lead.create", leadCreateInput, scopedUser),
    ).rejects.toMatchObject({
      code: "LEAD_CUSTOMER_NOT_FOUND",
      status: 404,
    });

    const access = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(access.sql).toContain("owner_id=?");
    expect(access.params).toEqual(["c1", 0, "e1"]);
    expect(
      connection.calls.some((call) => call.sql.includes("FROM sys_number_rule")),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO mkt_lead"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires accessible same-customer source visits before creating leads", async () => {
    const connection = leadCreateConnection({
      customerAccessible: true,
      sourceVisitAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("lead.create", leadCreateInput, scopedUser),
    ).rejects.toMatchObject({
      code: "LEAD_SOURCE_VISIT_NOT_FOUND",
      status: 404,
    });

    const visitAccess = connection.calls.find((call) =>
      call.sql.includes("FROM crm_visit WHERE id=?"),
    )!;
    expect(visitAccess.sql).toContain("customer_id=?");
    expect(visitAccess.sql).toContain("owner_id=? OR created_by=?");
    expect(visitAccess.params).toEqual(["v1", "c1", 0, "e1", "u1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO mkt_lead"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates leads only after customer and source visit scopes pass", async () => {
    const connection = leadCreateConnection({
      customerAccessible: true,
      sourceVisitAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("lead.create", leadCreateInput, scopedUser),
    ).resolves.toEqual({ id: "33", code: "LEAD-2026-0001" });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM mkt_lead") && call.sql.includes("customer_id=?"),
      ),
    ).toBe(true);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO mkt_lead"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

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
