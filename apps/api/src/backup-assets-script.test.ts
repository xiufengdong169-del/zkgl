import { describe, expect, it } from "vitest";

type BackupAssetsModule = {
  verifyBackupAssetInputs(inputs: {
    backupScript: string;
    restoreScript: string;
    backupService: string;
    backupTimer: string;
    deploymentDoc: string;
    operationsDoc: string;
    backupTemplate: string;
    finalChecklist: string;
    gitignore: string;
  }): string;
};

async function loadBackupAssetsModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-backup-assets.mjs")) as BackupAssetsModule;
}

function validInputs() {
  const docs = [
    "scripts/create-mysql-backup.mjs",
    "scripts/restore-mysql-backup.mjs",
    "deploy/systemd/zkgl-mysql-backup.service",
    "deploy/systemd/zkgl-mysql-backup.timer",
    "BACKUP_RETENTION_DAYS",
    "BACKUP_MYSQL_DIR",
    ".sql",
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
});
