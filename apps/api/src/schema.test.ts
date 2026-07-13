import { readFileSync } from "node:fs";
import { Parser } from "node-sql-parser";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../database/init/schema.sql", import.meta.url),
  "utf8",
);
const statements = schema
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean);

describe("empty database initialization schema", () => {
  it("所有语句均可按 MySQL 方言解析", () => {
    const parser = new Parser();
    for (const statement of statements) {
      expect(
        () => parser.astify(statement, { database: "MySQL" }),
        statement.slice(0, 120),
      ).not.toThrow();
    }
  });

  it("表名唯一且外键目标表全部存在", () => {
    const tables = [
      ...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi),
    ].map((match) => match[1]!.toLowerCase());
    expect(tables.length).toBeGreaterThanOrEqual(60);
    expect(new Set(tables).size).toBe(tables.length);
    const references = [...schema.matchAll(/REFERENCES\s+([a-z0-9_]+)/gi)].map(
      (match) => match[1]!.toLowerCase(),
    );
    for (const target of references)
      expect(tables, `missing foreign-key table ${target}`).toContain(target);
  });

  it("不包含数据库迁移版本表", () => {
    expect(schema).not.toMatch(/schema_migration|migration_version/i);
  });

  it("内部账号与人员、CloudBase UID 均为一对一映射", () => {
    expect(schema).toMatch(/cloudbase_uid VARCHAR\(128\) NOT NULL UNIQUE/);
    expect(schema).toContain("UNIQUE KEY uk_iam_user_employee (employee_id)");
    expect(schema).not.toMatch(/password|password_hash|password_salt/i);
  });

  it("保证金缴纳和没收损失均配置审批模板与状态字段", () => {
    expect(schema).toContain("('DEPOSIT_PAYMENT', '保证金缴纳', 'DEPOSIT'");
    expect(schema).toContain(
      "('DEPOSIT_LOSS', '保证金没收损失', 'DEPOSIT_LOSS'",
    );
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS fin_deposit_event[\s\S]*?status VARCHAR\(32\) NOT NULL DEFAULT 'APPROVED'/,
    );
  });

  it("受限字段授权包含后端可执行的默认角色基线", () => {
    expect(schema).toContain(
      "CREATE TABLE IF NOT EXISTS iam_sensitive_field_grant",
    );
    expect(schema).toContain("SELECT 'bank_account' field_code");
    expect(schema).toContain("UNION ALL SELECT 'partner_settlement'");
    expect(schema).toContain("access_level IN ('FULL','MASKED')");
  });

  it("金额字段统一使用 DECIMAL 而非浮点类型", () => {
    const definitions = schema.split(/\r?\n/).filter((line) => {
      const identifier =
        /^\s*([a-z0-9_]+)\s+(?:DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|VARCHAR|INT|BIGINT|TINYINT|SMALLINT|TEXT|JSON|DATE|DATETIME)/i.exec(
          line,
        )?.[1];
      return Boolean(
        identifier &&
        /(?:^|_)(amount|cost|revenue|profit|fee|ceiling|budget)$/i.test(
          identifier,
        ),
      );
    });
    expect(definitions.length).toBeGreaterThan(40);
    for (const line of definitions) expect(line).toMatch(/DECIMAL\(/i);
  });
});
