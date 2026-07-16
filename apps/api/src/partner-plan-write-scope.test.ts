import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_MANAGER"],
  permissionCodes: ["partner.plan.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const planInput = {
  projectId: "p1",
  partnerId: "partner-1",
  settlementMethod: "RATIO",
  ratio: 0.2,
  calculationBasis: "ACTUAL_RECEIPTS",
  deductibleCostScope: [],
  effectiveFrom: "2026-07-17",
};

function partnerPlanConnection(options: {
  projectWritable: boolean;
  partnerAccessible: boolean;
  existingRatio?: number;
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
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [options.projectWritable ? [{ id: "p1" }] : [], []];
      if (sql.includes("FROM crm_counterparty WHERE id=?")) {
        return [options.partnerAccessible ? [{ id: "partner-1" }] : [], []];
      }
      if (sql.includes("FROM partner_plan p JOIN partner_plan_version")) {
        return [
          options.existingRatio == null ? [] : [{ ratio: options.existingRatio }],
          [],
        ];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "PP",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO partner_plan"))
        return [{ affectedRows: 1, insertId: 88 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("partner plan write scopes", () => {
  it("requires partner counterparty access before creating plans", async () => {
    const connection = partnerPlanConnection({
      projectWritable: true,
      partnerAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("partner.plan.create", planInput, user),
    ).rejects.toMatchObject({
      code: "PARTNER_PLAN_COUNTERPARTY_NOT_FOUND",
      status: 404,
    });

    const partnerCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(partnerCheck.params).toEqual(["partner-1", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM partner_plan p JOIN partner_plan_version"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO partner_plan"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("keeps ratio limits after partner scope passes", async () => {
    const connection = partnerPlanConnection({
      projectWritable: true,
      partnerAccessible: true,
      existingRatio: 0.9,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("partner.plan.create", planInput, user),
    ).rejects.toMatchObject({
      code: "PARTNER_RATIO_EXCEEDED",
      status: 409,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM partner_plan p JOIN partner_plan_version"),
      ),
    ).toBe(true);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO partner_plan"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates plans only after project and partner scopes pass", async () => {
    const connection = partnerPlanConnection({
      projectWritable: true,
      partnerAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("partner.plan.create", planInput, user),
    ).resolves.toEqual({ id: "88", code: "PP-2026-0001", version: 1 });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO partner_plan"),
      ),
    ).toBe(true);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO partner_plan_version"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
