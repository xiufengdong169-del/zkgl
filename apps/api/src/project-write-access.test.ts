import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import { requireProjectWriteAccess } from "./persistence.js";

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: [],
  permissionCodes: [],
  sensitiveFieldAccess: {},
  dataScopes: [],
  ...overrides,
});

const connection = (rows: unknown[] = []) => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    execute: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [rows, []];
    },
  };
};

describe("project write access", () => {
  it("allows explicit project and department scopes to participate in project write checks", async () => {
    const db = connection([{ id: "p1" }]);

    await requireProjectWriteAccess(
      db as never,
      "p1",
      user({
        dataScopes: [
          { type: "PROJECT", projectIds: ["p1"] },
          { type: "DEPARTMENT", departmentIds: ["d2"] },
        ],
      }),
    );

    const call = db.calls[0];
    expect(call).toBeDefined();
    expect(call!.sql).toContain("p.id IN (?)");
    expect(call!.sql).toContain("pm.department_id IN (?)");
    expect(call!.params).toEqual(["p1", 0, "e1", "e1", "p1", "d2"]);
  });

  it("denies writes when the project is outside the caller data scope", async () => {
    const db = connection([]);

    await expect(
      requireProjectWriteAccess(db as never, "p2", user()),
    ).rejects.toMatchObject({
      code: "PROJECT_WRITE_FORBIDDEN",
      status: 403,
    } satisfies Pick<AppError, "code" | "status">);
  });
});
