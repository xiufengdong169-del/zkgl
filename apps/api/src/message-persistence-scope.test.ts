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
  permissionCodes: ["message.read"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["p1"] }],
};

function messageConnection(readAffectedRows = 1) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM sys_message WHERE recipient_id=?")) {
        return [
          [
            {
              id: "m1",
              messageType: "RISK_DUE",
              title: "risk due",
              businessType: "RISK",
              businessId: "r1",
            },
          ],
          [],
        ];
      }
      if (sql.startsWith("UPDATE sys_message SET read_at=")) {
        return [{ affectedRows: readAffectedRows }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("message persistence scopes", () => {
  it("lists only messages for the current employee recipient", async () => {
    const connection = messageConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    const result = (await executor.execute(
      "message.list",
      { page: 1, pageSize: 20 },
      user,
    )) as { items: Array<{ id: string }> };

    expect(result.items).toEqual([expect.objectContaining({ id: "m1" })]);
    const query = connection.calls.find((call) =>
      call.sql.includes("FROM sys_message WHERE recipient_id=?"),
    );
    expect(query?.params).toEqual(["e1", 20, 0]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("marks only the current employee recipient message as read", async () => {
    const connection = messageConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("message.read", { messageId: "m1" }, user),
    ).resolves.toEqual({ id: "m1", read: true });

    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE sys_message SET read_at="),
    );
    expect(update?.params).toEqual(["m1", "e1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("rejects marking another employee message as read and rolls back", async () => {
    const connection = messageConnection(0);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("message.read", { messageId: "other-message" }, user),
    ).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND", status: 404 });

    const update = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE sys_message SET read_at="),
    );
    expect(update?.params).toEqual(["other-message", "e1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
