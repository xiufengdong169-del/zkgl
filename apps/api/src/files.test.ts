import type { SessionUser } from "@zkgl/shared";
import { describe, expect, it, vi } from "vitest";

import {
  authorizeFileDownload,
  buildPrivateStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  extractSafeExtension,
  validateUpload,
  type FileAccessDependencies,
  type FileRecord,
} from "./files.js";

const user: SessionUser = {
  id: "u1",
  cloudbaseUid: "cb1",
  employeeId: "e1",
  departmentId: "d1",
  enabled: true,
  roleCodes: [],
  permissionCodes: [],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "PROJECT", projectIds: ["p1"] }],
};
const file: FileRecord = {
  id: "f1",
  businessType: "PROJECT",
  businessId: "p1",
  projectId: "p1",
  classification: "INTERNAL",
  currentVersionId: "v1",
  storageKey: "private/files/f1/v1/hash.pdf",
  status: "ACTIVE",
};

function dependencies(
  overrides: Partial<FileAccessDependencies> = {},
): FileAccessDependencies {
  return {
    canAccessBusiness: async () => true,
    canAccessSensitiveFile: async () => true,
    createTemporaryUrl: vi.fn(async () => "https://temporary.example/file"),
    writeAccessLog: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("private files", () => {
  it("allows CSV report attachments", () => {
    expect(extractSafeExtension("project-export.csv")).toBe("csv");
  });

  it("拒绝脚本和可执行文件", () => {
    for (const name of [
      "a.exe",
      "a.dll",
      "a.bat",
      "a.cmd",
      "a.ps1",
      "a.js",
      "a.sh",
      "a.com",
      "a.msi",
      "a.scr",
    ])
      expect(() => extractSafeExtension(name)).toThrow();
  });

  it("拒绝无扩展名或不在白名单内的附件类型", () => {
    for (const name of ["README", "archive.7z", "macro.xlsm", "page.html"])
      expect(() => extractSafeExtension(name)).toThrow();
  });

  it("限制单文件 100MB 并验证哈希", () => {
    expect(() =>
      validateUpload({
        businessType: "PROJECT",
        businessId: "p1",
        logicalName: "合同",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100 * 1024 * 1024 + 1,
        sha256: "a".repeat(64),
      }),
    ).toThrow();
  });

  it("版本路径不可覆盖并始终位于私有目录", () => {
    expect(buildPrivateStorageKey("f1", 2, "a".repeat(64), "pdf")).toBe(
      `private/files/f1/v2/${"a".repeat(64)}.pdf`,
    );
  });

  it("requires project attachments to carry the same project id as business id", () => {
    expect(() =>
      validateUpload({
        businessType: "PROJECT",
        businessId: "p1",
        logicalName: "合同",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      }),
    ).toThrow("项目附件必须绑定同一项目 ID");
    expect(() =>
      validateUpload({
        businessType: "PROJECT",
        businessId: "p1",
        projectId: "p2",
        logicalName: "合同",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      }),
    ).toThrow("项目附件必须绑定同一项目 ID");
    expect(
      validateUpload({
        businessType: "PROJECT",
        businessId: "p1",
        projectId: "p1",
        logicalName: "合同",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        sha256: "a".repeat(64),
      }),
    ).toMatchObject({ projectId: "p1", extension: "pdf" });
  });

  it("先校验业务权限再生成五分钟临时地址", async () => {
    const deps = dependencies();
    const result = await authorizeFileDownload(user, file, "r1", deps);
    expect(result.expiresInSeconds).toBe(DOWNLOAD_URL_TTL_SECONDS);
    expect(deps.createTemporaryUrl).toHaveBeenCalledWith(file.storageKey, 300);
  });

  it("无业务权限时拒绝并记录访问日志", async () => {
    const deps = dependencies({ canAccessBusiness: async () => false });
    await expect(authorizeFileDownload(user, file, "r2", deps)).rejects.toThrow(
      "无权访问",
    );
    expect(deps.createTemporaryUrl).not.toHaveBeenCalled();
    expect(deps.writeAccessLog).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "DENIED" }),
    );
  });
});
