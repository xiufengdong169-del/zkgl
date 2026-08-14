import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync(
  new URL("../../../database/init/schema.sql", import.meta.url),
  "utf8",
);
const initializationExample = JSON.parse(
  readFileSync(
    new URL("../../../docs/initialization-data.example.json", import.meta.url),
    "utf8",
  ),
) as {
  roles: Array<{ roleCode: string }>;
  roleAssignments: Array<{ roleCode: string }>;
  approvalAmountThresholds: Array<{ businessType: string }>;
  systemParameters: Array<{ paramKey: string }>;
  numberRules: Array<{ ruleCode: string }>;
};

type InitializationManifest = Record<string, unknown>;

type InitializationDataModule = {
  verifyInitializationData(manifest: InitializationManifest): string;
};

const extractSeededCodes = (source: string, pattern: RegExp, group = 1) =>
  [...new Set([...source.matchAll(pattern)].map((match) => match[group]!))].sort();

async function loadInitializationDataModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-initialization-data.mjs")) as InitializationDataModule;
}

function makeValidManifest(): InitializationManifest {
  return {
    schemaVersion: "zkgl-initialization-data.v1",
    passwordsIncluded: false,
    departments: [
      { code: "D-ADMIN", name: "综合管理部", enabled: true },
      { code: "D-BIZ", name: "经营管理部", enabled: true },
      { code: "D-PROJECT", name: "项目管理部", enabled: true },
      { code: "D-FIN", name: "财务资金部", enabled: true },
    ],
    employees: [
      {
        employeeCode: "E-ADMIN",
        name: "系统管理员",
        employeeType: "INTERNAL",
        departmentCode: "D-ADMIN",
        positionName: "系统管理员",
        enabled: true,
      },
      {
        employeeCode: "E-CEO",
        name: "公司负责人",
        employeeType: "INTERNAL",
        departmentCode: "D-ADMIN",
        positionName: "公司负责人",
        enabled: true,
      },
      {
        employeeCode: "E-BIZ",
        name: "经营负责人",
        employeeType: "INTERNAL",
        departmentCode: "D-BIZ",
        positionName: "经营负责人",
        enabled: true,
      },
      {
        employeeCode: "E-PM",
        name: "项目经理",
        employeeType: "INTERNAL",
        departmentCode: "D-PROJECT",
        positionName: "项目经理",
        enabled: true,
      },
      {
        employeeCode: "E-MEMBER",
        name: "项目成员",
        employeeType: "INTERNAL",
        departmentCode: "D-PROJECT",
        positionName: "项目成员",
        enabled: true,
      },
      {
        employeeCode: "E-BID",
        name: "外部投标方",
        employeeType: "EXTERNAL",
        departmentCode: "D-BIZ",
        positionName: "投标联系人",
        enabled: true,
      },
      {
        employeeCode: "E-FIN",
        name: "财务资金",
        employeeType: "INTERNAL",
        departmentCode: "D-FIN",
        positionName: "财务负责人",
        enabled: true,
      },
      {
        employeeCode: "E-NONE",
        name: "无权限演示用户",
        employeeType: "INTERNAL",
        departmentCode: "D-ADMIN",
        positionName: "观察用户",
        enabled: true,
      },
    ],
    cloudbaseIdentities: [
      {
        employeeCode: "E-ADMIN",
        cloudbaseUid: "uid-admin",
        username: "admin@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-CEO",
        cloudbaseUid: "uid-ceo",
        username: "ceo@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-BIZ",
        cloudbaseUid: "uid-biz",
        username: "biz@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-PM",
        cloudbaseUid: "uid-pm",
        username: "pm@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-MEMBER",
        cloudbaseUid: "uid-member",
        username: "member@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-BID",
        cloudbaseUid: "uid-bid",
        username: "bid@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-FIN",
        cloudbaseUid: "uid-fin",
        username: "fin@example.test",
        initialPasswordDelivery: "offline",
      },
      {
        employeeCode: "E-NONE",
        cloudbaseUid: "uid-none",
        username: "none@example.test",
        initialPasswordDelivery: "offline",
      },
    ],
    roles: [
      { roleCode: "ADMIN", roleName: "系统管理员" },
      { roleCode: "COMPANY_PRINCIPAL", roleName: "公司负责人" },
      { roleCode: "MARKET_BUSINESS", roleName: "经营人员" },
      { roleCode: "PROJECT_MANAGER", roleName: "项目经理" },
      { roleCode: "PROJECT_MEMBER", roleName: "项目成员" },
      { roleCode: "BID_STAFF", roleName: "投标方" },
      { roleCode: "FINANCE", roleName: "财务资金" },
      { roleCode: "EMPLOYEE", roleName: "普通员工" },
    ],
    roleAssignments: [
      { employeeCode: "E-ADMIN", roleCode: "ADMIN" },
      { employeeCode: "E-CEO", roleCode: "COMPANY_PRINCIPAL" },
      { employeeCode: "E-BIZ", roleCode: "MARKET_BUSINESS" },
      { employeeCode: "E-PM", roleCode: "PROJECT_MANAGER" },
      { employeeCode: "E-MEMBER", roleCode: "PROJECT_MEMBER" },
      { employeeCode: "E-BID", roleCode: "BID_STAFF" },
      { employeeCode: "E-FIN", roleCode: "FINANCE" },
      { employeeCode: "E-NONE", roleCode: "EMPLOYEE" },
    ],
    approvalPositionAssignments: [
      { positionCode: "BUSINESS_OWNER", employeeCode: "E-BIZ", effectiveFrom: "2026-08-14" },
      { positionCode: "COMPANY_PRINCIPAL", employeeCode: "E-CEO", effectiveFrom: "2026-08-14" },
      { positionCode: "FINANCE_REVIEWER", employeeCode: "E-FIN", effectiveFrom: "2026-08-14" },
      { positionCode: "PROJECT_MANAGER", employeeCode: "E-PM", effectiveFrom: "2026-08-14" },
      { positionCode: "AUTHORIZED_MANAGER", employeeCode: "E-CEO", effectiveFrom: "2026-08-14" },
      { positionCode: "OPERATIONS_MANAGER", employeeCode: "E-BIZ", effectiveFrom: "2026-08-14" },
    ],
    approvalAmountThresholds: [
      "MARKET_REGISTRATION",
      "PROJECT_ESTABLISHMENT",
      "BID_APPLICATION",
      "CONTRACT_APPROVAL",
      "CONTRACT_CHANGE",
      "PROJECT_START",
      "PROJECT_CHANGE",
      "PROJECT_ACCEPTANCE",
      "INVOICE_APPLICATION",
      "EXPENSE_REIMBURSEMENT",
      "PROJECT_PAYMENT",
      "PARTNER_SETTLEMENT",
      "DEPOSIT_PAYMENT",
      "DEPOSIT_LOSS",
      "DAILY_PURCHASE",
      "PROJECT_CLOSE",
    ].map((businessType) => ({
      businessType,
      minAmount: 0,
      currency: "CNY",
      approvalPositionCode: "COMPANY_PRINCIPAL",
    })),
    numberRules: [
      "PROJECT_APPLICATION",
      "PROJECT",
      "COUNTERPARTY",
      "LEAD",
      "VISIT",
      "BID",
      "CONTRACT",
      "CONTRACT_CHANGE",
      "INVOICE_APPLICATION",
      "RECEIPT",
      "REIMBURSEMENT",
      "PAYMENT",
      "EXPORT_TASK",
      "PARTNER_PLAN",
      "PARTNER_SETTLEMENT",
      "DEPOSIT",
      "DAILY_PURCHASE",
      "PROJECT_CLOSE",
    ].map((ruleCode) => ({
      ruleCode,
      prefix: `${ruleCode}-`,
      yearPattern: "yyyy",
      nextSerial: 1,
    })),
    systemParameters: [
      { paramKey: "reminder.contract_expiry_days", paramValue: "30" },
      { paramKey: "reminder.bid_deadline_days", paramValue: "3" },
      { paramKey: "export.retention_days", paramValue: "7" },
      { paramKey: "approval.amount_unit", paramValue: "CNY" },
    ],
    demoAccounts: [
      { purpose: "ADMIN", employeeCode: "E-ADMIN" },
      { purpose: "COMPANY_PRINCIPAL", employeeCode: "E-CEO" },
      { purpose: "PROJECT_MANAGER", employeeCode: "E-PM" },
      { purpose: "FINANCE", employeeCode: "E-FIN" },
      { purpose: "PROJECT_MEMBER", employeeCode: "E-MEMBER" },
      { purpose: "UNAUTHORIZED_USER", employeeCode: "E-NONE" },
    ],
  };
}

describe("initialization data verifier script", () => {
  it("accepts the complete V2.2 launch initialization manifest", async () => {
    const { verifyInitializationData } = await loadInitializationDataModule();

    expect(verifyInitializationData(makeValidManifest())).toBe(
      "Initialization data verified",
    );
  });

  it("keeps the example manifest aligned with empty-database seed codes", () => {
    const seededRoleCodes = extractSeededCodes(
      schema,
      /(?:\(|,)\s*'([A-Z_]+)'\s*,\s*'[^']*'\s*,\s*'ENABLED'\s*,NOW\(3\),NOW\(3\)/g,
    );
    const seededParameterKeys = extractSeededCodes(
      schema,
      /\('([a-z]+\.[a-z0-9_.]+)',/g,
    );
    const seededNumberRuleCodes = extractSeededCodes(
      schema,
      /\('([A-Z_]+)',\s*'[^']+',\s*YEAR\(CURRENT_DATE\),\s*0\)/g,
    );
    const seededApprovalBusinessTypes = extractSeededCodes(
      schema,
      /\('([^']+)',\s*'[^']+',\s*'([A-Z_]+)',\s*0,\s*0\)/g,
    );

    expect(seededRoleCodes).toEqual([
      "ADMIN",
      "BID_STAFF",
      "COMPANY_PRINCIPAL",
      "EMPLOYEE",
      "FINANCE",
      "MARKET_BUSINESS",
      "PROJECT_MANAGER",
      "PROJECT_MEMBER",
    ]);
    for (const role of initializationExample.roles) {
      expect(seededRoleCodes, `manifest role ${role.roleCode} is not seeded`).toContain(
        role.roleCode,
      );
    }
    for (const assignment of initializationExample.roleAssignments) {
      expect(
        seededRoleCodes,
        `manifest assignment role ${assignment.roleCode} is not seeded`,
      ).toContain(assignment.roleCode);
    }
    for (const parameter of initializationExample.systemParameters) {
      expect(
        seededParameterKeys,
        `manifest parameter ${parameter.paramKey} is not seeded`,
      ).toContain(parameter.paramKey);
    }
    for (const threshold of initializationExample.approvalAmountThresholds) {
      expect(
        seededApprovalBusinessTypes,
        `manifest approval business ${threshold.businessType} is not seeded`,
      ).toContain(threshold.businessType);
    }
    for (const rule of initializationExample.numberRules) {
      expect(
        seededNumberRuleCodes,
        `manifest number rule ${rule.ruleCode} is not seeded`,
      ).toContain(rule.ruleCode);
    }
  });

  it("rejects plaintext password fields in account initialization data", async () => {
    const { verifyInitializationData } = await loadInitializationDataModule();
    const manifest = makeValidManifest();
    const identities = manifest.cloudbaseIdentities as Array<Record<string, unknown>>;
    identities[0]!.initialPassword = "please-change-me";

    expect(() => verifyInitializationData(manifest)).toThrow(
      "must not include password fields",
    );
  });

  it("rejects missing required demo account coverage", async () => {
    const { verifyInitializationData } = await loadInitializationDataModule();
    const manifest = makeValidManifest();
    manifest.demoAccounts = (manifest.demoAccounts as Array<Record<string, unknown>>)
      .filter((account) => account.purpose !== "UNAUTHORIZED_USER");

    expect(() => verifyInitializationData(manifest)).toThrow(
      "demoAccounts missing UNAUTHORIZED_USER",
    );
  });

  it("rejects references to departments that are not in the initialization list", async () => {
    const { verifyInitializationData } = await loadInitializationDataModule();
    const manifest = makeValidManifest();
    const employees = manifest.employees as Array<Record<string, unknown>>;
    employees[0]!.departmentCode = "D-MISSING";

    expect(() => verifyInitializationData(manifest)).toThrow(
      "references unknown department D-MISSING",
    );
  });
});
