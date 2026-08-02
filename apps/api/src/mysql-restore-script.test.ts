import { describe, expect, it } from "vitest";

type MysqlRestoreModule = {
  mysqlRestoreConfig(environment: NodeJS.ProcessEnv): {
    host: string;
    port: string;
    user: string;
    password: string;
    productionDatabase: string;
    targetDatabase: string;
    backupFile: string;
  };
  mysqlRestoreArgs(config: {
    host: string;
    port: string;
    user: string;
    targetDatabase: string;
  }): string[];
};

async function loadMysqlRestoreModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/restore-mysql-backup.mjs")) as MysqlRestoreModule;
}

const validRestoreEnvironment = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_NAME: "zkgl",
  DB_USER: "zkgl_app",
  DB_PASSWORD: "local-secret",
  RESTORE_BACKUP_FILE: "backups/zkgl.sql",
  RESTORE_DB_NAME: "zkgl_restore_verify",
  RESTORE_CONFIRM: "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
} as NodeJS.ProcessEnv;

describe("mysql restore script", () => {
  it("requires an explicit restore confirmation for verification drills", async () => {
    const { mysqlRestoreConfig } = await loadMysqlRestoreModule();

    expect(() =>
      mysqlRestoreConfig({
        ...validRestoreEnvironment,
        RESTORE_CONFIRM: "",
      } as NodeJS.ProcessEnv),
    ).toThrow("RESTORE_CONFIRM is required");
  });

  it("rejects restoring into the production database name", async () => {
    const { mysqlRestoreConfig } = await loadMysqlRestoreModule();

    expect(() =>
      mysqlRestoreConfig({
        ...validRestoreEnvironment,
        RESTORE_DB_NAME: "zkgl",
      } as NodeJS.ProcessEnv),
    ).toThrow("RESTORE_DB_NAME must not equal production DB_NAME");
  });

  it("builds mysql restore arguments without embedding credentials", async () => {
    const { mysqlRestoreArgs, mysqlRestoreConfig } =
      await loadMysqlRestoreModule();
    const config = mysqlRestoreConfig(validRestoreEnvironment);

    expect(config).toMatchObject({
      productionDatabase: "zkgl",
      targetDatabase: "zkgl_restore_verify",
    });
    expect(mysqlRestoreArgs(config)).toEqual([
      "--default-character-set=utf8mb4",
      "--host",
      "127.0.0.1",
      "--port",
      "3306",
      "--user",
      "zkgl_app",
      "--database",
      "zkgl_restore_verify",
    ]);
    expect(mysqlRestoreArgs(config).join(" ")).not.toContain("local-secret");
  });
});
