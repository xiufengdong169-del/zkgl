import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_MEMBER"],
  permissionCodes: ["daily.purchase.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function purchaseConnection(purchase: {
  applicantId: string;
  projectId: string | null;
  contractRelated?: number;
  status?: string;
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
      if (sql.includes("FROM fin_daily_purchase p"))
        return [
          [
            {
              applicantId: purchase.applicantId,
              status: purchase.status ?? "APPROVED",
              contractRelated: purchase.contractRelated ?? 0,
              projectId: purchase.projectId,
            },
          ],
          [],
        ];
      if (sql.includes("FROM prj_project p")) return [[{ id: "p1" }], []];
      if (sql.startsWith("UPDATE fin_daily_purchase"))
        return [{ affectedRows: 1 }, []];
      return [[], []];
    },
  };
}

const purchaseInput = {
  purchaseType: "办公用品",
  supplierId: "supplier-1",
  itemDescription: "项目资料打印服务",
  quantity: 1,
  budgetAmount: 500,
  purpose: "项目交付资料准备",
  expectedOn: "2026-07-31",
  paymentMethod: "BANK_TRANSFER",
  contractRelated: false,
};

function purchaseCreateConnection(options: {
  supplierAccessible: boolean;
  contract?: { projectId: string; supplierId: string } | null;
  projectAccessible?: boolean;
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
        return [options.supplierAccessible ? [{ id: "supplier-1" }] : [], []];
      }
      if (sql.includes("FROM con_contract WHERE id=?")) {
        return [
          options.contract
            ? [
                {
                  projectId: options.contract.projectId,
                  supplierId: options.contract.supplierId,
                },
              ]
            : [],
          [],
        ];
      }
      if (sql.includes("FROM prj_project p")) {
        return [options.projectAccessible === false ? [] : [{ id: "p1" }], []];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "DP",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO fin_daily_purchase"))
        return [{ affectedRows: 1, insertId: 66 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("daily purchase write scopes", () => {
  it("requires supplier access before creating purchases", async () => {
    const connection = purchaseCreateConnection({ supplierAccessible: false });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.create", purchaseInput, user),
    ).rejects.toMatchObject({
      code: "PURCHASE_SUPPLIER_NOT_FOUND",
      status: 404,
    });

    const supplierCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(supplierCheck.params).toEqual(["supplier-1", 0, "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_daily_purchase"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates purchases only after supplier scope passes", async () => {
    const connection = purchaseCreateConnection({ supplierAccessible: true });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.create", purchaseInput, user),
    ).resolves.toEqual({ id: "66", code: "DP-2026-0001" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_daily_purchase"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("uses the expense contract counterparty as supplier for contract-related purchases", async () => {
    const connection = purchaseCreateConnection({
      supplierAccessible: true,
      contract: { projectId: "project-1", supplierId: "contract-supplier" },
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "daily.purchase.create",
        {
          ...purchaseInput,
          supplierId: "",
          contractRelated: true,
          contractId: "contract-1",
        },
        user,
      ),
    ).resolves.toEqual({ id: "66", code: "DP-2026-0001" });

    const contractCheck = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=?"),
    )!;
    expect(contractCheck.sql).toContain("contract_type='EXPENSE'");
    expect(contractCheck.sql).toContain("amount_status='CONFIRMED'");
    const insert = connection.calls.find((call) =>
      call.sql.startsWith("INSERT INTO fin_daily_purchase"),
    )!;
    expect(insert.params[4]).toBe("contract-supplier");
    expect(insert.params[12]).toBe("contract-1");
  });

  it("rejects contract-related purchases when supplier does not match the expense contract", async () => {
    const connection = purchaseCreateConnection({
      supplierAccessible: true,
      contract: { projectId: "project-1", supplierId: "contract-supplier" },
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "daily.purchase.create",
        {
          ...purchaseInput,
          supplierId: "other-supplier",
          contractRelated: true,
          contractId: "contract-1",
        },
        user,
      ),
    ).rejects.toMatchObject({
      code: "PURCHASE_SUPPLIER_CONTRACT_MISMATCH",
      status: 409,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO fin_daily_purchase"),
      ),
    ).toBe(false);
  });

  it("allows applicants to complete their approved standalone purchases", async () => {
    const connection = purchaseConnection({
      applicantId: "e1",
      projectId: null,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.complete", { purchaseId: "p1" }, user),
    ).resolves.toEqual({ id: "p1", status: "COMPLETED" });

    expect(
      connection.calls.some((call) => call.sql.includes("FROM prj_project p")),
    ).toBe(false);
    expect(
      connection.calls
        .find((call) => call.sql.includes("FROM fin_daily_purchase p"))
        ?.sql,
    ).toContain(
      "LEFT JOIN prj_project pr ON pr.id=c.project_id AND pr.is_deleted=0",
    );
    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE fin_daily_purchase"),
    );
    expect(update?.sql).toContain("AND is_deleted=0");
  });

  it("rejects non-applicants for standalone purchases without project scope", async () => {
    const connection = purchaseConnection({
      applicantId: "other-employee",
      projectId: null,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.complete", { purchaseId: "p2" }, user),
    ).rejects.toMatchObject({
      code: "PURCHASE_COMPLETE_FORBIDDEN",
      status: 403,
    });
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE fin_daily_purchase"),
      ),
    ).toBe(false);
  });

  it("rejects contract-related purchases when the contract project is inactive", async () => {
    const connection = purchaseConnection({
      applicantId: "e1",
      projectId: null,
      contractRelated: 1,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.complete", { purchaseId: "p-invalid" }, user),
    ).rejects.toMatchObject({
      code: "PURCHASE_CONTRACT_PROJECT_INVALID",
      status: 409,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE fin_daily_purchase"),
      ),
    ).toBe(false);
  });

  it("allows project-authorized non-applicants to complete contract-related purchases", async () => {
    const connection = purchaseConnection({
      applicantId: "other-employee",
      projectId: "p1",
      contractRelated: 1,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("daily.purchase.complete", { purchaseId: "p3" }, user),
    ).resolves.toEqual({ id: "p3", status: "COMPLETED" });

    const projectCheck = connection.calls.find((call) =>
      call.sql.includes("FROM prj_project p"),
    )!;
    expect(projectCheck.params).toEqual(["p1", 0, "e1", "e1", "e1"]);
    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE fin_daily_purchase"),
    );
    expect(update?.sql).toContain("AND is_deleted=0");
  });
});
