import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["MARKET"],
  permissionCodes: ["project.application.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const applicationData = {
  projectName: "智慧园区二期",
  customerId: "c1",
  sourceLeadId: "lead-1",
  projectType: "SOFTWARE",
  background: "客户一期系统运行稳定，准备扩展二期能力",
  serviceScope: "项目全过程管理系统建设",
  estimatedRevenue: 200000,
  estimatedCost: 120000,
  estimatedStartOn: "2026-08-01",
  estimatedEndOn: "2026-12-31",
  proposedManagerId: "e1",
  memberSuggestions: [],
  biddingMethod: null,
  riskDescription: null,
  necessity: "客户已明确提出二期建设需求",
};

function projectApplicationConnection(options: {
  customerAccessible: boolean;
  sourceLeadAccessible: boolean;
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
      if (sql.includes("FROM prj_project_application WHERE id=?")) {
        return [[{ status: "DRAFT", version: 3, createdBy: "u1" }], []];
      }
      if (sql.includes("FROM crm_counterparty WHERE id=?")) {
        return [options.customerAccessible ? [{ id: "c1" }] : [], []];
      }
      if (sql.includes("FROM mkt_lead WHERE id=?")) {
        return [options.sourceLeadAccessible ? [{ id: "lead-1" }] : [], []];
      }
      if (sql.includes("FROM sys_number_rule")) {
        return [
          [
            {
              id: 1,
              prefix: "PA",
              serial_length: 4,
              next_serial: 1,
              current_year: new Date().getFullYear(),
              version: 0,
            },
          ],
          [],
        ];
      }
      if (sql.startsWith("INSERT INTO prj_project_application")) {
        return [{ affectedRows: 1, insertId: 44 }, []];
      }
      if (sql.startsWith("UPDATE prj_project_application SET")) {
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("project application write scopes", () => {
  it("stores applicant id as employee id while keeping audit columns as user id", async () => {
    const connection = projectApplicationConnection({
      customerAccessible: true,
      sourceLeadAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("project.application.create", applicationData, user),
    ).resolves.toMatchObject({ id: "44" });

    const insert = connection.calls.find((call) =>
      call.sql.startsWith("INSERT INTO prj_project_application"),
    )!;
    expect(insert.params.slice(-3)).toEqual(["e1", "u1", "u1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("requires accessible customer ownership before creating applications", async () => {
    const connection = projectApplicationConnection({
      customerAccessible: false,
      sourceLeadAccessible: true,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("project.application.create", applicationData, user),
    ).rejects.toMatchObject({
      code: "PROJECT_APPLICATION_CUSTOMER_NOT_FOUND",
      status: 404,
    });

    const customerCheck = connection.calls.find((call) =>
      call.sql.includes("FROM crm_counterparty WHERE id=?"),
    )!;
    expect(customerCheck.params).toEqual(["c1", 0, "e1"]);
    expect(
      connection.calls.some((call) => call.sql.includes("FROM sys_number_rule")),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO prj_project_application"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires accessible same-customer source leads before creating applications", async () => {
    const connection = projectApplicationConnection({
      customerAccessible: true,
      sourceLeadAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("project.application.create", applicationData, user),
    ).rejects.toMatchObject({
      code: "PROJECT_APPLICATION_SOURCE_LEAD_NOT_FOUND",
      status: 404,
    });

    const leadCheck = connection.calls.find((call) =>
      call.sql.includes("FROM mkt_lead WHERE id=?"),
    )!;
    expect(leadCheck.sql).toContain("customer_id=?");
    expect(leadCheck.sql).toContain("owner_id=? OR created_by=?");
    expect(leadCheck.params).toEqual(["lead-1", "c1", 0, "e1", "u1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO prj_project_application"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rechecks customer and source lead scopes before updating applications", async () => {
    const connection = projectApplicationConnection({
      customerAccessible: true,
      sourceLeadAccessible: false,
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "project.application.update",
        { applicationId: "app-1", version: 3, data: applicationData },
        user,
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_APPLICATION_SOURCE_LEAD_NOT_FOUND",
      status: 404,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE prj_project_application SET"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("DELETE FROM prj_application_member_suggestion"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
