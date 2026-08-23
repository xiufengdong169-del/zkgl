import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { verifyInitializationData } from "./verify-initialization-data.mjs";

const defaultManifest = "docs/initialization-data.example.json";

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlStatus(enabled) {
  return enabled ? "'ENABLED'" : "'DISABLED'";
}

function sqlNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric SQL value: ${value}`);
  }
  return String(value);
}

function lineJoin(lines) {
  return lines.filter(Boolean).join("\n");
}

function valuesList(rows) {
  return rows.map((row) => `  (${row.join(", ")})`).join(",\n");
}

function generateDepartmentSql(departments) {
  const parentUpdates = departments.map((department) => {
    const parentCode = String(department.parentDepartmentCode ?? "").trim();
    if (!parentCode) {
      return `UPDATE org_department SET parent_id=NULL,version=version+1 WHERE code=${sqlString(department.code)} AND is_deleted=0;`;
    }
    return `UPDATE org_department child JOIN org_department parent ON parent.code=${sqlString(parentCode)} AND parent.is_deleted=0 SET child.parent_id=parent.id,child.version=child.version+1 WHERE child.code=${sqlString(department.code)} AND child.is_deleted=0;`;
  });
  return lineJoin([
    "-- Departments",
    "INSERT INTO org_department(code,name,status)",
    "VALUES",
    valuesList(
      departments.map((department) => [
        sqlString(department.code),
        sqlString(department.name),
        sqlStatus(department.enabled),
      ]),
    ),
    "ON DUPLICATE KEY UPDATE name=VALUES(name),status=VALUES(status),is_deleted=0,version=org_department.version+1;",
    ...parentUpdates,
  ]);
}

function generateEmployeeSql(employees) {
  const insertRows = employees.map((employee) => [
    sqlString(employee.employeeCode),
    sqlString(employee.name),
    sqlString(employee.employeeType),
    `(SELECT id FROM org_department WHERE code=${sqlString(employee.departmentCode)} AND is_deleted=0 LIMIT 1)`,
    sqlString(employee.positionName),
    sqlStatus(employee.enabled),
    "0",
    "0",
  ]);
  const supervisorUpdates = employees.map((employee) => {
    const managerCode = String(employee.managerEmployeeCode ?? "").trim();
    if (!managerCode) {
      return `UPDATE org_employee SET supervisor_id=NULL,version=version+1 WHERE employee_code=${sqlString(employee.employeeCode)} AND is_deleted=0;`;
    }
    return `UPDATE org_employee employee LEFT JOIN org_employee supervisor ON supervisor.employee_code=${sqlString(managerCode)} AND supervisor.is_deleted=0 SET employee.supervisor_id=supervisor.id,employee.version=employee.version+1 WHERE employee.employee_code=${sqlString(employee.employeeCode)} AND employee.is_deleted=0;`;
  });

  return lineJoin([
    "-- Employees",
    "INSERT INTO org_employee(employee_code,name,employee_type,department_id,position_name,account_status,created_by,updated_by)",
    "VALUES",
    valuesList(insertRows),
    "ON DUPLICATE KEY UPDATE name=VALUES(name),employee_type=VALUES(employee_type),department_id=VALUES(department_id),position_name=VALUES(position_name),account_status=VALUES(account_status),updated_by=VALUES(updated_by),is_deleted=0,version=org_employee.version+1;",
    ...supervisorUpdates,
  ]);
}

function generateUserSql(identities) {
  const statements = identities.map((identity) =>
    lineJoin([
      "INSERT INTO iam_user(cloudbase_uid,employee_id,department_id,username,status,last_synced_at)",
      `SELECT ${sqlString(identity.cloudbaseUid)},employee.id,employee.department_id,${sqlString(identity.username)},'ENABLED',NOW(3)`,
      `FROM org_employee employee WHERE employee.employee_code=${sqlString(identity.employeeCode)} AND employee.is_deleted=0`,
      "ON DUPLICATE KEY UPDATE cloudbase_uid=VALUES(cloudbase_uid),employee_id=VALUES(employee_id),department_id=VALUES(department_id),username=VALUES(username),status='ENABLED',last_synced_at=NOW(3),is_deleted=0,version=iam_user.version+1;",
    ]),
  );
  return lineJoin(["-- CloudBase UID to internal account mapping", ...statements]);
}

function generateRoleAssignmentSql(assignments) {
  const statements = assignments.map(
    (assignment) =>
      `INSERT IGNORE INTO iam_user_role(user_id,role_id) SELECT user.id,role.id FROM iam_user user JOIN org_employee employee ON employee.id=user.employee_id JOIN iam_role role ON role.code=${sqlString(assignment.roleCode)} WHERE employee.employee_code=${sqlString(assignment.employeeCode)} AND user.is_deleted=0 AND role.is_deleted=0;`,
  );
  return lineJoin(["-- User role assignments", ...statements]);
}

function generatePositionAssignmentSql(assignments) {
  const statements = assignments.map((assignment) =>
    lineJoin([
      "INSERT INTO org_position_assignment(position_id,employee_id,starts_on,ends_on,status,is_delegate,created_by)",
      `SELECT position.id,employee.id,${sqlString(assignment.effectiveFrom)},${assignment.effectiveTo ? sqlString(assignment.effectiveTo) : "NULL"},'ENABLED',${assignment.isDelegate ? "1" : "0"},0`,
      `FROM org_position position JOIN org_employee employee ON employee.employee_code=${sqlString(assignment.employeeCode)} AND employee.is_deleted=0`,
      `WHERE position.position_code=${sqlString(assignment.positionCode)} AND position.is_deleted=0`,
      "ON DUPLICATE KEY UPDATE ends_on=VALUES(ends_on),status=VALUES(status),is_delegate=VALUES(is_delegate);",
    ]),
  );
  return lineJoin(["-- Approval position assignments", ...statements]);
}

function generateThresholdSql(thresholds) {
  const statements = thresholds.map((threshold) =>
    `UPDATE wf_template_node node JOIN wf_template template ON template.id=node.template_id SET node.minimum_amount=${sqlNumber(threshold.minAmount)},node.maximum_amount=NULL,node.version=node.version+1 WHERE template.template_code=${sqlString(threshold.businessType)} AND node.position_code=${sqlString(threshold.approvalPositionCode)} AND node.is_cc=0 AND node.status='ENABLED';`,
  );
  return lineJoin(["-- Approval amount thresholds", ...statements]);
}

function generateNumberRuleSql(rules) {
  return lineJoin([
    "-- Number rules",
    "INSERT INTO sys_number_rule(rule_code,prefix,year_pattern,next_serial,current_year,status,updated_by)",
    "VALUES",
    valuesList(
      rules.map((rule) => [
        sqlString(rule.ruleCode),
        sqlString(rule.prefix),
        sqlString(rule.yearPattern),
        sqlNumber(rule.nextSerial),
        "YEAR(CURRENT_DATE)",
        "'ENABLED'",
        "0",
      ]),
    ),
    "ON DUPLICATE KEY UPDATE prefix=VALUES(prefix),year_pattern=VALUES(year_pattern),next_serial=VALUES(next_serial),current_year=VALUES(current_year),status='ENABLED',updated_by=0,version=sys_number_rule.version+1;",
  ]);
}

function parameterType(value) {
  if (/^-?\d+(?:\.\d+)?$/.test(String(value))) return "NUMBER";
  if (/^(?:true|false)$/i.test(String(value))) return "BOOLEAN";
  if (/^[\[{]/.test(String(value).trim())) return "JSON";
  return "STRING";
}

function generateSystemParameterSql(parameters) {
  return lineJoin([
    "-- System parameters",
    "INSERT INTO sys_parameter(param_key,name,param_value,value_type,description,created_by,updated_by)",
    "VALUES",
    valuesList(
      parameters.map((parameter) => [
        sqlString(parameter.paramKey),
        sqlString(parameter.paramKey),
        sqlString(parameter.paramValue),
        sqlString(parameterType(parameter.paramValue)),
        sqlString("Initialized from zkgl initialization manifest"),
        "0",
        "0",
      ]),
    ),
    "ON DUPLICATE KEY UPDATE param_value=VALUES(param_value),value_type=VALUES(value_type),status='ENABLED',updated_by=0,version=sys_parameter.version+1;",
  ]);
}

export function generateInitializationSql(manifest) {
  verifyInitializationData(manifest);
  return `${lineJoin([
    "-- Generated by scripts/generate-initialization-sql.mjs",
    "-- Run only after database/init/schema.sql has initialized an empty zkgl database.",
    "-- Business passwords are intentionally excluded; CloudBase initial passwords are set outside the business database.",
    "SET NAMES utf8mb4;",
    "START TRANSACTION;",
    generateDepartmentSql(manifest.departments),
    generateEmployeeSql(manifest.employees),
    generateUserSql(manifest.cloudbaseIdentities),
    generateRoleAssignmentSql(manifest.roleAssignments),
    generatePositionAssignmentSql(manifest.approvalPositionAssignments),
    generateThresholdSql(manifest.approvalAmountThresholds),
    generateNumberRuleSql(manifest.numberRules),
    generateSystemParameterSql(manifest.systemParameters),
    "COMMIT;",
  ])}\n`;
}

export function generateInitializationSqlFile({
  manifestFile = defaultManifest,
  readFile = readFileSync,
} = {}) {
  const manifest = JSON.parse(readFile(manifestFile, "utf8"));
  return generateInitializationSql(manifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(
    generateInitializationSqlFile({
      manifestFile: process.argv[2] || defaultManifest,
    }),
  );
}
