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

const scopedUser: SessionUser = {
  ...allScopeUser,
  id: "u3",
  cloudbaseUid: "cb3",
  employeeId: "e3",
  dataScopes: [
    { type: "PROJECT", projectIds: ["p9"] },
    { type: "DEPARTMENT", departmentIds: ["d2"] },
  ],
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
      if (sql.includes("SELECT p.id FROM prj_project")) return [[{ id: "p9" }], []];
      if (sql.startsWith("INSERT INTO file_object")) return [{ insertId: 99 }, []];
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
    expect(query.params).toEqual([null, null, "f99", "u2", "u2", 1, "e2", "e2"]);
  });

  it("uses project and department scopes when preparing project file uploads", async () => {
    const connection = fileConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "file.upload.prepare",
      {
        businessType: "PROJECT",
        businessId: "p9",
        projectId: "p9",
        logicalName: "report.csv",
        originalName: "report.csv",
        mimeType: "text/csv",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      },
      scopedUser,
    );

    const query = connection.calls.find((call) => call.sql.includes("SELECT p.id FROM prj_project"))!;
    expect(query.sql).toContain("JOIN org_employee pm");
    expect(query.sql).toContain("p.id IN (?)");
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual(["p9", 0, "e3", "e3", "p9", "d2"]);
  });
});
