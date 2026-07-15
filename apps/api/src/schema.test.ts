import { readFileSync } from "node:fs";
import { Parser } from "node-sql-parser";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../database/init/schema.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
const persistence = readFileSync(
  new URL("./persistence.ts", import.meta.url),
  "utf8",
);
const webRoutes = readFileSync(
  new URL("../../web/src/routes.ts", import.meta.url),
  "utf8",
);
const webNavigation = readFileSync(
  new URL("../../web/src/navigation.ts", import.meta.url),
  "utf8",
);
const statements = schema
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean);

const extractObjectKeys = (source: string, pattern: RegExp) => {
  const block = pattern.exec(source)?.[1] ?? "";
  return [...block.matchAll(/^\s*([A-Z_]+):/gm)]
    .map((match) => match[1]!)
    .sort();
};

const extractPermissionCodes = (source: string) =>
  [
    ...new Set(
      [...source.matchAll(/permission:\s*"([^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    ),
  ].sort();

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

  it("外键目标表在空库初始化脚本中先于引用表创建", () => {
    const createdTables = new Set<string>();
    const forwardReferences: string[] = [];

    for (const statement of statements) {
      const table = /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/i.exec(
        statement,
      )?.[1];
      if (!table) continue;

      const targets = [
        ...statement.matchAll(/REFERENCES\s+([a-z0-9_]+)/gi),
      ].map((match) => match[1]!.toLowerCase());

      for (const target of targets) {
        if (target !== table.toLowerCase() && !createdTables.has(target)) {
          forwardReferences.push(`${table.toLowerCase()} -> ${target}`);
        }
      }
      createdTables.add(table.toLowerCase());
    }

    expect(forwardReferences).toEqual([]);
  });

  it("不包含数据库迁移版本表", () => {
    expect(schema).not.toMatch(/schema_migration|migration_version/i);
  });

  it("内部账号与人员、CloudBase UID 均为一对一映射", () => {
    expect(schema).toMatch(/cloudbase_uid VARCHAR\(128\) NOT NULL UNIQUE/);
    expect(schema).toContain("UNIQUE KEY uk_iam_user_employee (employee_id)");
    expect(schema).toContain(
      "CONSTRAINT fk_iam_user_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id)",
    );
    expect(schema).not.toMatch(/password|password_hash|password_salt/i);
  });

  it("系统参数纳入初始化基线并使用版本控制", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS sys_parameter");
    expect(schema).toContain("param_key VARCHAR(128) NOT NULL UNIQUE");
    expect(schema).toContain("version INT UNSIGNED NOT NULL DEFAULT 0");
    expect(schema).toContain("('export.retention_days'");
  });

  it("临时项目授权记录起止时间和授权人", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS iam_project_grant");
    expect(schema).toContain("starts_on DATE NOT NULL");
    expect(schema).toContain("ends_on DATE NULL");
    expect(schema).toContain("granted_by BIGINT UNSIGNED NOT NULL");
  });

  it("所有接口权限码均存在初始化权限种子", () => {
    const actionPermissions = extractPermissionCodes(actions);
    expect(actionPermissions.length).toBeGreaterThan(40);
    for (const permission of actionPermissions)
      expect(schema, `missing permission seed ${permission}`).toContain(
        `('${permission}'`,
      );
  });

  it("所有前端路由和导航权限码均存在初始化权限种子", () => {
    const routePermissions = extractPermissionCodes(webRoutes);
    const navigationPermissions = extractPermissionCodes(webNavigation);

    expect(routePermissions.length).toBeGreaterThan(10);
    expect(navigationPermissions).toEqual(routePermissions);
    for (const permission of routePermissions)
      expect(schema, `missing frontend permission seed ${permission}`).toContain(
        `('${permission}'`,
      );
  });

  it("所有可提交审批业务均配置模板和审批结果回写", () => {
    const submitBusinessTypes = extractObjectKeys(
      persistence,
      /case "approval\.instance\.submit":[\s\S]*?const businessMap:[\s\S]*?= \{([\s\S]*?)\};\s*const config/,
    );
    const resultBusinessTypes = extractObjectKeys(
      persistence,
      /async function applyBusinessApprovalResult[\s\S]*?const map:[\s\S]*?= \{([\s\S]*?)\};\s*const config/,
    );
    const templateBusinessTypes = [
      ...new Set(
        [...schema.matchAll(/\('([^']+)', '[^']+', '([^']+)'/g)].map(
          (match) => match[2]!,
        ),
      ),
    ].sort();

    expect(submitBusinessTypes.length).toBeGreaterThan(10);
    expect(resultBusinessTypes).toEqual(submitBusinessTypes);
    for (const businessType of submitBusinessTypes)
      expect(
        templateBusinessTypes,
        `missing approval template for ${businessType}`,
      ).toContain(businessType);
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
