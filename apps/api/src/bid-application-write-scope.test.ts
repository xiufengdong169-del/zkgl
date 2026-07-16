import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["BID"],
  permissionCodes: ["bid.application.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const bidInput = {
  projectId: "p1",
  tendererId: "customer-1",
  agencyId: "agency-1",
  tenderNumber: "T-2026-001",
  projectBudget: 100000,
  bidCeiling: 120000,
  deadlineAt: "2026-08-01T10:00:00.000Z",
  openingAt: "2026-08-01T11:00:00.000Z",
  bidMethod: "公开招标",
  depositAmount: 10000,
  documentFee: 500,
  businessOwnerId: "e1",
  technicalOwnerId: "e1",
  pricingOwnerId: "e1",
  applicationReason: "客户发布正式招标公告",
};

function bidApplicationConnection(options: {
  projectWritable: boolean;
  accessibleCounterpartyIds: string[];
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
      if (sql.includes("FROM crm_counterparty WHERE id IN")) {
        return [
          options.accessibleCounterpartyIds.map((id) => ({ id })),
          [],
        ];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "BID",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO bid_application"))
        return [{ affectedRows: 1, insertId: 101 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("bid application write scopes", () => {
  it("requires access to tenderer and agency counterparties before creating bids", async () => {
    const connection = bidApplicationConnection({
      projectWritable: true,
      accessibleCounterpartyIds: ["customer-1"],
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.application.create", bidInput, user),
    ).rejects.toMatchObject({
      code: "BID_COUNTERPARTY_NOT_FOUND",
      status: 404,
    });

    const counterpartyCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id IN"),
    )!;
    expect(counterpartyCheck.params).toEqual([
      "customer-1",
      "agency-1",
      0,
      "e1",
    ]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_application"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates bids only after project and counterparty scopes pass", async () => {
    const connection = bidApplicationConnection({
      projectWritable: true,
      accessibleCounterpartyIds: ["customer-1", "agency-1"],
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.application.create", bidInput, user),
    ).resolves.toEqual({ id: "101", code: "BID-2026-0001" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_application"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
