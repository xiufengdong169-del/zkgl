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

function fileConnection(classification = "INTERNAL", projectAccessible = true) {
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
        return [[{ id: "f99", classification, versionId: "v1", storageKey: "cloud://x" }], []];
      if (sql.includes("FROM prj_project p"))
        return [projectAccessible ? [{ id: "p9" }] : [], []];
      if (sql.startsWith("INSERT INTO file_object")) return [{ insertId: 99 }, []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

function deniedDownloadConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("storage_key storageKey")) return [[], []];
      if (sql.includes("SELECT f.id,v.id versionId"))
        return [[{ id: "f99", versionId: "v1" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

function fileListConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM file_object f JOIN file_version v"))
        return [[{ id: "f99", classification: "INTERNAL" }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
}

function sensitiveHistoryConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT f.id,f.classification FROM file_object f"))
        return [[{ id: "f99", classification: "SENSITIVE" }], []];
      if (sql.includes("FROM file_version"))
        return [[{ id: "v1", originalName: "secret.pdf" }], []];
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
    expect(query.sql).toContain("f.is_deleted=0");
    expect(query.sql).toContain("p.is_deleted=0");
    expect(query.params).toEqual([
      null,
      null,
      "f99",
      "u2",
      "u2",
      1,
      "e2",
      "e2",
      "e2",
    ]);
  });

  it("uses the API request id when writing successful file download logs", async () => {
    const connection = fileConnection();
    const executor = new MySqlActionExecutor(
      { getConnection: async () => connection } as never,
      async () => "https://temporary.example/export.csv",
    );

    await executor.execute(
      "file.download",
      { fileId: "f99" },
      allScopeUser,
      "api-request-1",
    );

    const log = connection.calls.find((call) =>
      call.sql.includes("INSERT INTO file_access_log"),
    );
    expect(log?.params).toEqual(["f99", "v1", "u2", "api-request-1"]);
  });

  it("uses the API request id when writing denied sensitive file download logs", async () => {
    const connection = fileConnection("SENSITIVE");
    const executor = new MySqlActionExecutor(
      { getConnection: async () => connection } as never,
      async () => "https://temporary.example/export.csv",
    );

    await expect(
      executor.execute(
        "file.download",
        { fileId: "f99" },
        allScopeUser,
        "api-request-denied",
      ),
    ).rejects.toMatchObject({ code: "SENSITIVE_FILE_DENIED" });

    const log = connection.calls.find((call) =>
      call.sql.includes("SENSITIVE_FILE_DENIED"),
    );
    expect(log?.params).toEqual(["f99", "v1", "u2", "api-request-denied"]);
  });

  it("writes denied file access logs when download scope checks fail for an existing file", async () => {
    const connection = deniedDownloadConnection();
    const executor = new MySqlActionExecutor(
      { getConnection: async () => connection } as never,
      async () => {
        throw new Error("temporary URL must not be created for denied files");
      },
    );

    await expect(
      executor.execute(
        "file.download",
        { fileId: "f99", versionId: null },
        allScopeUser,
        "api-request-business-denied",
      ),
    ).rejects.toMatchObject({
      code: "BUSINESS_ACCESS_DENIED",
      status: 403,
    });

    const log = connection.calls.find((call) =>
      call.sql.includes("BUSINESS_ACCESS_DENIED"),
    );
    const existingFileQuery = connection.calls.find((call) =>
      call.sql.includes("SELECT f.id,v.id versionId"),
    )!;
    expect(existingFileQuery.sql).toContain("f.is_deleted=0");
    expect(log?.params).toEqual([
      "f99",
      "v1",
      "u2",
      "api-request-business-denied",
    ]);
  });

  it("filters sensitive files out of attachment lists unless the user has sensitive read permission", async () => {
    const connection = fileListConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await executor.execute(
      "file.list",
      { businessType: "PROJECT", businessId: "p9" },
      scopedUser,
    );

    const query = connection.calls.find((call) =>
      call.sql.includes("FROM file_object f JOIN file_version v"),
    )!;
    expect(query.sql).toContain("f.classification<>'SENSITIVE' OR ?=1");
    expect(query.sql).toContain("f.is_deleted=0");
    expect(query.sql).toContain("p.is_deleted=0");
    expect(query.params).toEqual([
      "PROJECT",
      "p9",
      0,
      "u3",
      "u3",
      0,
      "e3",
      "e3",
      "p9",
      "d2",
      "e3",
    ]);
  });

  it("denies sensitive file version history without sensitive read permission", async () => {
    const connection = sensitiveHistoryConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("file.version.history", { fileId: "f99" }, scopedUser),
    ).rejects.toMatchObject({
      code: "SENSITIVE_FILE_DENIED",
      status: 403,
    });

    expect(
      connection.calls.some((call) =>
        call.sql.includes("FROM file_version WHERE file_id=?"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("requires project write access when preparing project file uploads", async () => {
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

    const query = connection.calls.find((call) =>
      call.sql.includes("iam_project_grant"),
    )!;
    expect(query.sql).toContain("JOIN org_employee pm");
    expect(query.sql).toContain("iam_project_grant");
    expect(query.sql).toContain("p.id IN (?)");
    expect(
      connection.calls
        .filter((call) => call.sql.includes("FROM prj_project p"))
        .every((call) => call.sql.includes("p.is_deleted=0")),
    ).toBe(true);
    expect(query.sql).toContain("pm.department_id IN (?)");
    expect(query.params).toEqual(["p9", 0, "e3", "e3", "p9", "d2", "e3"]);
  });

  it("does not create project files when project write scope checks fail", async () => {
    const connection = fileConnection("INTERNAL", false);
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
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
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_WRITE_FORBIDDEN",
      status: 403,
    });

    const projectCheck = connection.calls.find((call) =>
      call.sql.includes("iam_project_grant"),
    )!;
    expect(projectCheck.params).toEqual(["p9", 0, "e3", "e3", "p9", "d2", "e3"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO file_object"),
      ),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO file_version"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rejects project file uploads when project id is missing or mismatched", async () => {
    for (const input of [
      {
        businessType: "PROJECT",
        businessId: "p9",
        logicalName: "report.csv",
        originalName: "report.csv",
        mimeType: "text/csv",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      },
      {
        businessType: "PROJECT",
        businessId: "p9",
        projectId: "other-project",
        logicalName: "report.csv",
        originalName: "report.csv",
        mimeType: "text/csv",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      },
    ]) {
      const connection = fileConnection();
      const executor = new MySqlActionExecutor({
        getConnection: async () => connection,
      } as never);

      await expect(
        executor.execute("file.upload.prepare", input, scopedUser),
      ).rejects.toThrow("项目附件必须绑定同一项目 ID");

      expect(
        connection.calls.some((call) =>
          call.sql.startsWith("INSERT INTO file_object"),
        ),
      ).toBe(false);
      expect(
        connection.calls.some((call) =>
          call.sql.startsWith("INSERT INTO file_version"),
        ),
      ).toBe(false);
      expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
    }
  });
});
