import type { SessionUser } from '@zkgl/shared'
import { z } from 'zod'

import { AppError, ForbiddenError } from './errors.js'

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
export const DOWNLOAD_URL_TTL_SECONDS = 300

const allowedExtensions = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip'
])
const blockedExtensions = new Set(['exe', 'dll', 'bat', 'cmd', 'ps1', 'js', 'sh', 'com', 'msi', 'scr'])

export const fileUploadInput = z.object({
  businessType: z.string().trim().min(1).max(64),
  businessId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  logicalName: z.string().trim().min(1).max(255),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  classification: z.enum(['INTERNAL', 'SENSITIVE']).default('INTERNAL')
})

export interface FileRecord {
  id: string
  businessType: string
  businessId: string
  projectId: string | null
  classification: 'INTERNAL' | 'SENSITIVE'
  currentVersionId: string
  storageKey: string
  status: 'ACTIVE' | 'VOID'
}

export interface FileAccessDependencies {
  canAccessBusiness(user: SessionUser, file: FileRecord): Promise<boolean>
  canAccessSensitiveFile(user: SessionUser, file: FileRecord): Promise<boolean>
  createTemporaryUrl(storageKey: string, expiresInSeconds: number): Promise<string>
  writeAccessLog(input: {
    fileId: string; versionId: string; userId: string; outcome: 'SUCCESS' | 'DENIED';
    denialCode: string | null; requestId: string
  }): Promise<void>
}

export function extractSafeExtension(name: string): string {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (!extension || blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
    throw new AppError('FILE_TYPE_NOT_ALLOWED', `不允许上传 .${extension || '(无扩展名)'} 文件`, 415)
  }
  return extension
}

export function validateUpload(input: unknown) {
  const parsed = fileUploadInput.parse(input)
  return { ...parsed, extension: extractSafeExtension(parsed.originalName) }
}

export function buildPrivateStorageKey(fileId: string, version: number, sha256: string, extension: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) throw new AppError('INVALID_FILE_ID', '文件标识非法')
  return `private/files/${fileId}/v${version}/${sha256.toLowerCase()}.${extension}`
}

export async function authorizeFileDownload(
  user: SessionUser,
  file: FileRecord,
  requestId: string,
  dependencies: FileAccessDependencies
): Promise<{ url: string; expiresInSeconds: number }> {
  let denialCode: string | null = null
  try {
    if (file.status !== 'ACTIVE') throw new ForbiddenError('文件已作废')
    if (!(await dependencies.canAccessBusiness(user, file))) {
      denialCode = 'BUSINESS_ACCESS_DENIED'
      throw new ForbiddenError('无权访问文件所属业务对象')
    }
    if (file.classification === 'SENSITIVE' && !(await dependencies.canAccessSensitiveFile(user, file))) {
      denialCode = 'SENSITIVE_FILE_DENIED'
      throw new ForbiddenError('无权访问敏感附件')
    }
    const url = await dependencies.createTemporaryUrl(file.storageKey, DOWNLOAD_URL_TTL_SECONDS)
    await dependencies.writeAccessLog({
      fileId: file.id, versionId: file.currentVersionId, userId: user.id,
      outcome: 'SUCCESS', denialCode: null, requestId
    })
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS }
  } catch (error) {
    await dependencies.writeAccessLog({
      fileId: file.id, versionId: file.currentVersionId, userId: user.id,
      outcome: 'DENIED', denialCode: denialCode ?? 'FILE_NOT_ACTIVE', requestId
    })
    throw error
  }
}
