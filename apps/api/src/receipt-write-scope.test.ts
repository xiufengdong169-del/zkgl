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
  permissionCodes: ["receipt.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const receiptInput = {
  projectId: "p1",
  contractId: "contract-1",
  customerId: "customer-1",
  receivedOn: "2026-07-17",
  amount: 50000,
  receivingAccount: "公司收款账户",
  payerName: "客户付款户名",
  payerAccount: "客户付款账号",
  receiptType: "NORMAL",
  voucherNumber: "RV-001",
};

function receiptConnection(options: {
  projectWritable: boolean;
  contractExists: boolean;
  contractPartyIds?: string[];
  customerAccessible: boolean;
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
      if (sql.includes("FROM con_contract WHERE id=?")) {
        const parties = options.contractPartyIds ?? ["customer-1", "company-1"];
        return [
          options.contractExists
            ? [{ id: "contract-1", partyAId: parties[0], partyBId: parties[1] }]
            : [],
          [],
        ];
      }
      if (sql.includes("FROM crm_counterparty WHERE id=?")) {
        return [options.customerAccessible ? [{ id: "customer-1" }] : [], []];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "RC",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO fin_receipt"))
        return [{ affectedRows: 1, insertId: 88 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("receipt write scopes", () => {
  it("requires income contracts to belong to the same project", async () => {
    const connection = receiptConnection({
      projectWritable: true,
      contractExists: false,
      customerAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("receipt.create", receiptInput, user),
    ).rejects.toMatchObject({
      code: "RECEIPT_CONTRACT_NOT_FOUND",
      status: 404,
    });

    const contractCheck = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=?"),
    )!;
    expect(contractCheck.params).toEqual(["contract-1", "p1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_receipt"),
      ),
    ).toBe(false);
  });

  it("requires receipt customer to match the income contract party", async () => {
    const connection = receiptConnection({
      projectWritable: true,
      contractExists: true,
      contractPartyIds: ["other-customer", "company-1"],
      customerAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("receipt.create", receiptInput, user),
    ).rejects.toMatchObject({
      code: "RECEIPT_CUSTOMER_CONTRACT_MISMATCH",
      status: 409,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM crm_counterparty WHERE id=?"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_receipt"),
      ),
    ).toBe(false);
  });

  it("requires customer counterparty access before creating receipts", async () => {
    const connection = receiptConnection({
      projectWritable: true,
      contractExists: true,
      customerAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("receipt.create", receiptInput, user),
    ).rejects.toMatchObject({
      code: "RECEIPT_CUSTOMER_NOT_FOUND",
      status: 404,
    });

    const customerCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(customerCheck.params).toEqual(["customer-1", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_receipt"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates receipts only after project, contract and customer scopes pass", async () => {
    const connection = receiptConnection({
      projectWritable: true,
      contractExists: true,
      customerAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("receipt.create", receiptInput, user),
    ).resolves.toEqual({ id: "88", code: "RC-2026-0001" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_receipt"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
