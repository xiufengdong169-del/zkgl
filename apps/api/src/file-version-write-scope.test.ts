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
  permissionCodes: ["file.upload"],
  sensitiveFieldAccess: {},
  dataScopes: [],
};

const versionInput = {
  fileId: "f1",
  originalName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1200,
  sha256: "a".repeat(64),
};

function fileVersionConnection(file: Record<string, unknown>, projectWritable = false) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM file_object f WHERE f.id=?")) {
        return [[file], []];
      }
      if (sql.includes("FROM prj_project p")) {
        return [projectWritable ? [{ id: "p1" }] : [], []];
      }
      if (sql.includes("FROM file_version WHERE file_id=?")) {
        return [[], []];
      }
      if (sql.startsWith("INSERT INTO file_version")) {
        return [{ insertId: 2 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("file version write scope", () => {
  it("lets the file creator prepare a new version without project write access", async () => {
    const connection = fileVersionConnection({
      id: "f1",
      currentVersion: 1,
      projectId: null,
      createdBy: "u1",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("file.version.prepare", versionInput, user),
    ).resolves.toMatchObject({
      fileId: "f1",
      versionId: "2",
      versionNumber: 2,
    });

    expect(
      connection.calls.some((call) => call.sql.includes("FROM prj_project p")),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO file_version"),
      ),
    ).toBe(true);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });

  it("rejects non-creators when the file is not bound to a project", async () => {
    const connection = fileVersionConnection({
      id: "f1",
      currentVersion: 1,
      projectId: null,
      createdBy: "other-user",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("file.version.prepare", versionInput, user),
    ).rejects.toMatchObject({
      code: "FILE_BUSINESS_ACCESS_DENIED",
      status: 403,
    });

    expect(
      connection.calls.some((call) => call.sql.includes("FROM prj_project p")),
    ).toBe(false);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO file_version"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("rejects non-creators when project write scope does not include the file project", async () => {
    const connection = fileVersionConnection({
      id: "f1",
      currentVersion: 1,
      projectId: "p1",
      createdBy: "other-user",
    });
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute("file.version.prepare", versionInput, user),
    ).rejects.toMatchObject({
      code: "PROJECT_WRITE_FORBIDDEN",
      status: 403,
    });

    const projectCheck = connection.calls.find((call) =>
      call.sql.includes("FROM prj_project p"),
    );
    expect(projectCheck?.params).toEqual(["p1", 0, "e1", "e1", "e1"]);
    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("INSERT INTO file_version"),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });
});
