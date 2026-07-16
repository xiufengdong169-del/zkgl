import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

type ProjectScopedApprovalBusinessType =
  | "BID_APPLICATION"
  | "CONTRACT"
  | "CONTRACT_CHANGE"
  | "INVOICE_APPLICATION"
  | "EXPENSE_REIMBURSEMENT"
  | "PROJECT_PAYMENT"
  | "PARTNER_SETTLEMENT"
  | "DEPOSIT"
  | "DEPOSIT_LOSS"
  | "DAILY_PURCHASE"
  | "PROJECT_START"
  | "PROJECT_CHANGE"
  | "PROJECT_ACCEPTANCE"
  | "PROJECT_CLOSE";

const approvalBusinessCases: Array<{
  businessType: ProjectScopedApprovalBusinessType;
  businessId: string;
  table: string;
  projectResolutionSqlFragment: string;
}> = [
  {
    businessType: "BID_APPLICATION",
    businessId: "bid-1",
    table: "bid_application",
    projectResolutionSqlFragment: "FROM bid_application WHERE id=?",
  },
  {
    businessType: "CONTRACT",
    businessId: "contract-1",
    table: "con_contract",
    projectResolutionSqlFragment: "FROM con_contract WHERE id=?",
  },
  {
    businessType: "CONTRACT_CHANGE",
    businessId: "change-1",
    table: "con_contract_change",
    projectResolutionSqlFragment:
      "FROM con_contract_change x JOIN con_contract c",
  },
  {
    businessType: "INVOICE_APPLICATION",
    businessId: "invoice-1",
    table: "fin_invoice_application",
    projectResolutionSqlFragment: "FROM fin_invoice_application WHERE id=?",
  },
  {
    businessType: "EXPENSE_REIMBURSEMENT",
    businessId: "reimbursement-1",
    table: "fin_reimbursement",
    projectResolutionSqlFragment: "FROM fin_reimbursement WHERE id=?",
  },
  {
    businessType: "PROJECT_PAYMENT",
    businessId: "pay-1",
    table: "fin_payment_application",
    projectResolutionSqlFragment: "FROM fin_payment_application WHERE id=?",
  },
  {
    businessType: "PARTNER_SETTLEMENT",
    businessId: "settlement-1",
    table: "partner_settlement",
    projectResolutionSqlFragment: "FROM partner_settlement WHERE id=?",
  },
  {
    businessType: "DEPOSIT",
    businessId: "deposit-1",
    table: "fin_deposit",
    projectResolutionSqlFragment: "FROM fin_deposit WHERE id=?",
  },
  {
    businessType: "DEPOSIT_LOSS",
    businessId: "deposit-event-1",
    table: "fin_deposit_event",
    projectResolutionSqlFragment:
      "FROM fin_deposit_event e JOIN fin_deposit d",
  },
  {
    businessType: "DAILY_PURCHASE",
    businessId: "purchase-1",
    table: "fin_daily_purchase",
    projectResolutionSqlFragment:
      "FROM fin_daily_purchase p LEFT JOIN con_contract c",
  },
  {
    businessType: "PROJECT_START",
    businessId: "start-1",
    table: "prj_start",
    projectResolutionSqlFragment: "FROM prj_start WHERE id=?",
  },
  {
    businessType: "PROJECT_CHANGE",
    businessId: "project-change-1",
    table: "prj_change",
    projectResolutionSqlFragment: "FROM prj_change WHERE id=?",
  },
  {
    businessType: "PROJECT_ACCEPTANCE",
    businessId: "acceptance-1",
    table: "prj_acceptance",
    projectResolutionSqlFragment: "FROM prj_acceptance WHERE id=?",
  },
  {
    businessType: "PROJECT_CLOSE",
    businessId: "close-1",
    table: "prj_close_application",
    projectResolutionSqlFragment: "FROM prj_close_application WHERE id=?",
  },
];

const creatorWithoutProjectAccess: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_MANAGER"],
  permissionCodes: ["approval.instance.submit"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["allowed-project"] }],
};

function approvalSubmitConnection(options: {
  businessType: ProjectScopedApprovalBusinessType;
  businessId?: string;
  projectId: string | null;
  canWriteProject: boolean;
  operation?: "SUBMIT" | "WITHDRAW";
  invoiceCapacityExceeded?: boolean;
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const businessCase = approvalBusinessCases.find(
    (item) => item.businessType === options.businessType,
  );
  const businessId = options.businessId ?? businessCase?.businessId ?? "biz-1";
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM wf_action_history")) return [[], []];
      if (businessCase && sql.includes(`FROM ${businessCase.table} WHERE id=? FOR UPDATE`))
        return [[{ id: businessId, createdBy: "u1", businessStatus: "DRAFT" }], []];
      if (
        options.operation === "WITHDRAW" &&
        sql.includes("FROM wf_instance WHERE id=? FOR UPDATE")
      )
        return [
          [
            {
              id: "instance-1",
              applicantId: "u1",
              status: "PENDING",
              businessType: options.businessType,
              businessId,
            },
          ],
          [],
        ];
      if (
        options.businessType === "INVOICE_APPLICATION" &&
        sql.includes("contract_id contractId,requested_amount requestedAmount")
      )
        return [[{ contractId: "contract-1", requestedAmount: "1200.00" }], []];
      if (
        options.businessType === "INVOICE_APPLICATION" &&
        sql.includes("FROM con_contract WHERE id=?")
      )
        return [[{ amount: "1500.00", status: "PERFORMING" }], []];
      if (
        options.businessType === "INVOICE_APPLICATION" &&
        sql.includes("FROM fin_sales_invoice WHERE contract_id=?")
      )
        return [[{ used: "100.00" }], []];
      if (
        options.businessType === "INVOICE_APPLICATION" &&
        sql.includes("FROM fin_invoice_application a")
      )
        return [
          [{ amount: options.invoiceCapacityExceeded ? "300.00" : "0.00" }],
          [],
        ];
      if (businessCase && sql.includes(businessCase.projectResolutionSqlFragment))
        return [[{ projectId: options.projectId }], []];
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [options.canWriteProject ? [{ id: options.projectId }] : [], []];
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

async function expectSubmitDeniedForOutOfScopeProject(
  businessCase: (typeof approvalBusinessCases)[number],
) {
  const connection = approvalSubmitConnection({
    businessType: businessCase.businessType,
    businessId: businessCase.businessId,
    projectId: "forbidden-project",
    canWriteProject: false,
  });
  const executor = new MySqlActionExecutor({
    getConnection: async () => connection,
  } as never);

  await expect(
    executor.execute(
      "approval.instance.submit",
      {
        actionKey: `submit-${businessCase.businessType.toLowerCase()}-001`,
        businessType: businessCase.businessType,
        businessId: businessCase.businessId,
        title: "提交审批",
        amount: 100,
      },
      creatorWithoutProjectAccess,
    ),
  ).rejects.toMatchObject({ code: "PROJECT_WRITE_FORBIDDEN" });

  expect(
    connection.calls.some((call) =>
      call.sql.startsWith("INSERT INTO wf_instance"),
    ),
  ).toBe(false);
  expect(
    connection.calls.some((call) => call.sql.startsWith("INSERT INTO wf_task")),
  ).toBe(false);
  expect(
    connection.calls.some((call) =>
      call.sql.startsWith("INSERT INTO wf_action_history"),
    ),
  ).toBe(false);
  expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
}

describe("approval submission project scope", () => {
  it.each(approvalBusinessCases)(
    "requires current project write access before submitting $businessType approval",
    async (businessCase) => {
      await expectSubmitDeniedForOutOfScopeProject(businessCase);
    },
  );

  it("allows standalone daily purchase approval submission without project scope", async () => {
    const connection = approvalSubmitConnection({
      businessType: "DAILY_PURCHASE",
      businessId: "purchase-standalone",
      projectId: null,
      canWriteProject: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "approval.instance.submit",
        {
          actionKey: "submit-standalone-purchase-001",
          businessType: "DAILY_PURCHASE",
          businessId: "purchase-standalone",
          title: "提交审批",
          amount: 100,
        },
        creatorWithoutProjectAccess,
      ),
    ).rejects.not.toMatchObject({ code: "PROJECT_WRITE_FORBIDDEN" });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM prj_project p") &&
        call.sql.includes("iam_project_grant"),
      ),
    ).toBe(false);
  });

  it("rechecks invoice capacity before submitting invoice application approval", async () => {
    const connection = approvalSubmitConnection({
      businessType: "INVOICE_APPLICATION",
      businessId: "invoice-1",
      projectId: "allowed-project",
      canWriteProject: true,
      invoiceCapacityExceeded: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "approval.instance.submit",
        {
          actionKey: "submit-invoice-capacity-001",
          businessType: "INVOICE_APPLICATION",
          businessId: "invoice-1",
          title: "鎻愪氦瀹℃壒",
          amount: 1200,
        },
        creatorWithoutProjectAccess,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_CAPACITY_EXCEEDED" });

    expect(
      connection.calls.some((call) => call.sql.includes("FROM wf_template")),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires current project write access before withdrawing project payment approval", async () => {
    const connection = approvalSubmitConnection({
      businessType: "PROJECT_PAYMENT",
      projectId: "forbidden-project",
      canWriteProject: false,
      operation: "WITHDRAW",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "approval.instance.withdraw",
        {
          instanceId: "instance-1",
          actionKey: "withdraw-project-payment-001",
          comment: "撤回",
        },
        creatorWithoutProjectAccess,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_WRITE_FORBIDDEN" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO wf_action_history"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE wf_task SET status='CANCELLED'"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE wf_instance SET status='WITHDRAWN'"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE fin_payment_application SET"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
