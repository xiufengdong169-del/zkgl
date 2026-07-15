import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it } from "vitest";

import { MySqlActionExecutor } from "./persistence.js";

const allScopeUser: SessionUser = {
  id: "u2",
  cloudbaseUid: "cb2",
  employeeId: "e2",
  departmentId: "d1",
  enabled: true,
  roleCodes: ["ADMIN"],
  permissionCodes: ["file.download"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "ALL" }],
};

function fileConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("storage_key storageKey"))
        return [[{ id: "f99", classification: "INTERNAL", versionId: "v1", storageKey: "cloud://x" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("file access scopes", () => {
  it("does not let ALL project scope bypass export-task file ownership", async () => {
    const connection = fileConnection();
    const executor = new MySqlActionExecutor(
      { getConnection: async () => connection } as never,
      async () => "https://temporary.example/export.csv",
    );

    await executor.execute("file.download", { fileId: "f99" }, allScopeUser);

    const query = connection.calls.find((call) => call.sql.includes("storage_key storageKey"))!;
    expect(query.sql).toContain("f.business_type='EXPORT_TASK' AND f.created_by=?");
    expect(query.sql).toContain("f.business_type<>'EXPORT_TASK'");
    expect(query.params).toEqual([null, null, "f99", "u2", 1, "u2", "e2", "e2"]);
  });
});
