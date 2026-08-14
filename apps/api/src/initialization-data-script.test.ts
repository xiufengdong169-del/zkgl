import { describe, expect, it } from "vitest";

type InitializationManifest = Record<string, unknown>;

type InitializationDataModule = {
  verifyInitializationData(manifest: InitializationManifest): string;
};

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
      { roleCode: "BUSINESS", roleName: "经营人员" },
      { roleCode: "PROJECT_MANAGER", roleName: "项目经理" },
      { roleCode: "PROJECT_MEMBER", roleName: "项目成员" },
      { roleCode: "BIDDER", roleName: "投标方" },
      { roleCode: "FINANCE", roleName: "财务资金" },
      { roleCode: "EMPLOYEE", roleName: "普通员工" },
    ],
    roleAssignments: [
      { employeeCode: "E-ADMIN", roleCode: "ADMIN" },
      { employeeCode: "E-CEO", roleCode: "COMPANY_PRINCIPAL" },
      { employeeCode: "E-BIZ", roleCode: "BUSINESS" },
      { employeeCode: "E-PM", roleCode: "PROJECT_MANAGER" },
      { employeeCode: "E-MEMBER", roleCode: "PROJECT_MEMBER" },
      { employeeCode: "E-BID", roleCode: "BIDDER" },
      { employeeCode: "E-FIN", roleCode: "FINANCE" },
      { employeeCode: "E-NONE", roleCode: "EMPLOYEE" },
    ],
    approvalPositionAssignments: [
      { positionCode: "BUSINESS_OWNER", employeeCode: "E-BIZ", effectiveFrom: "2026-08-14" },
      { positionCode: "COMPANY_PRINCIPAL", employeeCode: "E-CEO", effectiveFrom: "2026-08-14" },
      { positionCode: "FINANCE_REVIEWER", employeeCode: "E-FIN", effectiveFrom: "2026-08-14" },
      { positionCode: "PROJECT_MANAGER", employeeCode: "E-PM", effectiveFrom: "2026-08-14" },
    ],
    approvalAmountThresholds: [
      "CONTRACT",
      "CONTRACT_CHANGE",
      "INVOICE",
      "PAYMENT",
      "PARTNER_SETTLEMENT",
      "DEPOSIT",
      "PROJECT_START",
      "PROJECT_CHANGE",
      "PROJECT_ACCEPTANCE",
      "PROJECT_CLOSE",
    ].map((businessType) => ({
      businessType,
      minAmount: 0,
      currency: "CNY",
      approvalPositionCode: "COMPANY_PRINCIPAL",
    })),
    numberRules: [
      "LEAD",
      "PROJECT",
      "CONTRACT",
      "BID",
      "PAYMENT",
      "SETTLEMENT",
      "DEPOSIT",
      "CLOSE",
      "EXPORT",
    ].map((ruleCode) => ({
      ruleCode,
      prefix: `${ruleCode}-`,
      yearPattern: "yyyy",
      nextSerial: 1,
    })),
    systemParameters: [
      { paramKey: "reminder.contract_expire_days", paramValue: "30" },
      { paramKey: "reminder.bid_deadline_days", paramValue: "3" },
      { paramKey: "export.retention_days", paramValue: "7" },
      { paramKey: "export.sync_threshold_rows", paramValue: "1000" },
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
