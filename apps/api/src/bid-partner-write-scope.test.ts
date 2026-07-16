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

const partnerInput = {
  leadId: "lead-1",
  partnerId: "partner-1",
  finalCustomerId: "customer-1",
  cooperationType: "联合投标",
  registrationAt: null,
  quotationAt: null,
  biddingAt: null,
  ourQuotation: 100000,
  result: null,
  description: "合作方参与投标",
};

function bidPartnerConnection(options: {
  leadAccessible: boolean;
  leadCustomerId?: string;
  accessibleCounterpartyIds?: string[];
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
      if (sql.includes("FROM mkt_lead WHERE id=?")) {
        return [
          options.leadAccessible
            ? [{ customerId: options.leadCustomerId ?? "customer-1" }]
            : [],
          [],
        ];
      }
      if (sql.includes("FROM crm_counterparty WHERE id IN")) {
        return [
          (options.accessibleCounterpartyIds ?? []).map((id) => ({ id })),
          [],
        ];
      }
      if (sql.startsWith("INSERT INTO bid_partner_cooperation")) {
        return [{ affectedRows: 1, insertId: 55 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("bid partner write scopes", () => {
  it("requires lead access when creating lead-based partner cooperation", async () => {
    const connection = bidPartnerConnection({ leadAccessible: false });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.partner.create", partnerInput, user),
    ).rejects.toMatchObject({
      code: "BID_PARTNER_LEAD_NOT_FOUND",
      status: 404,
    });

    const leadCheck = connection.calls.find((call) =>
      call.sql.includes("FROM mkt_lead WHERE id=?"),
    )!;
    expect(leadCheck.params).toEqual(["lead-1", 0, "e1", "u1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_partner_cooperation"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires final customer to match the source lead customer", async () => {
    const connection = bidPartnerConnection({
      leadAccessible: true,
      leadCustomerId: "customer-other",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.partner.create", partnerInput, user),
    ).rejects.toMatchObject({
      code: "BID_PARTNER_LEAD_CUSTOMER_MISMATCH",
      status: 409,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM crm_counterparty WHERE id IN"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_partner_cooperation"),
      ),
    ).toBe(false);
  });

  it("requires access to both partner and final customer counterparties", async () => {
    const connection = bidPartnerConnection({
      leadAccessible: true,
      accessibleCounterpartyIds: ["partner-1"],
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.partner.create", partnerInput, user),
    ).rejects.toMatchObject({
      code: "BID_PARTNER_COUNTERPARTY_NOT_FOUND",
      status: 404,
    });

    const counterpartyCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id IN"),
    )!;
    expect(counterpartyCheck.params).toEqual([
      "partner-1",
      "customer-1",
      0,
      "e1",
    ]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_partner_cooperation"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates partner cooperation only after all referenced scopes pass", async () => {
    const connection = bidPartnerConnection({
      leadAccessible: true,
      accessibleCounterpartyIds: ["partner-1", "customer-1"],
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("bid.partner.create", partnerInput, user),
    ).resolves.toEqual({ id: "55" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO bid_partner_cooperation"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
