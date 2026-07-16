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

describe("daily purchase write scopes", () => {
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
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE fin_daily_purchase"),
      ),
    ).toBe(true);
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

  it("allows project-authorized non-applicants to complete contract-related purchases", async () => {
    const connection = purchaseConnection({
      applicantId: "other-employee",
      projectId: "p1",
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
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE fin_daily_purchase"),
      ),
    ).toBe(true);
  });
});
