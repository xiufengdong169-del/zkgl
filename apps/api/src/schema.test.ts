import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
const webSourceDir = fileURLToPath(new URL("../../web/src", import.meta.url));
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

const extractApprovalBusinessTables = (source: string) => {
  const block =
    /case "approval\.instance\.submit":[\s\S]*?const businessMap:[\s\S]*?= \{([\s\S]*?)\};\s*const config/.exec(
      source,
    )?.[1] ?? "";
  return [...block.matchAll(/^\s*([A-Z_]+):\s*\{\s*table:\s*"([^"]+)"/gm)]
    .map((match) => ({
      businessType: match[1]!,
      table: match[2]!.toLowerCase(),
    }))
    .sort((a, b) => a.businessType.localeCompare(b.businessType));
};

const extractPermissionCodes = (source: string) =>
  [
    ...new Set(
      [...source.matchAll(/permission:\s*"([^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    ),
  ].sort();

const extractActionDefinitions = (source: string) =>
  [...source.matchAll(/^\s*"([^"]+)":\s*\{/gm)]
    .map((match) => match[1]!)
    .filter((action) => action.includes("."))
    .sort();

const extractPersistenceActionCases = (source: string) =>
  [...source.matchAll(/^\s*case "([^"]+)":/gm)]
    .map((match) => match[1]!)
    .filter((action) => action.includes("."))
    .sort();

function listWebSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listWebSourceFiles(fullPath);
    if (entry.name.endsWith(".test.ts")) return [];
    return [".ts", ".vue"].includes(extname(entry.name)) ? [fullPath] : [];
  });
}

const extractInlinePermissionCodes = (source: string) =>
  [
    ...new Set(
      [
        ...source.matchAll(
          /permissionCodes\.includes\(\s*["']([^"']+)["']\s*\)/g,
        ),
      ].map((match) => match[1]!),
    ),
  ].sort();

const extractTableColumns = (source: string) => {
  const tables = new Map<string, Set<string>>();
  for (const match of source.matchAll(
    /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE=/gi,
  )) {
    const table = match[1]!.toLowerCase();
    const columns = new Set(
      [
        ...match[2]!.matchAll(
          /(?:^|,)\s*([a-z0-9_]+)\s+(?:BIGINT|VARCHAR|CHAR|TEXT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|DATE|DATETIME|TINYINT|INT|SMALLINT|JSON)\b/gim,
        ),
      ].map((column) => column[1]!.toLowerCase()),
    );
    tables.set(table, columns);
  }
  return tables;
};

const extractTablesFilteredByIsDeleted = (source: string) => {
  const tables = new Set<string>();
  for (const match of source.matchAll(/`([^`]*\bis_deleted\b[^`]*)`/gi)) {
    const sql = match[1]!;
    const refs = [
      ...sql.matchAll(
        /\b(?:FROM|JOIN|UPDATE)\s+([a-z0-9_]+)(?:\s+([a-z][a-z0-9_]*))?/gi,
      ),
    ];

    for (const ref of refs) {
      const table = ref[1]!.toLowerCase();
      const alias = ref[2];
      if (alias && new RegExp(`\\b${alias}\\.is_deleted\\b`, "i").test(sql)) {
        tables.add(table);
      }
    }

    if (refs.length === 1 && /\bis_deleted\b/i.test(sql)) {
      tables.add(refs[0]![1]!.toLowerCase());
    }
  }
  return [...tables].sort();
};

const extractInsertColumnRefs = (source: string) =>
  [...source.matchAll(/INSERT INTO\s+([a-z0-9_]+)\s*\(([^)]*)\)/gi)].flatMap(
    (match) => {
      const table = match[1]!.toLowerCase();
      return match[2]!
        .split(",")
        .map((column) => ({
          table,
          column: column.trim().replace(/`/g, "").toLowerCase(),
        }))
        .filter(({ column }) => Boolean(column));
    },
  );

const extractSingleTableUpdateColumnRefs = (source: string) =>
  [...source.matchAll(/`([^`]*\bUPDATE\b[^`]*)`/gi)].flatMap((match) => {
    const update = /^\s*UPDATE\s+([a-z0-9_]+)\s+SET\s+([\s\S]*?)(?:\s+WHERE\b|$)/i.exec(
      match[1]!,
    );
    if (!update) return [];
    const table = update[1]!.toLowerCase();
    return [...update[2]!.matchAll(/(?:^|,)\s*([a-z0-9_]+)\s*=/gi)].map(
      (column) => ({
        table,
        column: column[1]!.toLowerCase(),
      }),
    );
  });

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
    const actionDefinitions = extractActionDefinitions(actions);
    const persistenceCases = extractPersistenceActionCases(persistence);

    expect(actionPermissions.length).toBeGreaterThan(40);
    expect(actionDefinitions.length).toBeGreaterThan(100);
    expect(persistenceCases).toEqual(actionDefinitions);
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

  it("frontend inline permission codes are seeded", () => {
    const inlinePermissions = [
      ...new Set(
        listWebSourceFiles(webSourceDir).flatMap((file) =>
          extractInlinePermissionCodes(readFileSync(file, "utf8")),
        ),
      ),
    ].sort();

    expect(inlinePermissions.length).toBeGreaterThan(5);
    for (const permission of inlinePermissions)
      expect(
        schema,
        `missing inline frontend permission seed ${permission}`,
      ).toContain(`('${permission}'`);
  });

  it("approval business types are configured and written back", () => {
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
    const columnsByTable = extractTableColumns(schema);
    const businessTables = extractApprovalBusinessTables(persistence);

    expect(submitBusinessTypes.length).toBeGreaterThan(10);
    expect(resultBusinessTypes).toEqual(submitBusinessTypes);
    expect(businessTables.map((item) => item.businessType)).toEqual(
      submitBusinessTypes,
    );
    for (const businessType of submitBusinessTypes)
      expect(
        templateBusinessTypes,
        `missing approval template for ${businessType}`,
      ).toContain(businessType);
    for (const { businessType, table } of businessTables) {
      expect(
        columnsByTable.get(table),
        `missing approval table ${table}`,
      ).toBeDefined();
      expect(
        columnsByTable.get(table),
        `missing approval_instance_id for ${businessType} (${table})`,
      ).toContain("approval_instance_id");
    }
  });

  it("保证金缴纳和没收损失均配置审批模板与状态字段", () => {
    expect(schema).toContain("('DEPOSIT_PAYMENT', '保证金缴纳', 'DEPOSIT'");
    expect(schema).toContain(
      "('DEPOSIT_LOSS', '保证金没收损失', 'DEPOSIT_LOSS'",
    );
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS fin_deposit_event[\s\S]*?status VARCHAR\(32\) NOT NULL DEFAULT 'APPROVED'/,
    );
    expect(persistence).toContain("pa.source_type<>'DEPOSIT'");
    expect(persistence).toContain("operatingPaymentRows");
    expect(persistence).toContain(
      "cashContribution: receivedAmount - operatingPayment",
    );
  });

  it("合作方结算付款来源读取合作方档案收款账户", () => {
    expect(schema).toContain("bank_account VARCHAR(128) NULL");
    expect(persistence).toContain(
      "PARTNER_SETTLEMENT: `SELECT s.project_id projectId,c.name recipientName,c.bank_account receivingAccount",
    );
    expect(persistence).not.toContain(
      "PARTNER_SETTLEMENT: `SELECT s.project_id projectId,c.name recipientName,'' receivingAccount",
    );
  });

  it("已驳回的付款申请不再占用业务来源", () => {
    expect(persistence).toContain("pa.status<>'REJECTED'");
    expect(persistence).toContain("payment_status='UNPAID'");
    expect(persistence).toContain(
      "WHERE pa.source_type='REIMBURSEMENT' AND pa.source_id=h.id AND pa.status<>'REJECTED'",
    );
    expect(persistence).toContain(
      "WHERE pa.source_type='PARTNER_SETTLEMENT' AND pa.source_id=x.id AND pa.status<>'REJECTED'",
    );
    expect(persistence).toContain(
      "WHERE pa.source_type='DEPOSIT' AND pa.source_id=x.id AND pa.status<>'REJECTED'",
    );
  });

  it("合作方结算基数排除逻辑删除合同并统一历史成本状态口径", () => {
    expect(persistence).toContain(
      "FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND is_deleted=0",
    );
    expect(persistence).not.toMatch(
      /FROM con_contract WHERE project_id=\? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN\('PENDING_SIGNATURE','PERFORMING','COMPLETED'\)(?! AND is_deleted=0)/,
    );
    expect(persistence).toContain(
      "FROM partner_settlement WHERE project_id=? AND status IN('APPROVED','PAID')",
    );
    expect(persistence).not.toContain(
      "FROM con_contract WHERE id=? FOR UPDATE",
    );
    expect(persistence).toContain(
      "WHERE p.project_id=? AND p.is_deleted=0 AND p.status IN('DRAFT','ENABLED')",
    );
    expect(persistence).toContain(
      "WHERE p.project_id=? AND p.id<>? AND p.is_deleted=0 AND p.status='ENABLED'",
    );
    expect(persistence).toContain(
      "WHERE p.id=? AND p.is_deleted=0 AND p.status='ENABLED'",
    );
  });

  it("项目结项前置检查纳入有条件验收遗留问题", () => {
    expect(persistence).toContain(
      "FROM prj_acceptance WHERE project_id=? AND status='COMPLETED' AND result='CONDITIONAL'",
    );
    expect(persistence).toContain("TRIM(remaining_issues)<>''");
    expect(persistence).toContain("acceptanceIssueRows");
  });

  it("合作方结算与保证金核心资金表具备逻辑删除字段并排除已删除数据", () => {
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS partner_settlement[\s\S]*?is_deleted TINYINT\(1\) NOT NULL DEFAULT 0/,
    );
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS fin_deposit[\s\S]*?is_deleted TINYINT\(1\) NOT NULL DEFAULT 0/,
    );
    expect(persistence).toContain("WHERE s.id=? AND s.is_deleted=0 FOR UPDATE");
    expect(persistence).toContain(
      "WHERE g.id=? AND g.direction='PAY' AND g.is_deleted=0 FOR UPDATE",
    );
    expect(persistence).toContain(
      "FROM partner_settlement x JOIN crm_counterparty c ON c.id=x.partner_id WHERE x.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_deposit x JOIN crm_counterparty c ON c.id=x.counterparty_id WHERE x.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_deposit_event e JOIN fin_deposit d ON d.id=e.deposit_id WHERE d.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM partner_settlement WHERE project_id=? AND status IN('APPROVED','PAID') AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_deposit WHERE project_id=? AND is_deleted=0",
    );
  });

  it("项目实施结项与收付款主表具备逻辑删除字段并排除已删除数据", () => {
    for (const table of [
      "prj_start",
      "prj_change",
      "prj_acceptance",
      "prj_close_application",
      "fin_payment_application",
      "fin_sales_invoice",
      "fin_receipt",
    ]) {
      expect(schema).toMatch(
        new RegExp(
          `CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?is_deleted TINYINT\\(1\\) NOT NULL DEFAULT 0`,
        ),
      );
    }

    expect(persistence).toContain(
      "FROM fin_payment_application WHERE id=? AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_payment_application x WHERE x.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM prj_start WHERE project_id=? AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM prj_change WHERE project_id=? AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM prj_acceptance WHERE project_id=? AND status='COMPLETED' AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM prj_close_application x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_sales_invoice WHERE contract_id=? AND is_reversed=0 AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_receipt WHERE project_id=? AND status='ACTIVE' AND is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_sales_invoice x WHERE x.is_reversed=0 AND x.is_deleted=0",
    );
    expect(persistence).toContain(
      "FROM fin_receipt x WHERE x.status='ACTIVE' AND x.is_deleted=0",
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

  it("tables filtered by is_deleted define the column in the empty schema", () => {
    const columnsByTable = extractTableColumns(schema);
    const filteredTables = extractTablesFilteredByIsDeleted(persistence);

    expect(filteredTables.length).toBeGreaterThan(20);
    for (const table of filteredTables) {
      expect(columnsByTable.get(table), `missing table ${table}`).toBeDefined();
      expect(
        columnsByTable.get(table),
        `missing is_deleted column on ${table}`,
      )?.toContain("is_deleted");
    }
  });

  it("insert column lists match the empty schema tables", () => {
    const columnsByTable = extractTableColumns(schema);
    const insertRefs = extractInsertColumnRefs(persistence);

    expect(insertRefs.length).toBeGreaterThan(200);
    for (const { table, column } of insertRefs) {
      expect(columnsByTable.get(table), `missing table ${table}`).toBeDefined();
      expect(
        columnsByTable.get(table),
        `missing insert column ${table}.${column}`,
      )?.toContain(column);
    }
  });

  it("single-table update column lists match the empty schema tables", () => {
    const columnsByTable = extractTableColumns(schema);
    const updateRefs = extractSingleTableUpdateColumnRefs(persistence);

    expect(updateRefs.length).toBeGreaterThan(80);
    for (const { table, column } of updateRefs) {
      expect(columnsByTable.get(table), `missing table ${table}`).toBeDefined();
      expect(
        columnsByTable.get(table),
        `missing update column ${table}.${column}`,
      )?.toContain(column);
    }
  });
});
