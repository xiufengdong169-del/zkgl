import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["FINANCE"],
  permissionCodes: ["deposit.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const depositInput = {
  projectId: "p1",
  bidId: "bid-1",
  contractId: "contract-1",
  depositType: "投标保证金",
  direction: "PAY",
  counterpartyId: "customer-1",
  amount: 10000,
  duePaymentOn: "2026-07-31",
  dueReturnOn: "2026-12-31",
  account: "保证金账户",
};

function depositConnection(options: {
  projectWritable: boolean;
  counterpartyAccessible: boolean;
  bidExists: boolean;
  contractExists: boolean;
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
        return [options.counterpartyAccessible ? [{ id: "customer-1" }] : [], []];
      }
      if (sql.includes("FROM bid_application WHERE id=?")) {
        return [options.bidExists ? [{ id: "bid-1" }] : [], []];
      }
      if (sql.includes("FROM con_contract WHERE id=?")) {
        return [options.contractExists ? [{ id: "contract-1" }] : [], []];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "DEP",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO fin_deposit"))
        return [{ affectedRows: 1, insertId: 99 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("deposit write scopes", () => {
  it("requires counterparty access before creating deposits", async () => {
    const connection = depositConnection({
      projectWritable: true,
      counterpartyAccessible: false,
      bidExists: true,
      contractExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("deposit.create", depositInput, user),
    ).rejects.toMatchObject({
      code: "DEPOSIT_COUNTERPARTY_NOT_FOUND",
      status: 404,
    });

    const counterpartyCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(counterpartyCheck.params).toEqual(["customer-1", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_deposit"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires referenced bids to belong to the same project", async () => {
    const connection = depositConnection({
      projectWritable: true,
      counterpartyAccessible: true,
      bidExists: false,
      contractExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("deposit.create", depositInput, user),
    ).rejects.toMatchObject({
      code: "DEPOSIT_BID_NOT_FOUND",
      status: 404,
    });

    const bidCheck = connection.calls.find((call) =>
      call.sql.includes("FROM bid_application WHERE id=?"),
    )!;
    expect(bidCheck.params).toEqual(["bid-1", "p1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_deposit"),
      ),
    ).toBe(false);
  });

  it("requires referenced contracts to belong to the same project", async () => {
    const connection = depositConnection({
      projectWritable: true,
      counterpartyAccessible: true,
      bidExists: true,
      contractExists: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("deposit.create", depositInput, user),
    ).rejects.toMatchObject({
      code: "DEPOSIT_CONTRACT_NOT_FOUND",
      status: 404,
    });

    const contractCheck = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=?"),
    )!;
    expect(contractCheck.params).toEqual(["contract-1", "p1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_deposit"),
      ),
    ).toBe(false);
  });

  it("creates deposits only after project and reference scopes pass", async () => {
    const connection = depositConnection({
      projectWritable: true,
      counterpartyAccessible: true,
      bidExists: true,
      contractExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("deposit.create", depositInput, user),
    ).resolves.toEqual({ id: "99", code: "DEP-2026-0001" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_deposit"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
