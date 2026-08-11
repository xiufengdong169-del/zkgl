import type { SessionUser } from "@zkgl/shared";
import { z } from "zod";

import { AppError, ForbiddenError } from "./errors.js";

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const DOWNLOAD_URL_TTL_SECONDS = 300;

const allowedExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "zip",
]);
const blockedExtensions = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "ps1",
  "js",
  "sh",
  "com",
  "msi",
  "scr",
]);
const allowedMimeTypesByExtension = new Map(
  Object.entries({
    pdf: ["application/pdf"],
    doc: ["application/msword"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    xls: ["application/vnd.ms-excel"],
    xlsx: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    gif: ["image/gif"],
    webp: ["image/webp"],
    zip: ["application/zip", "application/x-zip-compressed"],
  }).map(([extension, mimeTypes]) => [extension, new Set(mimeTypes)]),
);
const blockedMimeTypes = new Set([
  "application/javascript",
  "application/x-javascript",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-msi",
  "application/x-sh",
  "application/x-shellscript",
  "application/vnd.microsoft.portable-executable",
  "text/html",
  "text/javascript",
  "text/x-javascript",
  "text/x-shellscript",
]);

const fileUploadBaseInput = z.object({
  businessType: z.string().trim().min(1).max(64),
  businessId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  logicalName: z.string().trim().min(1).max(255),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  classification: z.enum(["INTERNAL", "SENSITIVE"]).default("INTERNAL"),
});

export const fileUploadInput = fileUploadBaseInput.superRefine((value, ctx) => {
  if (
    value.businessType === "PROJECT" &&
    String(value.projectId ?? "") !== value.businessId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["projectId"],
      message: "项目附件必须绑定同一项目 ID",
    });
  }
});

export const fileListInput = z.object({
  businessType: z.string().trim().min(1).max(64),
  businessId: z.string().min(1),
});
export const fileCompleteInput = z.object({
  fileId: z.string().min(1),
  cloudFileId: z.string().regex(/^cloud:\/\//),
});
export const fileVersionUploadInput = fileUploadBaseInput
  .pick({
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    sha256: true,
  })
  .extend({ fileId: z.string().min(1) });
export const fileVersionCompleteInput = z.object({
  fileId: z.string().min(1),
  versionId: z.string().min(1),
  cloudFileId: z.string().regex(/^cloud:\/\//),
});
export const fileHistoryInput = z.object({ fileId: z.string().min(1) });
export const fileDownloadInput = z.object({
  fileId: z.string().min(1),
  versionId: z.string().min(1).nullable().optional(),
});

export interface FileRecord {
  id: string;
  businessType: string;
  businessId: string;
  projectId: string | null;
  classification: "INTERNAL" | "SENSITIVE";
  currentVersionId: string;
  storageKey: string;
  status: "ACTIVE" | "VOID";
}

export interface FileAccessDependencies {
  canAccessBusiness(user: SessionUser, file: FileRecord): Promise<boolean>;
  canAccessSensitiveFile(user: SessionUser, file: FileRecord): Promise<boolean>;
  createTemporaryUrl(
    storageKey: string,
    expiresInSeconds: number,
  ): Promise<string>;
  writeAccessLog(input: {
    fileId: string;
    versionId: string;
    userId: string;
    outcome: "SUCCESS" | "DENIED";
    denialCode: string | null;
    requestId: string;
  }): Promise<void>;
}

export function extractSafeExtension(name: string): string {
  const segments = name
    .toLowerCase()
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const extension = segments.length >= 2 ? segments.at(-1)! : "";
  if (
    !extension ||
    segments.slice(0, -1).some((segment) => blockedExtensions.has(segment)) ||
    blockedExtensions.has(extension) ||
    !allowedExtensions.has(extension)
  ) {
    throw new AppError(
      "FILE_TYPE_NOT_ALLOWED",
      `不允许上传 .${extension || "(无扩展名)"} 文件`,
      415,
    );
  }
  return extension;
}

export function validateFileType(name: string, mimeType: string): string {
  const extension = extractSafeExtension(name);
  const normalizedMimeType = mimeType.split(";")[0]!.trim().toLowerCase();
  if (
    !normalizedMimeType ||
    blockedMimeTypes.has(normalizedMimeType) ||
    !allowedMimeTypesByExtension.get(extension)?.has(normalizedMimeType)
  ) {
    throw new AppError(
      "FILE_TYPE_NOT_ALLOWED",
      `不允许上传 ${normalizedMimeType || "(无 MIME 类型)"} 类型文件`,
      415,
    );
  }
  return extension;
}

export function validateUpload(input: unknown) {
  const parsed = fileUploadInput.parse(input);
  return {
    ...parsed,
    extension: validateFileType(parsed.originalName, parsed.mimeType),
  };
}

export function buildPrivateStorageKey(
  fileId: string,
  version: number,
  sha256: string,
  extension: string,
): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId))
    throw new AppError("INVALID_FILE_ID", "文件标识非法");
  return `private/files/${fileId}/v${version}/${sha256.toLowerCase()}.${extension}`;
}

const reservedPrivateStorageKeyPattern =
  /^private\/files\/[a-zA-Z0-9_-]+\/v[1-9][0-9]*\/[a-f0-9]{64}\.[a-z0-9]+$/;
const cloudFileIdPattern =
  /^cloud:\/\/[a-zA-Z0-9._-]+\/(.+)$/;

export function assertCloudFileIdMatchesStorageKey(
  cloudFileId: string,
  expectedStorageKey: string,
): string {
  if (!reservedPrivateStorageKeyPattern.test(expectedStorageKey)) {
    throw new AppError(
      "FILE_STORAGE_KEY_INVALID",
      "预分配文件存储路径无效",
      500,
    );
  }
  const match = cloudFileIdPattern.exec(cloudFileId);
  if (!match || match[1] !== expectedStorageKey) {
    throw new AppError(
      "FILE_STORAGE_KEY_MISMATCH",
      "上传文件与预分配路径不一致",
      409,
    );
  }
  return cloudFileId;
}

export function assertHttpsTemporaryDownloadUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(
      "TEMPORARY_DOWNLOAD_URL_INVALID",
      "文件临时下载地址无效",
      502,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new AppError(
      "TEMPORARY_DOWNLOAD_URL_NOT_HTTPS",
      "文件临时下载地址必须使用 HTTPS",
      502,
    );
  }
  return parsed.toString();
}

export async function authorizeFileDownload(
  user: SessionUser,
  file: FileRecord,
  requestId: string,
  dependencies: FileAccessDependencies,
): Promise<{ url: string; expiresInSeconds: number }> {
  let denialCode: string | null = null;
  try {
    if (file.status !== "ACTIVE") throw new ForbiddenError("文件已作废");
    if (!(await dependencies.canAccessBusiness(user, file))) {
      denialCode = "BUSINESS_ACCESS_DENIED";
      throw new ForbiddenError("无权访问文件所属业务对象");
    }
    if (
      file.classification === "SENSITIVE" &&
      !(await dependencies.canAccessSensitiveFile(user, file))
    ) {
      denialCode = "SENSITIVE_FILE_DENIED";
      throw new ForbiddenError("无权访问敏感附件");
    }
    const url = assertHttpsTemporaryDownloadUrl(
      await dependencies.createTemporaryUrl(
        file.storageKey,
        DOWNLOAD_URL_TTL_SECONDS,
      ),
    );
    await dependencies.writeAccessLog({
      fileId: file.id,
      versionId: file.currentVersionId,
      userId: user.id,
      outcome: "SUCCESS",
      denialCode: null,
      requestId,
    });
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  } catch (error) {
    const temporaryUrlDenialCode =
      error instanceof AppError &&
      error.code.startsWith("TEMPORARY_DOWNLOAD_URL")
        ? error.code
        : null;
    await dependencies.writeAccessLog({
      fileId: file.id,
      versionId: file.currentVersionId,
      userId: user.id,
      outcome: "DENIED",
      denialCode: denialCode ?? temporaryUrlDenialCode ?? "FILE_NOT_ACTIVE",
      requestId,
    });
    throw error;
  }
}
