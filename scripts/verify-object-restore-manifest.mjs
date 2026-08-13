import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const defaultManifest = "docs/object-restore-manifest.example.json";
const sha256Pattern = /^[a-f0-9]{64}$/i;
const cloudStorageKeyPattern = /^cloud:\/\/[a-zA-Z0-9._-]+\/(.+)$/;
const projectAttachmentStoragePathPattern =
  /^private\/files\/[a-zA-Z0-9_-]+\/v[1-9][0-9]*\/([a-f0-9]{64})\.[a-z0-9]+$/;
const exportStoragePathPattern = /^private\/exports\/[A-Za-z0-9_-]+\.csv$/;
const temporaryDownloadUrlHttpsMessage = "temporaryDownloadUrl must use HTTPS";
const defaultMaxSnapshotDriftMinutes = 60;

const fail = (message) => {
  throw new Error(`Object restore manifest verification failed: ${message}`);
};

function requireString(record, key, context) {
  const value = String(record?.[key] ?? "").trim();
  if (!value) fail(`${context} missing ${key}`);
  return value;
}

function requireIsoDate(value, context) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(`${context} must be an ISO date-time`);
  if (!/\d{4}-\d{2}-\d{2}T/.test(value)) {
    fail(`${context} must include date and time`);
  }
  return time;
}

function requireHttpsUrl(value, context) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${context} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:") fail(`${temporaryDownloadUrlHttpsMessage}: ${context}`);
  if (parsed.username || parsed.password) {
    fail(`${context} must not embed credentials`);
  }
}

function privateStoragePath(storageKey) {
  const cloudMatch = cloudStorageKeyPattern.exec(storageKey);
  return cloudMatch ? cloudMatch[1] : storageKey;
}

function verifyObjectRecord(record, index, restorePointTime, maxSnapshotDriftMinutes) {
  const context = `objects[${index}]`;
  const type = requireString(record, "type", context);
  const storageKey = requireString(record, "storageKey", context);
  const storagePath = privateStoragePath(storageKey);
  const sha256 = requireString(record, "sha256", context);
  if (!sha256Pattern.test(sha256)) fail(`${context}.sha256 must be 64 hex characters`);
  if (!Number.isInteger(record.sizeBytes) || record.sizeBytes <= 0) {
    fail(`${context}.sizeBytes must be a positive integer`);
  }
  const backupSnapshotTime = requireIsoDate(
    requireString(record, "backupSnapshotAt", context),
    `${context}.backupSnapshotAt`,
  );
  requireIsoDate(requireString(record, "restoredSnapshotAt", context), `${context}.restoredSnapshotAt`);
  const driftMinutes =
    Math.abs(backupSnapshotTime - restorePointTime) / (60 * 1000);
  if (driftMinutes > maxSnapshotDriftMinutes) {
    fail(
      `${context}.backupSnapshotAt must be within ${maxSnapshotDriftMinutes} minutes of restorePointAt`,
    );
  }
  requireHttpsUrl(
    requireString(record, "temporaryDownloadUrl", context),
    `${context}.temporaryDownloadUrl`,
  );
  if (record.databaseRecordMatched !== true) {
    fail(`${context}.databaseRecordMatched must be true`);
  }
  if (record.objectRestored !== true) {
    fail(`${context}.objectRestored must be true`);
  }
  if (type === "PROJECT_ATTACHMENT") {
    const match = projectAttachmentStoragePathPattern.exec(storagePath);
    if (!match) fail(`${context}.storageKey must stay under private/files`);
    if (match[1].toLowerCase() !== sha256.toLowerCase()) {
      fail(`${context}.storageKey hash must match sha256`);
    }
    if (!String(record.projectId ?? "").trim()) fail(`${context}.projectId is required`);
    return type;
  }
  if (type === "EXPORT_FILE") {
    if (!exportStoragePathPattern.test(storagePath)) {
      fail(`${context}.storageKey must stay under private/exports`);
    }
    if (!String(record.exportTaskCode ?? "").trim()) {
      fail(`${context}.exportTaskCode is required`);
    }
    return type;
  }
  fail(`${context}.type must be PROJECT_ATTACHMENT or EXPORT_FILE`);
}

function verifyAccessChecks(accessChecks) {
  if (!Array.isArray(accessChecks)) fail("accessChecks must be an array");
  const hasSensitiveDenied = accessChecks.some(
    (check) =>
      check?.type === "SENSITIVE_ATTACHMENT_DENIED" &&
      check.unauthorizedDenied === true &&
      check.auditLogMatched === true,
  );
  const hasExpiredExportDenied = accessChecks.some(
    (check) =>
      check?.type === "EXPIRED_EXPORT_DENIED" &&
      check.expiredDownloadDenied === true &&
      check.auditLogMatched === true,
  );
  if (!hasSensitiveDenied) {
    fail("accessChecks must include SENSITIVE_ATTACHMENT_DENIED with audit log evidence");
  }
  if (!hasExpiredExportDenied) {
    fail("accessChecks must include EXPIRED_EXPORT_DENIED with audit log evidence");
  }
}

export function verifyObjectRestoreManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be a JSON object");
  }
  if (manifest.schemaVersion !== "zkgl-object-restore-manifest.v1") {
    fail("schemaVersion must be zkgl-object-restore-manifest.v1");
  }
  const restorePointTime = requireIsoDate(
    requireString(manifest, "restorePointAt", "manifest"),
    "manifest.restorePointAt",
  );
  const maxSnapshotDriftMinutes = Number(
    manifest.maxSnapshotDriftMinutes ?? defaultMaxSnapshotDriftMinutes,
  );
  if (
    !Number.isInteger(maxSnapshotDriftMinutes) ||
    maxSnapshotDriftMinutes < 0 ||
    maxSnapshotDriftMinutes > 1440
  ) {
    fail("maxSnapshotDriftMinutes must be an integer between 0 and 1440");
  }
  const databaseBackupFile = requireString(
    manifest,
    "databaseBackupFile",
    "manifest",
  );
  if (!databaseBackupFile.toLowerCase().endsWith(".sql")) {
    fail("databaseBackupFile must point to a .sql backup");
  }
  if (!Array.isArray(manifest.objects)) fail("objects must be an array");
  const counts = new Map();
  manifest.objects.forEach((record, index) => {
    const type = verifyObjectRecord(
      record,
      index,
      restorePointTime,
      maxSnapshotDriftMinutes,
    );
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });
  if ((counts.get("PROJECT_ATTACHMENT") ?? 0) < 3) {
    fail("manifest must include at least 3 PROJECT_ATTACHMENT records");
  }
  if ((counts.get("EXPORT_FILE") ?? 0) < 1) {
    fail("manifest must include at least 1 EXPORT_FILE record");
  }
  verifyAccessChecks(manifest.accessChecks);
  return "Object restore manifest verified";
}

export function verifyObjectRestoreManifestFile({
  manifestFile = defaultManifest,
  readFile = readFileSync,
} = {}) {
  const manifest = JSON.parse(readFile(manifestFile, "utf8"));
  return verifyObjectRestoreManifest(manifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    verifyObjectRestoreManifestFile({
      manifestFile: process.argv[2] || defaultManifest,
    }),
  );
}
