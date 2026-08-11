import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const scopedUser: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["PROJECT_VIEWER"],
  permissionCodes: ["project.read"],
  sensitiveFieldAccess: {},
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
};

const scopeParams = [0, "e1", "e1", "p9", "d2", "e1"];

function projectReferenceConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [[], []];
    },
  };
}

function closeOpenItemCompleteConnection(row: Record<string, unknown>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM prj_close_open_item i")) return [[row], []];
      if (sql.startsWith("UPDATE prj_close_open_item SET"))
        return [{ affectedRows: 1 }, []];
      return [[], []];
    },
  };
}

async function executeWith(
  connection: ReturnType<typeof projectReferenceConnection>,
  action: string,
  input = {},
) {
  const executor = new MySqlActionExecutor({
    getConnection: async () => connection,
  } as never);
  await executor.execute(action, input, scopedUser);
}

function expectProjectReferenceScope(call: { sql: string; params: unknown[] }) {
  expect(call.sql).toContain(
    "EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm",
  );
  expect(call.sql).toContain("p.id IN (?)");
  expect(call.sql).toContain("pm.department_id IN (?)");
  expect(call.sql).toContain("iam_project_grant");
}

describe("project reference data scopes", () => {
  it("applies project, department and temporary grant scopes to finance summaries", async () => {
    const connection = projectReferenceConnection();

    await executeWith(connection, "finance.summary");

    const scopedQueries = connection.calls.filter(
      (call) =>
        call.sql.includes("FROM fin_sales_invoice x") ||
        call.sql.includes("FROM fin_receipt x") ||
        call.sql.includes("FROM fin_payment_detail x"),
    );
    expect(scopedQueries).toHaveLength(3);
    for (const query of scopedQueries) {
      expectProjectReferenceScope(query);
      expect(query.params).toEqual([null, null, ...scopeParams]);
    }
  });

  it("applies the same project scopes to finance operations including deposit events", async () => {
    const connection = projectReferenceConnection();

    await executeWith(connection, "finance.operations");

    const scopedQueries = connection.calls.filter((call) =>
      [
        "FROM fin_payment_application x",
        "FROM partner_plan x",
        "FROM partner_settlement x",
        "FROM fin_deposit x",
        "FROM fin_deposit_event e",
      ].some((fragment) => call.sql.includes(fragment)),
    );
    expect(scopedQueries).toHaveLength(5);
    for (const query of scopedQueries) {
      expectProjectReferenceScope(query);
      expect(query.params).toEqual(scopeParams);
    }
    expect(scopedQueries.at(-1)?.sql).toContain("p.id=d.project_id");
  });

  it("applies project scopes to settlement and delivery reads", async () => {
    const connection = projectReferenceConnection();

    await executeWith(connection, "settlement.summary");
    await executeWith(connection, "delivery.summary", { projectId: "p9" });
    await executeWith(connection, "delivery.records");

    const scopedQueries = connection.calls.filter((call) =>
      call.sql.includes(
        "EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm",
      ),
    );
    expect(scopedQueries).toHaveLength(12);
    for (const query of scopedQueries) {
      expectProjectReferenceScope(query);
      if (query.sql.includes("JOIN prj_project p ON p.id=x.project_id")) {
        expect(query.sql).toContain(
          "JOIN prj_project p ON p.id=x.project_id AND p.is_deleted=0",
        );
      }
    }
    const deliverySummaryQueries = scopedQueries.filter((call) =>
      call.sql.includes("(? IS NULL OR x.project_id=?)"),
    );
    expect(deliverySummaryQueries).toHaveLength(3);
    for (const query of deliverySummaryQueries) {
      expect(query.params).toEqual(["p9", "p9", ...scopeParams]);
    }
  });

  it("keeps close applicant and owner visibility while adding project scopes", async () => {
    const connection = projectReferenceConnection();

    await executeWith(connection, "project.close.list", {
      page: 2,
      pageSize: 20,
    });

    const closeRows = connection.calls.find((call) =>
      call.sql.includes("FROM prj_close_application x"),
    )!;
    expectProjectReferenceScope(closeRows);
    expect(closeRows.sql).toContain(
      "JOIN prj_project p ON p.id=x.project_id AND p.is_deleted=0",
    );
    expect(closeRows.sql).toContain("x.created_by=? OR");
    expect(closeRows.params).toEqual(["u1", ...scopeParams, 20, 20]);

    const openItems = connection.calls.find((call) =>
      call.sql.includes("FROM prj_close_open_item i"),
    )!;
    expectProjectReferenceScope(openItems);
    expect(openItems.sql).toContain(
      "JOIN prj_project p ON p.id=c.project_id AND p.is_deleted=0",
    );
    expect(openItems.sql).toContain("c.created_by=? OR i.responsible_id=? OR");
    expect(openItems.params).toEqual(["u1", "e1", ...scopeParams]);
  });

  it("does not complete close open items for deleted projects", async () => {
    const connection = projectReferenceConnection();

    await expect(
      executeWith(connection, "project.close.openItem.complete", {
        itemId: "item-1",
        completedOn: "2026-08-01",
      }),
    ).rejects.toMatchObject({ code: "CLOSE_OPEN_ITEM_NOT_FOUND" });

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM prj_close_open_item i"),
    )!;
    expect(query.sql).toContain(
      "JOIN prj_project p ON p.id=c.project_id AND p.is_deleted=0",
    );
    expect(query.params).toEqual(["item-1"]);
  });

  it("records who completed close open items and increments the tracking version", async () => {
    const connection = closeOpenItemCompleteConnection({
      status: "OPEN",
      responsibleId: scopedUser.employeeId,
      projectManagerId: "manager-1",
      createdBy: "creator-1",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "project.close.openItem.complete",
        { itemId: "item-1", completedOn: "2026-08-01" },
        scopedUser,
      ),
    ).resolves.toEqual({
      id: "item-1",
      status: "COMPLETED",
      completedOn: "2026-08-01",
      completedBy: scopedUser.id,
    });

    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE prj_close_open_item SET"),
    )!;
    expect(update.sql).toContain("completed_by=?");
    expect(update.sql).toContain("version=version+1");
    expect(update.sql).toContain("WHERE id=? AND status='OPEN'");
    expect(update.params).toEqual(["2026-08-01", scopedUser.id, "item-1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
