import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

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
  businessType: "PROJECT_PAYMENT" | "CONTRACT_CHANGE";
  projectId: string;
  canWriteProject: boolean;
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
      if (
        options.businessType === "PROJECT_PAYMENT" &&
        sql.includes("FROM fin_payment_application WHERE id=? FOR UPDATE")
      )
        return [[{ id: "pay-1", createdBy: "u1", businessStatus: "DRAFT" }], []];
      if (
        options.businessType === "PROJECT_PAYMENT" &&
        sql.includes("CAST(project_id AS CHAR) projectId FROM fin_payment_application")
      )
        return [[{ projectId: options.projectId }], []];
      if (
        options.businessType === "CONTRACT_CHANGE" &&
        sql.includes("FROM con_contract_change WHERE id=? FOR UPDATE")
      )
        return [
          [{ id: "change-1", createdBy: "u1", businessStatus: "DRAFT" }],
          [],
        ];
      if (
        options.businessType === "CONTRACT_CHANGE" &&
        sql.includes("FROM con_contract_change x JOIN con_contract c")
      )
        return [[{ projectId: options.projectId }], []];
      if (sql.includes("FROM prj_project p") && sql.includes("iam_project_grant"))
        return [options.canWriteProject ? [{ id: options.projectId }] : [], []];
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

async function expectSubmitDeniedForOutOfScopeProject(
  businessType: "PROJECT_PAYMENT" | "CONTRACT_CHANGE",
) {
  const connection = approvalSubmitConnection({
    businessType,
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
        actionKey: `submit-${businessType.toLowerCase()}-001`,
        businessType,
        businessId: businessType === "PROJECT_PAYMENT" ? "pay-1" : "change-1",
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
  it("requires current project write access before submitting project payment approval", async () => {
    await expectSubmitDeniedForOutOfScopeProject("PROJECT_PAYMENT");
  });

  it("requires current project write access before submitting contract change approval", async () => {
    await expectSubmitDeniedForOutOfScopeProject("CONTRACT_CHANGE");
  });
});
