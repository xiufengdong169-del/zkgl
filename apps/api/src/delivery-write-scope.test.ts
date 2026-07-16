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
  permissionCodes: ["project.acceptance.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const acceptanceInput = {
  projectId: "p1",
  contractId: "contract-1",
  acceptanceType: "FINAL",
  appliedOn: "2026-07-17",
  acceptanceScope: "系统整体功能验收",
  acceptanceBasis: "合同和需求说明书",
};

function acceptanceConnection(options: {
  projectWritable: boolean;
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
      if (sql.includes("FROM con_contract WHERE id=?")) {
        return [options.contractExists ? [{ id: "contract-1" }] : [], []];
      }
      if (sql.startsWith("INSERT INTO prj_acceptance"))
        return [{ affectedRows: 1, insertId: 70 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("delivery write scopes", () => {
  it("requires acceptance contracts to belong to the same project", async () => {
    const connection = acceptanceConnection({
      projectWritable: true,
      contractExists: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("project.acceptance.create", acceptanceInput, user),
    ).rejects.toMatchObject({
      code: "ACCEPTANCE_CONTRACT_NOT_FOUND",
      status: 404,
    });

    const contractCheck = connection.calls.find((call) =>
      call.sql.includes("FROM con_contract WHERE id=?"),
    )!;
    expect(contractCheck.params).toEqual(["contract-1", "p1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO prj_acceptance"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("creates acceptance applications after project and contract scopes pass", async () => {
    const connection = acceptanceConnection({
      projectWritable: true,
      contractExists: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("project.acceptance.create", acceptanceInput, user),
    ).resolves.toEqual({ id: "70", status: "DRAFT" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO prj_acceptance"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
