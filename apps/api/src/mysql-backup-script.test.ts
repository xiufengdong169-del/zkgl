import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type MysqlBackupModule = {
  mysqlBackupConfig(environment: NodeJS.ProcessEnv): {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
    backupDirectory: string;
    retentionDays: number;
  };
  safeBackupDatabaseName(database: string): string;
  backupFilePath(config: { backupDirectory: string; database: string }, now: Date): string;
  pruneOldBackups(config: { backupDirectory: string; retentionDays: number }, now: Date): Promise<number>;
};

async function loadMysqlBackupModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/create-mysql-backup.mjs")) as MysqlBackupModule;
}

async function withTempDirectory<T>(work: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "zkgl-mysql-backup-"));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("mysql backup script", () => {
  it("loads backup configuration from server-only environment variables", async () => {
    const { mysqlBackupConfig } = await loadMysqlBackupModule();

    expect(
      mysqlBackupConfig({
        DB_HOST: "127.0.0.1",
        DB_PORT: "3306",
        DB_NAME: "zkgl",
        DB_USER: "zkgl_app",
        DB_PASSWORD: "local-secret",
        BACKUP_MYSQL_DIR: "/var/backups/zkgl/mysql",
        BACKUP_RETENTION_DAYS: "30",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      host: "127.0.0.1",
      port: "3306",
      database: "zkgl",
      user: "zkgl_app",
      backupDirectory: "/var/backups/zkgl/mysql",
      retentionDays: 30,
    });
  });

  it("builds deterministic backup filenames without embedding credentials", async () => {
    const { backupFilePath } = await loadMysqlBackupModule();

    expect(
      backupFilePath(
        { backupDirectory: "/var/backups/zkgl/mysql", database: "zkgl" },
        new Date("2026-08-02T02:30:00.000Z"),
      ),
    ).toMatch(/zkgl-2026-08-02T02-30-00-000Z\.sql$/);
  });

  it("rejects unsafe database names before composing backup file paths", async () => {
    const { backupFilePath, safeBackupDatabaseName } = await loadMysqlBackupModule();

    expect(safeBackupDatabaseName("zkgl_prod-01")).toBe("zkgl_prod-01");
    expect(() =>
      backupFilePath(
        { backupDirectory: "/var/backups/zkgl/mysql", database: "../zkgl" },
        new Date("2026-08-02T02:30:00.000Z"),
      ),
    ).toThrow("DB_NAME may only contain letters, numbers, underscore, or hyphen");
    expect(() =>
      backupFilePath(
        { backupDirectory: "/var/backups/zkgl/mysql", database: "zkgl/prod" },
        new Date("2026-08-02T02:30:00.000Z"),
      ),
    ).toThrow("DB_NAME may only contain letters, numbers, underscore, or hyphen");
  });

  it("prunes only expired SQL backup files", async () => {
    const { pruneOldBackups } = await loadMysqlBackupModule();

    await withTempDirectory(async (directory) => {
      const oldSql = join(directory, "old.sql");
      const freshSql = join(directory, "fresh.sql");
      const note = join(directory, "note.txt");
      await writeFile(oldSql, "-- old");
      await writeFile(freshSql, "-- fresh");
      await writeFile(note, "keep");
      const oldDate = new Date("2026-06-01T00:00:00.000Z");
      await utimes(oldSql, oldDate, oldDate);

      await expect(
        pruneOldBackups(
          { backupDirectory: directory, retentionDays: 30 },
          new Date("2026-08-02T00:00:00.000Z"),
        ),
      ).resolves.toBe(1);
      await expect(stat(oldSql)).rejects.toThrow();
      await expect(stat(freshSql)).resolves.toBeTruthy();
      await expect(stat(note)).resolves.toBeTruthy();
    });
  });
});
