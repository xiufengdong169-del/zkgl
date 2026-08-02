import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const defaultBackupDirectory = "/var/backups/zkgl/mysql";

function requiredEnvironment(environment, name) {
  const value = String(environment[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function mysqlBackupConfig(environment = process.env) {
  return {
    host: requiredEnvironment(environment, "DB_HOST"),
    port: String(environment.DB_PORT || "3306").trim(),
    database: requiredEnvironment(environment, "DB_NAME"),
    user: requiredEnvironment(environment, "DB_USER"),
    password: requiredEnvironment(environment, "DB_PASSWORD"),
    backupDirectory: String(
      environment.BACKUP_MYSQL_DIR || defaultBackupDirectory,
    ).trim(),
    retentionDays: Number(environment.BACKUP_RETENTION_DAYS || 30),
  };
}

function timestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function backupFilePath(config, now = new Date()) {
  return resolve(config.backupDirectory, `${config.database}-${timestamp(now)}.sql`);
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function pruneOldBackups(config, now = new Date()) {
  if (!Number.isFinite(config.retentionDays) || config.retentionDays < 1) {
    throw new Error("BACKUP_RETENTION_DAYS must be a positive number");
  }
  const cutoff = now.getTime() - config.retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(config.backupDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    const fullPath = join(config.backupDirectory, entry.name);
    const fileStat = await stat(fullPath);
    if (fileStat.mtimeMs < cutoff) {
      await rm(fullPath, { force: true });
      removed += 1;
    }
  }
  return removed;
}

export async function createMysqlBackup({
  environment = process.env,
  now = new Date(),
} = {}) {
  const config = mysqlBackupConfig(environment);
  await mkdir(config.backupDirectory, { recursive: true, mode: 0o750 });
  const outputFile = backupFilePath(config, now);
  const args = [
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--default-character-set=utf8mb4",
    "--set-gtid-purged=OFF",
    "--host",
    config.host,
    "--port",
    config.port,
    "--user",
    config.user,
    "--result-file",
    outputFile,
    config.database,
  ];
  await run("mysqldump", args, {
    env: { ...environment, MYSQL_PWD: config.password },
  });
  const removed = await pruneOldBackups(config, now);
  return { ok: true, outputFile, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await createMysqlBackup();
  console.log(JSON.stringify(result));
}
