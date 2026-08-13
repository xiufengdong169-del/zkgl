import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function requiredEnvironment(environment, name) {
  const value = String(environment[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function mysqlRestoreConfig(environment = process.env) {
  const productionDatabase = requiredEnvironment(environment, "DB_NAME");
  const targetDatabase = requiredEnvironment(environment, "RESTORE_DB_NAME");
  const backupFile = resolve(requiredEnvironment(environment, "RESTORE_BACKUP_FILE"));
  if (targetDatabase === productionDatabase) {
    throw new Error("RESTORE_DB_NAME must not equal production DB_NAME");
  }
  if (extname(backupFile).toLowerCase() !== ".sql") {
    throw new Error("RESTORE_BACKUP_FILE must point to a .sql backup file");
  }
  if (environment.RESTORE_CONFIRM !== "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION") {
    throw new Error("RESTORE_CONFIRM is required before restoring a backup");
  }
  return {
    host: requiredEnvironment(environment, "DB_HOST"),
    port: String(environment.DB_PORT || "3306").trim(),
    user: requiredEnvironment(environment, "DB_USER"),
    password: requiredEnvironment(environment, "DB_PASSWORD"),
    productionDatabase,
    targetDatabase,
    backupFile,
  };
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["pipe", "inherit", "inherit"],
    });
    options.input.pipe(child.stdin);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export function mysqlRestoreArgs(config) {
  return [
    "--default-character-set=utf8mb4",
    "--host",
    config.host,
    "--port",
    config.port,
    "--user",
    config.user,
    "--database",
    config.targetDatabase,
  ];
}

export async function restoreMysqlBackup({ environment = process.env } = {}) {
  const config = mysqlRestoreConfig(environment);
  await access(config.backupFile);
  await run("mysql", mysqlRestoreArgs(config), {
    env: { ...environment, MYSQL_PWD: config.password },
    input: createReadStream(config.backupFile),
    shell: false,
  });
  return { ok: true, targetDatabase: config.targetDatabase };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await restoreMysqlBackup();
  console.log(JSON.stringify(result));
}
