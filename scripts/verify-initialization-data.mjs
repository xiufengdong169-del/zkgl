import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const defaultManifest = "docs/initialization-data.example.json";

const requiredRoleCodes = [
  "ADMIN",
  "COMPANY_PRINCIPAL",
  "BUSINESS",
  "PROJECT_MANAGER",
  "PROJECT_MEMBER",
  "BIDDER",
  "FINANCE",
  "EMPLOYEE",
];
const requiredDemoAccountPurposes = [
  "ADMIN",
  "COMPANY_PRINCIPAL",
  "PROJECT_MANAGER",
  "FINANCE",
  "PROJECT_MEMBER",
  "UNAUTHORIZED_USER",
];
const requiredApprovalPositionCodes = [
  "BUSINESS_OWNER",
  "COMPANY_PRINCIPAL",
  "FINANCE_REVIEWER",
  "PROJECT_MANAGER",
];
const requiredApprovalThresholdTemplates = [
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
];
const requiredNumberRuleCodes = [
  "LEAD",
  "PROJECT",
  "CONTRACT",
  "BID",
  "PAYMENT",
  "SETTLEMENT",
  "DEPOSIT",
  "CLOSE",
  "EXPORT",
];
const requiredSystemParameters = [
  "reminder.contract_expire_days",
  "reminder.bid_deadline_days",
  "export.retention_days",
  "export.sync_threshold_rows",
];

const fail = (message) => {
  throw new Error(`Initialization data verification failed: ${message}`);
};

function requireArray(manifest, key) {
  const value = manifest?.[key];
  if (!Array.isArray(value) || value.length === 0) fail(`${key} must be a non-empty array`);
  return value;
}

function requireString(record, key, context) {
  const value = String(record?.[key] ?? "").trim();
  if (!value) fail(`${context} missing ${key}`);
  return value;
}

function ensureUnique(records, key, context) {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const value = requireString(record, key, `${context}[${index}]`);
    if (seen.has(value)) fail(`${context}.${key} must be unique: ${value}`);
    seen.add(value);
  }
  return seen;
}

function ensureIncludesAll(actualSet, requiredValues, context) {
  for (const value of requiredValues) {
    if (!actualSet.has(value)) fail(`${context} missing ${value}`);
  }
}

function ensureEmployeeExists(employeeCodes, employeeCode, context) {
  if (!employeeCodes.has(employeeCode)) fail(`${context} references unknown employee ${employeeCode}`);
}

function ensureRoleExists(roleCodes, roleCode, context) {
  if (!roleCodes.has(roleCode)) fail(`${context} references unknown role ${roleCode}`);
}

function requireBoolean(value, context) {
  if (typeof value !== "boolean") fail(`${context} must be boolean`);
}

function requireNonNegativeNumber(value, context) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${context} must be a non-negative number`);
  }
}

export function verifyInitializationData(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be a JSON object");
  }
  if (manifest.schemaVersion !== "zkgl-initialization-data.v1") {
    fail("schemaVersion must be zkgl-initialization-data.v1");
  }
  if (manifest.passwordsIncluded !== false) {
    fail("passwordsIncluded must be false");
  }

  const departments = requireArray(manifest, "departments");
  const employees = requireArray(manifest, "employees");
  const cloudbaseIdentities = requireArray(manifest, "cloudbaseIdentities");
  const roles = requireArray(manifest, "roles");
  const roleAssignments = requireArray(manifest, "roleAssignments");
  const approvalPositionAssignments = requireArray(
    manifest,
    "approvalPositionAssignments",
  );
  const approvalAmountThresholds = requireArray(
    manifest,
    "approvalAmountThresholds",
  );
  const numberRules = requireArray(manifest, "numberRules");
  const systemParameters = requireArray(manifest, "systemParameters");
  const demoAccounts = requireArray(manifest, "demoAccounts");

  const departmentCodes = ensureUnique(departments, "code", "departments");
  for (const [index, department] of departments.entries()) {
    requireString(department, "name", `departments[${index}]`);
    requireBoolean(department.enabled, `departments[${index}].enabled`);
  }

  const employeeCodes = ensureUnique(employees, "employeeCode", "employees");
  for (const [index, employee] of employees.entries()) {
    const context = `employees[${index}]`;
    requireString(employee, "name", context);
    requireString(employee, "employeeType", context);
    const departmentCode = requireString(employee, "departmentCode", context);
    if (!departmentCodes.has(departmentCode)) {
      fail(`${context} references unknown department ${departmentCode}`);
    }
    requireString(employee, "positionName", context);
    requireBoolean(employee.enabled, `${context}.enabled`);
  }

  const identityEmployeeCodes = new Set();
  const cloudbaseUids = new Set();
  for (const [index, identity] of cloudbaseIdentities.entries()) {
    const context = `cloudbaseIdentities[${index}]`;
    const employeeCode = requireString(identity, "employeeCode", context);
    ensureEmployeeExists(employeeCodes, employeeCode, context);
    const uid = requireString(identity, "cloudbaseUid", context);
    if (cloudbaseUids.has(uid)) fail(`cloudbaseUid must be unique: ${uid}`);
    cloudbaseUids.add(uid);
    if (identityEmployeeCodes.has(employeeCode)) {
      fail(`employeeCode must have only one CloudBase identity: ${employeeCode}`);
    }
    identityEmployeeCodes.add(employeeCode);
    requireString(identity, "username", context);
    requireString(identity, "initialPasswordDelivery", context);
    if ("password" in identity || "initialPassword" in identity) {
      fail(`${context} must not include password fields`);
    }
  }

  const roleCodes = ensureUnique(roles, "roleCode", "roles");
  ensureIncludesAll(roleCodes, requiredRoleCodes, "roles");
  for (const [index, role] of roles.entries()) {
    requireString(role, "roleName", `roles[${index}]`);
  }

  const assignedRoleCodes = new Set();
  const assignedEmployeesByRole = new Map();
  for (const [index, assignment] of roleAssignments.entries()) {
    const context = `roleAssignments[${index}]`;
    const employeeCode = requireString(assignment, "employeeCode", context);
    const roleCode = requireString(assignment, "roleCode", context);
    ensureEmployeeExists(employeeCodes, employeeCode, context);
    ensureRoleExists(roleCodes, roleCode, context);
    assignedRoleCodes.add(roleCode);
    const employeesForRole = assignedEmployeesByRole.get(roleCode) ?? new Set();
    employeesForRole.add(employeeCode);
    assignedEmployeesByRole.set(roleCode, employeesForRole);
  }
  for (const roleCode of ["ADMIN", "COMPANY_PRINCIPAL", "PROJECT_MANAGER", "FINANCE"]) {
    if (!assignedRoleCodes.has(roleCode)) fail(`roleAssignments missing ${roleCode}`);
  }

  const assignedPositionCodes = new Set();
  for (const [index, assignment] of approvalPositionAssignments.entries()) {
    const context = `approvalPositionAssignments[${index}]`;
    const employeeCode = requireString(assignment, "employeeCode", context);
    ensureEmployeeExists(employeeCodes, employeeCode, context);
    const positionCode = requireString(assignment, "positionCode", context);
    assignedPositionCodes.add(positionCode);
    requireString(assignment, "effectiveFrom", context);
  }
  ensureIncludesAll(
    assignedPositionCodes,
    requiredApprovalPositionCodes,
    "approvalPositionAssignments",
  );

  const thresholdTemplates = new Set();
  for (const [index, threshold] of approvalAmountThresholds.entries()) {
    const context = `approvalAmountThresholds[${index}]`;
    const businessType = requireString(threshold, "businessType", context);
    thresholdTemplates.add(businessType);
    requireNonNegativeNumber(threshold.minAmount, `${context}.minAmount`);
    requireString(threshold, "currency", context);
    requireString(threshold, "approvalPositionCode", context);
  }
  ensureIncludesAll(
    thresholdTemplates,
    requiredApprovalThresholdTemplates,
    "approvalAmountThresholds",
  );

  const numberRuleCodes = ensureUnique(numberRules, "ruleCode", "numberRules");
  ensureIncludesAll(numberRuleCodes, requiredNumberRuleCodes, "numberRules");
  for (const [index, rule] of numberRules.entries()) {
    const context = `numberRules[${index}]`;
    requireString(rule, "prefix", context);
    requireString(rule, "yearPattern", context);
    if (!Number.isInteger(rule.nextSerial) || rule.nextSerial < 1) {
      fail(`${context}.nextSerial must be a positive integer`);
    }
  }

  const systemParameterKeys = ensureUnique(
    systemParameters,
    "paramKey",
    "systemParameters",
  );
  ensureIncludesAll(
    systemParameterKeys,
    requiredSystemParameters,
    "systemParameters",
  );
  for (const [index, parameter] of systemParameters.entries()) {
    requireString(parameter, "paramValue", `systemParameters[${index}]`);
  }

  const demoPurposes = new Set();
  for (const [index, account] of demoAccounts.entries()) {
    const context = `demoAccounts[${index}]`;
    const employeeCode = requireString(account, "employeeCode", context);
    ensureEmployeeExists(employeeCodes, employeeCode, context);
    const purpose = requireString(account, "purpose", context);
    demoPurposes.add(purpose);
  }
  ensureIncludesAll(
    demoPurposes,
    requiredDemoAccountPurposes,
    "demoAccounts",
  );

  return "Initialization data verified";
}

export function verifyInitializationDataFile({
  manifestFile = defaultManifest,
  readFile = readFileSync,
} = {}) {
  const manifest = JSON.parse(readFile(manifestFile, "utf8"));
  return verifyInitializationData(manifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    verifyInitializationDataFile({
      manifestFile: process.argv[2] || defaultManifest,
    }),
  );
}
