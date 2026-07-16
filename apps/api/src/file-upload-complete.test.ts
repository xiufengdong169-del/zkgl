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
  dataScopes: [{ type: "PROJECT", projectIds: ["p1"] }],
};

function uploadCompleteConnection() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    beginTransaction: async () => calls.push({ sql: "BEGIN", params: [] }),
    commit: async () => calls.push({ sql: "COMMIT", params: [] }),
    rollback: async () => calls.push({ sql: "ROLLBACK", params: [] }),
    release: () => calls.push({ sql: "RELEASE", params: [] }),
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("expectedStorageKey")) {
        return [
          [
            {
              id: "f1",
              versionId: "v1",
              expectedStorageKey: "private/files/f1/v1/aaaaaaaa.pdf",
            },
          ],
          [],
        ];
      }
      return [{ affectedRows: 1 }, []];
    },
  };
}

describe("file upload completion", () => {
  it("rejects completion when the uploaded cloud file does not match the reserved storage key", async () => {
    const connection = uploadCompleteConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "file.upload.complete",
        {
          fileId: "f1",
          cloudFileId: "cloud://env/private/files/f1/v1/bbbbbbbb.pdf",
        },
        user,
      ),
    ).rejects.toMatchObject({ code: "FILE_STORAGE_KEY_MISMATCH" });

    expect(
      connection.calls.some((call) =>
        call.sql.startsWith("UPDATE file_version SET storage_key="),
      ),
    ).toBe(false);
    expect(connection.calls.map((call) => call.sql)).toContain("ROLLBACK");
  });

  it("activates only the reserved file object and version for the uploader", async () => {
    const connection = uploadCompleteConnection();
    const executor = new MySqlActionExecutor({
      getConnection: async () => connection,
    } as never);

    await expect(
      executor.execute(
        "file.upload.complete",
        {
          fileId: "f1",
          cloudFileId: "cloud://env/private/files/f1/v1/aaaaaaaa.pdf",
        },
        user,
      ),
    ).resolves.toEqual({ id: "f1", status: "ACTIVE" });

    const select = connection.calls.find((call) =>
      call.sql.includes("f.created_by=?"),
    );
    const versionUpdate = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE file_version SET storage_key="),
    );
    const fileUpdate = connection.calls.find((call) =>
      call.sql.startsWith("UPDATE file_object SET status='ACTIVE'"),
    );

    expect(select?.params).toEqual(["f1", "u1"]);
    expect(versionUpdate?.params).toEqual([
      "cloud://env/private/files/f1/v1/aaaaaaaa.pdf",
      "v1",
    ]);
    expect(fileUpdate?.params).toEqual(["u1", "f1"]);
    expect(connection.calls.map((call) => call.sql)).toContain("COMMIT");
  });
});
