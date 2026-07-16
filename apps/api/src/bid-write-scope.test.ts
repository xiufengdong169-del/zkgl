import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["BID_OPERATOR"],
  permissionCodes: ["bid.application.create"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

function unauthorizedBidConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM bid_task t"))
        return [
          [
            {
              status: "PENDING",
              assigneeId: "e1",
              checkerId: "e2",
              projectId: "p-out",
            },
          ],
          [],
        ];
      if (sql.includes("FROM bid_check c"))
        return [
          [
            {
              id: "chk1",
              responsibleId: "e1",
              rectifierId: null,
              projectId: "p-out",
            },
          ],
          [],
        ];
      if (sql.includes("FROM prj_project p")) return [[], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("bid write data scopes", () => {
  it("rejects bid task transitions when assignees lack project write scope", async () => {
    const connection = unauthorizedBidConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "bid.task.transition",
        { taskId: "task1", action: "START" },
        user,
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_WRITE_FORBIDDEN",
      status: 403,
    });

    expect(
      connection.calls.some((call) => call.sql.includes("UPDATE bid_task")),
    ).toBe(false);
  });

  it("rejects bid check results when responsible users lack project write scope", async () => {
    const connection = unauthorizedBidConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "bid.check.result",
        { checkId: "chk1", result: "PASSED" },
        user,
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_WRITE_FORBIDDEN",
      status: 403,
    });

    expect(
      connection.calls.some((call) => call.sql.includes("UPDATE bid_check")),
    ).toBe(false);
  });
});
