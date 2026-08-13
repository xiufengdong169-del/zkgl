import { describe, expect, it } from "vitest";

type BackupAssetsModule = {
  verifyBackupAssetInputs(inputs: {
    backupScript: string;
    restoreScript: string;
    backupService: string;
    backupTimer: string;
    objectRestoreVerifier: string;
    objectRestoreManifest: string;
    packageJson: string;
    deploymentDoc: string;
    operationsDoc: string;
    backupTemplate: string;
    finalChecklist: string;
    gitignore: string;
  }): string;
  verifyBackupAssets(options?: { root?: string }): Promise<string>;
};

type ObjectRestoreManifestModule = {
  verifyObjectRestoreManifest(manifest: unknown): string;
};

async function loadBackupAssetsModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-backup-assets.mjs")) as BackupAssetsModule;
}

async function loadObjectRestoreManifestModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-object-restore-manifest.mjs")) as ObjectRestoreManifestModule;
}

function validInputs() {
  const docs = [
    "scripts/create-mysql-backup.mjs",
    "scripts/restore-mysql-backup.mjs",
    "scripts/verify-object-restore-manifest.mjs",
    "docs/object-restore-manifest.example.json",
    "deploy/systemd/zkgl-mysql-backup.service",
    "deploy/systemd/zkgl-mysql-backup.timer",
    "BACKUP_RETENTION_DAYS",
    "BACKUP_MYSQL_DIR",
    ".sql",
    "private/files",
    "private/exports",
  ].join("\n");
  return {
    backupScript: [
      "mysqldump",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      "--result-file",
      "BACKUP_RETENTION_DAYS",
      "/var/backups/zkgl/mysql",
      "MYSQL_PWD",
      "safeBackupDatabaseName",
      "Backup file path must stay inside BACKUP_MYSQL_DIR",
    ].join("\n"),
    restoreScript: [
      "mysqlRestoreConfig",
      "RESTORE_DB_NAME",
      "RESTORE_BACKUP_FILE",
      "RESTORE_CONFIRM",
      "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
      "RESTORE_DB_NAME must not equal production DB_NAME",
      "RESTORE_BACKUP_FILE must point to a .sql backup file",
      "createReadStream",
      "MYSQL_PWD",
      "mysql",
    ].join("\n"),
    objectRestoreVerifier: [
      "zkgl-object-restore-manifest.v1",
      "PROJECT_ATTACHMENT",
      "EXPORT_FILE",
      "private/files",
      "private/exports",
      "temporaryDownloadUrl must use HTTPS",
      "SENSITIVE_ATTACHMENT_DENIED",
      "EXPIRED_EXPORT_DENIED",
    ].join("\n"),
    objectRestoreManifest: [
      "zkgl-object-restore-manifest.v1",
      "PROJECT_ATTACHMENT",
      "EXPORT_FILE",
      "private/files",
      "private/exports",
      "temporaryDownloadUrl",
      "databaseRecordMatched",
      "objectRestored",
      "SENSITIVE_ATTACHMENT_DENIED",
      "EXPIRED_EXPORT_DENIED",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        verify:
          "npm run typecheck && node scripts/verify-backup-assets.mjs && npm run verify:object-restore",
        "verify:object-restore":
          "node scripts/verify-object-restore-manifest.mjs",
      },
    }),
    backupService: [
      "Type=oneshot",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node scripts/create-mysql-backup.mjs",
      "User=zkgl",
    ].join("\n"),
    backupTimer: [
      "OnCalendar=*-*-* 02:30:00",
      "Persistent=true",
      "Unit=zkgl-mysql-backup.service",
      "WantedBy=timers.target",
    ].join("\n"),
    deploymentDoc: docs,
    operationsDoc: docs,
    backupTemplate: docs,
    finalChecklist: docs,
    gitignore: "backups/",
  };
}

describe("backup asset verifier script", () => {
  it("accepts aligned MySQL backup script, timer, and documentation assets", async () => {
    const { verifyBackupAssetInputs } = await loadBackupAssetsModule();

    expect(verifyBackupAssetInputs(validInputs())).toBe(
      "Backup assets verified",
    );
  });

  it("rejects backups that would run without transactional consistency", async () => {
    const { verifyBackupAssetInputs } = await loadBackupAssetsModule();
    const inputs = validInputs();
    inputs.backupScript = inputs.backupScript.replace("--single-transaction", "");

    expect(() => verifyBackupAssetInputs(inputs)).toThrow(
      "scripts/create-mysql-backup.mjs missing --single-transaction",
    );
  });

  it("rejects timer drift that would remove the daily backup schedule", async () => {
    const { verifyBackupAssetInputs } = await loadBackupAssetsModule();
    const inputs = validInputs();
    inputs.backupTimer = inputs.backupTimer.replace(
      "OnCalendar=*-*-* 02:30:00",
      "OnCalendar=weekly",
    );

    expect(() => verifyBackupAssetInputs(inputs)).toThrow(
      "deploy/systemd/zkgl-mysql-backup.timer missing OnCalendar=*-*-* 02:30:00",
    );
  });

  it("rejects missing object restore manifest verification from the main gate", async () => {
    const { verifyBackupAssetInputs } = await loadBackupAssetsModule();
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({
      scripts: {
        verify: "npm run typecheck && node scripts/verify-backup-assets.mjs",
      },
    });

    expect(() => verifyBackupAssetInputs(inputs)).toThrow(
      "package.json missing verify:object-restore script",
    );
  });

  it("verifies the repository object restore manifest example", async () => {
    const { verifyBackupAssets } = await loadBackupAssetsModule();

    await expect(verifyBackupAssets()).resolves.toBe("Backup assets verified");
  });
});

describe("object restore manifest verifier script", () => {
  function validManifest() {
    const objectBase = {
      backupSnapshotAt: "2026-08-14T02:30:00.000+08:00",
      restoredSnapshotAt: "2026-08-14T03:00:00.000+08:00",
      temporaryDownloadUrl: "https://download.example.invalid/file",
      databaseRecordMatched: true,
      objectRestored: true,
      sizeBytes: 128,
    };
    return {
      schemaVersion: "zkgl-object-restore-manifest.v1",
      restorePointAt: "2026-08-14T02:30:00.000+08:00",
      databaseBackupFile: "/var/backups/zkgl/mysql/zkgl.sql",
      objects: [
        {
          ...objectBase,
          type: "PROJECT_ATTACHMENT",
          projectId: "p1",
          storageKey: `cloud://env/private/files/f1/v1/${"a".repeat(64)}.pdf`,
          sha256: "a".repeat(64),
        },
        {
          ...objectBase,
          type: "PROJECT_ATTACHMENT",
          projectId: "p2",
          storageKey: `cloud://env/private/files/f2/v1/${"b".repeat(64)}.docx`,
          sha256: "b".repeat(64),
        },
        {
          ...objectBase,
          type: "PROJECT_ATTACHMENT",
          projectId: "p3",
          storageKey: `private/files/f3/v2/${"c".repeat(64)}.xlsx`,
          sha256: "c".repeat(64),
        },
        {
          ...objectBase,
          type: "EXPORT_FILE",
          exportTaskCode: "DC-2026-0007",
          storageKey: "cloud://env/private/exports/DC-2026-0007.csv",
          sha256: "d".repeat(64),
        },
      ],
      accessChecks: [
        {
          type: "SENSITIVE_ATTACHMENT_DENIED",
          unauthorizedDenied: true,
          auditLogMatched: true,
        },
        {
          type: "EXPIRED_EXPORT_DENIED",
          expiredDownloadDenied: true,
          auditLogMatched: true,
        },
      ],
    };
  }

  it("accepts object restore evidence covering attachments and export files", async () => {
    const { verifyObjectRestoreManifest } =
      await loadObjectRestoreManifestModule();

    expect(verifyObjectRestoreManifest(validManifest())).toBe(
      "Object restore manifest verified",
    );
  });

  it("rejects restored attachment evidence whose private path hash mismatches the database hash", async () => {
    const { verifyObjectRestoreManifest } =
      await loadObjectRestoreManifestModule();
    const manifest = validManifest();
    manifest.objects[0]!.sha256 = "e".repeat(64);

    expect(() => verifyObjectRestoreManifest(manifest)).toThrow(
      "storageKey hash must match sha256",
    );
  });

  it("rejects object restore evidence without HTTPS download proof or denial audit proof", async () => {
    const { verifyObjectRestoreManifest } =
      await loadObjectRestoreManifestModule();
    const httpManifest = validManifest();
    httpManifest.objects[3]!.temporaryDownloadUrl =
      "http://download.example.invalid/file";
    expect(() => verifyObjectRestoreManifest(httpManifest)).toThrow(
      "temporaryDownloadUrl must use HTTPS",
    );

    const missingAccess = validManifest();
    missingAccess.accessChecks = [];
    expect(() => verifyObjectRestoreManifest(missingAccess)).toThrow(
      "SENSITIVE_ATTACHMENT_DENIED",
    );
  });
});
