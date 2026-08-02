import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Backup asset verification failed: ${message}`);
};

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

export async function readBackupAssets(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [
    backupScript,
    restoreScript,
    backupService,
    backupTimer,
    deploymentDoc,
    operationsDoc,
    backupTemplate,
    finalChecklist,
    gitignore,
  ] = await Promise.all([
    readText("scripts/create-mysql-backup.mjs"),
    readText("scripts/restore-mysql-backup.mjs"),
    readText("deploy/systemd/zkgl-mysql-backup.service"),
    readText("deploy/systemd/zkgl-mysql-backup.timer"),
    readText("docs/deployment.md"),
    readText("docs/operations-acceptance.md"),
    readText("docs/backup-recovery-acceptance-template.md"),
    readText("docs/final-acceptance-checklist.md"),
    readText(".gitignore"),
  ]);
  return {
    backupScript,
    restoreScript,
    backupService,
    backupTimer,
    deploymentDoc,
    operationsDoc,
    backupTemplate,
    finalChecklist,
    gitignore,
  };
}

export function verifyBackupAssetInputs({
  backupScript,
  restoreScript,
  backupService,
  backupTimer,
  deploymentDoc,
  operationsDoc,
  backupTemplate,
  finalChecklist,
  gitignore,
} = {}) {
  includesAll(
    backupScript,
    [
      "mysqldump",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      "--result-file",
      "BACKUP_RETENTION_DAYS",
      "/var/backups/zkgl/mysql",
      "MYSQL_PWD",
    ],
    "scripts/create-mysql-backup.mjs",
  );
  includesAll(
    restoreScript,
    [
      "mysqlRestoreConfig",
      "RESTORE_DB_NAME",
      "RESTORE_BACKUP_FILE",
      "RESTORE_CONFIRM",
      "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
      "RESTORE_DB_NAME must not equal production DB_NAME",
      "createReadStream",
      "MYSQL_PWD",
      "mysql",
    ],
    "scripts/restore-mysql-backup.mjs",
  );
  includesAll(
    backupService,
    [
      "Type=oneshot",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node scripts/create-mysql-backup.mjs",
      "User=zkgl",
    ],
    "deploy/systemd/zkgl-mysql-backup.service",
  );
  includesAll(
    backupTimer,
    [
      "OnCalendar=*-*-* 02:30:00",
      "Persistent=true",
      "Unit=zkgl-mysql-backup.service",
      "WantedBy=timers.target",
    ],
    "deploy/systemd/zkgl-mysql-backup.timer",
  );
  for (const [context, source] of [
    ["docs/deployment.md", deploymentDoc],
    ["docs/operations-acceptance.md", operationsDoc],
    ["docs/backup-recovery-acceptance-template.md", backupTemplate],
    ["docs/final-acceptance-checklist.md", finalChecklist],
  ]) {
    includesAll(
      source,
      [
        "scripts/create-mysql-backup.mjs",
        "scripts/restore-mysql-backup.mjs",
        "deploy/systemd/zkgl-mysql-backup.service",
        "deploy/systemd/zkgl-mysql-backup.timer",
        "BACKUP_RETENTION_DAYS",
      ],
      context,
    );
  }
  includesAll(gitignore, ["backups/"], ".gitignore");
  return "Backup assets verified";
}

export async function verifyBackupAssets({ root = defaultRoot } = {}) {
  return verifyBackupAssetInputs(await readBackupAssets(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyBackupAssets());
}
