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
  permissionCodes: ["invoice.application.create"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["p9"] }],
};

const invoiceInput = {
  projectId: "p9",
  contractId: "c9",
  requestedAmount: 1200,
  invoiceType: "VAT_SPECIAL",
  taxRate: 0.06,
  invoiceContent: "software service",
  buyerInformation: "buyer tax info",
  plannedInvoiceOn: "2026-08-01",
  collectionCondition: null,
};

function invoiceApplicationConnection(options?: {
  contractAmount?: string;
  invoicedAmount?: string;
  reservedApplicationAmount?: string;
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
      if (sql.includes("FROM con_contract WHERE id=?"))
        return [
          [
            {
              projectId: "p9",
              amount: options?.contractAmount ?? "5000.00",
              status: "PERFORMING",
            },
          ],
          [],
        ];
      if (sql.includes("FROM prj_project p"))
        return [[{ id: "p9" }], []];
      if (sql.includes("FROM fin_invoice_application a"))
        return [[{ amount: options?.reservedApplicationAmount ?? "0.00" }], []];
      if (sql.includes("FROM fin_sales_invoice"))
        return [[{ used: options?.invoicedAmount ?? "100.00" }], []];
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "KP",
              serial_length: 4,
              next_serial: 8,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO fin_invoice_application"))
        return [{ insertId: 77 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("invoice application write scopes", () => {
  it("stores applicant id as employee id while keeping audit columns as user id", async () => {
    const connection = invoiceApplicationConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("invoice.application.create", invoiceInput, user),
    ).resolves.toMatchObject({ id: "77" });

    const projectCheck = connection.calls.find((call) =>
      call.sql.includes("FROM prj_project p"),
    )!;
    expect(projectCheck.params).toEqual(["p9", 0, "e1", "e1", "p9", "e1"]);
    const insert = connection.calls.find((call) =>
      call.sql.startsWith("INSERT INTO fin_invoice_application"),
    )!;
    expect(insert.params.slice(-3)).toEqual(["e1", "u1", "u1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("blocks invoice applications that exceed capacity reserved by active applications", async () => {
    const connection = invoiceApplicationConnection({
      contractAmount: "1500.00",
      invoicedAmount: "100.00",
      reservedApplicationAmount: "300.00",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("invoice.application.create", invoiceInput, user),
    ).rejects.toMatchObject({ code: "INVOICE_CAPACITY_EXCEEDED" });

    const reservedQuery = connection.calls.find((call) =>
      call.sql.includes("FROM fin_invoice_application a"),
    )!;
    expect(reservedQuery.sql).toContain(
      "a.status IN('DRAFT','APPROVAL_PENDING','RETURNED','PENDING_INVOICE','PARTIALLY_INVOICED')",
    );
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_invoice_application"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
