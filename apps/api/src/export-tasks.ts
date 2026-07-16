import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";

interface ExportTaskRow extends RowDataPacket {
  id: number;
  taskCode: string;
  requesterId: string;
  permissionSnapshot: string | object;
}

interface ProjectExportRow extends RowDataPacket {
  projectCode: string;
  projectName: string;
  customerName: string;
  status: string;
  estimatedRevenue: string;
  estimatedCost: string;
  confirmedIncome: string;
  receivedAmount: string;
}

export interface ProcessExportDependencies {
  uploadFile(cloudPath: string, fileContent: Buffer): Promise<string>;
}

function parseRetentionDays(value: unknown, fallback = 7) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) return fallback;
  return parsed;
}

async function loadExportRetentionDays(connection: Pick<PoolConnection, "execute">) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT param_value paramValue FROM sys_parameter WHERE param_key='export.retention_days' AND status='ENABLED' AND is_deleted=0 LIMIT 1`,
  );
  return parseRetentionDays(rows[0]?.paramValue);
}

function parseJsonObject(value: string | object): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function scopedIds(scopes: unknown[], type: string, field: "projectIds" | "departmentIds"): string[] {
  return scopes.flatMap((scope) => {
    if (typeof scope !== "object" || scope === null) return [];
    const record = scope as Record<string, unknown>;
    if (record.type !== type || !Array.isArray(record[field])) return [];
    return record[field].map(String).filter(Boolean);
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildProjectExportCsv(rows: ProjectExportRow[], disclaimer: string): Buffer {
  const headers: Array<[keyof ProjectExportRow, string]> = [
    ["projectCode", "\u9879\u76ee\u7f16\u53f7"],
    ["projectName", "\u9879\u76ee\u540d\u79f0"],
    ["customerName", "\u5ba2\u6237"],
    ["status", "\u72b6\u6001"],
    ["estimatedRevenue", "\u9884\u8ba1\u6536\u5165"],
    ["estimatedCost", "\u9884\u8ba1\u6210\u672c"],
    ["confirmedIncome", "\u5df2\u786e\u8ba4\u5408\u540c\u6536\u5165"],
    ["receivedAmount", "\u5df2\u6536\u6b3e"],
  ];
  const csv = [
    "\uFEFF" + headers.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) => headers.map(([key]) => csvCell(row[key])).join(",")),
    csvCell(disclaimer),
  ].join("\r\n");
  return Buffer.from(csv, "utf8");
}

export async function processPendingProjectExportTasks(
  connection: PoolConnection,
  dependencies: ProcessExportDependencies,
  limit = 1,
) {
  const [tasks] = await connection.execute<ExportTaskRow[]>(
    `SELECT id,task_code taskCode,CAST(requester_id AS CHAR) requesterId,permission_snapshot permissionSnapshot
       FROM sys_export_task
      WHERE status='PENDING' AND export_type='PROJECT_OPERATING'
      ORDER BY created_at
      LIMIT ? FOR UPDATE`,
    [limit],
  );
  let completed = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      await connection.execute(
        `UPDATE sys_export_task SET status='RUNNING',started_at=NOW(3) WHERE id=? AND status='PENDING'`,
        [task.id],
      );
      const snapshot = parseJsonObject(task.permissionSnapshot);
      const permissionCodes = Array.isArray(snapshot.permissionCodes)
        ? snapshot.permissionCodes.map(String)
        : [];
      if (!permissionCodes.includes("project.export"))
        throw new Error("EXPORT_PERMISSION_SNAPSHOT_INVALID");
      const employeeId = String(snapshot.employeeId ?? "");
      const scopes = Array.isArray(snapshot.dataScopes) ? snapshot.dataScopes : [];
      const all = scopes.some(
        (scope) => typeof scope === "object" && scope !== null && (scope as { type?: unknown }).type === "ALL",
      );
      const projectIds = scopedIds(scopes, "PROJECT", "projectIds");
      const departmentIds = scopedIds(scopes, "DEPARTMENT", "departmentIds");
      const temporaryProjectIds = Array.isArray(snapshot.temporaryProjectIds)
        ? snapshot.temporaryProjectIds.map(String).filter(Boolean)
        : [];
      const projectScope = projectIds.length
        ? `p.id IN (${projectIds.map(() => "?").join(",")})`
        : "0=1";
      const departmentScope = departmentIds.length
        ? `pm.department_id IN (${departmentIds.map(() => "?").join(",")})`
        : "0=1";
      const temporaryProjectScope = temporaryProjectIds.length
        ? `p.id IN (${temporaryProjectIds.map(() => "?").join(",")})`
        : "0=1";
      const [rows] = await connection.execute<ProjectExportRow[]>(
        `SELECT p.project_code projectCode,p.project_name projectName,c.name customerName,p.status,p.estimated_revenue estimatedRevenue,p.estimated_cost estimatedCost,(SELECT COALESCE(SUM(x.tax_exclusive_amount),0) FROM con_contract x WHERE x.project_id=p.id AND x.contract_type='INCOME' AND x.amount_status='CONFIRMED' AND x.is_deleted=0) confirmedIncome,(SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE') receivedAmount
           FROM prj_project p
           JOIN crm_counterparty c ON c.id=p.customer_id
           JOIN org_employee pm ON pm.id=p.project_manager_id
          WHERE p.is_deleted=0 AND (?=1 OR p.project_manager_id=? OR EXISTS(SELECT 1 FROM prj_project_member m WHERE m.project_id=p.id AND m.employee_id=? AND m.status='ACTIVE') OR ${projectScope} OR ${departmentScope} OR ${temporaryProjectScope})
          ORDER BY p.id DESC`,
        [
          all ? 1 : 0,
          employeeId,
          employeeId,
          ...projectIds,
          ...departmentIds,
          ...temporaryProjectIds,
        ],
      );
      const buffer = buildProjectExportCsv(rows, "\u5185\u90e8\u9879\u76ee\u7ecf\u8425\u53e3\u5f84\uff0c\u4e0d\u5c5e\u4e8e\u4f1a\u8ba1\u5229\u6da6");
      const cloudPath = `exports/${task.taskCode}.csv`;
      const storageKey = await dependencies.uploadFile(cloudPath, buffer);
      const hash = createHash("sha256").update(buffer).digest("hex");
      const [file] = await connection.execute<ResultSetHeader>(
        `INSERT INTO file_object(business_type,business_id,project_id,logical_name,classification,status,created_by,updated_by) VALUES('EXPORT_TASK',?,NULL,?,'INTERNAL','ACTIVE',?,?)`,
        [task.id, `${task.taskCode}.csv`, task.requesterId, task.requesterId],
      );
      await connection.execute(
        `INSERT INTO file_version(file_id,version_number,storage_key,original_name,extension,mime_type,size_bytes,sha256,uploaded_by,status) VALUES(?,1,?,?,?,?,?,?,?,'ACTIVE')`,
        [
          file.insertId,
          storageKey,
          `${task.taskCode}.csv`,
          "csv",
          "text/csv;charset=utf-8",
          buffer.byteLength,
          hash,
          task.requesterId,
        ],
      );
      const retentionDays = await loadExportRetentionDays(connection);
      await connection.execute(
        `UPDATE sys_export_task SET status='COMPLETED',file_id=?,completed_at=NOW(3),expires_at=DATE_ADD(NOW(3),INTERVAL ${retentionDays} DAY) WHERE id=?`,
        [file.insertId, task.id],
      );
      completed += 1;
    } catch (error) {
      failed += 1;
      await connection.execute(
        `UPDATE sys_export_task SET status='FAILED',failure_reason=?,completed_at=NOW(3) WHERE id=?`,
        [error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN_EXPORT_ERROR", task.id],
      );
    }
  }
  return { processed: tasks.length, completed, failed };
}
