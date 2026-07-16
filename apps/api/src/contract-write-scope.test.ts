import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["CONTRACT_OPERATOR"],
  permissionCodes: [
    "contract.create",
    "contract.change.create",
    "contract.milestone.create",
  ],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function contractWriteConnection() {
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
              id: "c1",
              projectId: "p1",
              taxInclusiveAmount: "100.00",
              expiresOn: "2026-12-31",
              status:
                sql.includes("tax_inclusive_amount") || !sql.includes("FOR UPDATE")
                  ? "PERFORMING"
                  : "PENDING_SIGNATURE",
            },
          ],
          [],
        ];
      if (sql.includes("FROM con_contract_milestone m"))
        return [[{ id: "m1", projectId: "p1", status: "PENDING" }], []];
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [[{ id: "p1" }], []];
      if (sql.includes("FROM con_contract_change"))
        return [[], []];
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "BG",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO con_contract_change"))
        return [{ insertId: 9 }, []];
      if (sql.startsWith("INSERT INTO con_contract_milestone"))
        return [{ insertId: 10 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

const contractInput = {
  contractName: "智慧园区建设合同",
  contractType: "INCOME",
  projectId: "p1",
  partyAId: "customer-1",
  partyBId: "company-1",
  signingEntityId: "company-1",
  taxInclusiveAmount: 106,
  taxExclusiveAmount: 100,
  taxRate: 0.06,
  taxAmount: 6,
  amountStatus: "CONFIRMED",
  signedOn: "2026-07-17",
  effectiveOn: "2026-07-17",
  expiresOn: "2026-12-31",
  serviceContent: "项目全过程管理系统建设",
  paymentTerms: "按里程碑付款",
  invoiceTerms: "按付款节点开票",
  parentContractId: "parent-1",
};

function contractCreateConnection(options: {
  projectWritable: boolean;
  accessiblePartyIds: string[];
  parentExists: boolean;
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
        return [options.accessiblePartyIds.map((id) => ({ id })), []];
      }
      if (sql.includes("FROM con_contract WHERE id=? AND project_id=?")) {
        return [options.parentExists ? [{ id: "parent-1" }] : [], []];
      }
      if (sql.includes("FROM sys_number_rule"))
        return [
          [
            {
              id: 1,
              prefix: "CON",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      if (sql.startsWith("INSERT INTO con_contract"))
        return [{ affectedRows: 1, insertId: 77 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

async function run(action: string, input: Record<string, unknown>) {
  const connection = contractWriteConnection();
  const executor = new MySqlActionExecutor({
    getConnection: async () => connection,
  } as never);
  await executor.execute(action, input, user);
  return connection.calls;
}

function expectProjectWriteCheck(calls: Array<{ sql: string; params: unknown[] }>) {
  const check = calls.find((call) =>
    call.sql.includes("FROM prj_project p") &&
    call.sql.includes("iam_project_grant"),
  )!;
  expect(check).toBeDefined();
  expect(check.sql).toContain("iam_project_grant");
  expect(check.params).toEqual(["p1", 0, "e1", "e1", "e1"]);
}

describe("contract write scopes", () => {
  it("requires access to both contract parties before creating contracts", async () => {
    const connection = contractCreateConnection({
      projectWritable: true,
      accessiblePartyIds: ["customer-1"],
      parentExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("contract.create", contractInput, user),
    ).rejects.toMatchObject({
      code: "CONTRACT_COUNTERPARTY_NOT_FOUND",
      status: 404,
    });

    const counterpartyCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id IN"),
    )!;
    expect(counterpartyCheck.params).toEqual([
      "customer-1",
      "company-1",
      0,
      "e1",
    ]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO con_contract"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires parent contracts to belong to the same project", async () => {
    const connection = contractCreateConnection({
      projectWritable: true,
      accessiblePartyIds: ["customer-1", "company-1"],
      parentExists: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("contract.create", contractInput, user),
    ).rejects.toMatchObject({
      code: "CONTRACT_PARENT_NOT_FOUND",
      status: 404,
    });

    const parentCheck = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=? AND project_id=?"),
    )!;
    expect(parentCheck.params).toEqual(["parent-1", "p1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO con_contract"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates contracts only after project, party and parent scopes pass", async () => {
    const connection = contractCreateConnection({
      projectWritable: true,
      accessiblePartyIds: ["customer-1", "company-1"],
      parentExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("contract.create", contractInput, user),
    ).resolves.toEqual({ id: "77", code: "CON-2026-0001" });

    expectProjectWriteCheck(connection.calls);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO con_contract"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("requires project write access before activating a contract", async () => {
    const calls = await run("contract.activate", {
      contractId: "c1",
      signedOn: "2026-07-16",
      effectiveOn: "2026-07-16",
    });

    expectProjectWriteCheck(calls);
    expect(
      calls.some((call) => call.sql.includes("status='PERFORMING'")),
    ).toBe(true);
  });

  it("allows project-authorized users to create contract changes without owner filtering", async () => {
    const calls = await run("contract.change.create", {
      contractId: "c1",
      changeType: "AMOUNT",
      newTaxInclusiveAmount: 106,
      newTaxExclusiveAmount: 100,
      newTaxRate: 0.06,
      newTaxAmount: 6,
      newEndOn: null,
      changeContent: "调整服务范围",
      reason: "范围变化",
      effectiveOn: "2026-07-16",
    });

    const lock = calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=?"),
    )!;
    expect(lock.sql).not.toContain("owner_id=?");
    expectProjectWriteCheck(calls);
    expect(
      calls.some((call) => call.sql.startsWith("INSERT INTO con_contract_change")),
    ).toBe(true);
  });

  it("requires project write access for milestone creation and completion", async () => {
    const createCalls = await run("contract.milestone.create", {
      contractId: "c1",
      milestoneType: "ACCEPTANCE",
      milestoneName: "验收",
      plannedOn: "2026-08-01",
      plannedAmount: 100,
      conditionDescription: "验收后付款",
    });
    expectProjectWriteCheck(createCalls);
    expect(
      createCalls.some((call) =>
        call.sql.startsWith("INSERT INTO con_contract_milestone"),
      ),
    ).toBe(true);

    const completeCalls = await run("contract.milestone.complete", {
      milestoneId: "m1",
      completedOn: "2026-08-02",
    });
    expectProjectWriteCheck(completeCalls);
    expect(
      completeCalls.some((call) =>
        call.sql.includes("status='COMPLETED'"),
      ),
    ).toBe(true);
  });
});
