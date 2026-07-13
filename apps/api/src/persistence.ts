import type { SessionUser } from "@zkgl/shared";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { createHash } from "node:crypto";

import { AppError } from "./errors.js";
import { withTransaction } from "./database.js";
import { calculateSettlement, validateProjectClose } from "./settlements.js";
import { transitionRisk, transitionStage } from "./delivery.js";
import { transitionBid } from "./bids.js";
import { transitionLead } from "./leads.js";
import {
  buildPrivateStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  extractSafeExtension,
  validateUpload,
} from "./files.js";

const toCents = (value: unknown) =>
  BigInt(Math.round(Number(value ?? 0) * 100));
const fromCents = (value: bigint) => (Number(value) / 100).toFixed(2);

interface NumberRow extends RowDataPacket {
  id: number;
  prefix: string;
  serial_length: number;
  next_serial: number;
  current_year: number;
  version: number;
}
interface ApprovalTaskRow extends RowDataPacket {
  task_id: string;
  instance_id: string;
  node_order: number;
  assignee_id: string;
  task_status: string;
  instance_status: string;
  current_node_order: number;
  applicant_id: string;
  configuration_snapshot: string | object;
  business_type: string;
  business_id: string;
}
async function allocateNumber(
  connection: PoolConnection,
  ruleCode: string,
): Promise<string> {
  const [rows] = await connection.execute<NumberRow[]>(
    "SELECT * FROM sys_number_rule WHERE rule_code=? AND status='ENABLED' FOR UPDATE",
    [ruleCode],
  );
  const row = rows[0];
  if (!row)
    throw new AppError(
      "NUMBER_RULE_NOT_FOUND",
      `编号规则不存在：${ruleCode}`,
      500,
    );
  const year = new Date().getFullYear();
  const serial = row.current_year === year ? row.next_serial : 1;
  await connection.execute(
    "UPDATE sys_number_rule SET current_year=?,next_serial=?,version=version+1 WHERE id=? AND version=?",
    [year, serial + 1, row.id, row.version],
  );
  return `${row.prefix}-${year}-${String(serial).padStart(row.serial_length, "0")}`;
}

async function applyBusinessApprovalResult(
  connection: PoolConnection,
  businessType: string,
  businessId: string,
  status: "APPROVED" | "RETURNED" | "REJECTED" | "WITHDRAWN",
  actorUserId: string,
) {
  const map: Record<
    string,
    { table: string; column: string; approved: string }
  > = {
    PROJECT_APPLICATION: {
      table: "prj_project_application",
      column: "status",
      approved: "APPROVED",
    },
    LEAD: { table: "mkt_lead", column: "status", approved: "FOLLOWING" },
    BID_APPLICATION: {
      table: "bid_application",
      column: "status",
      approved: "PREPARING",
    },
    CONTRACT: {
      table: "con_contract",
      column: "status",
      approved: "PENDING_SIGNATURE",
    },
    CONTRACT_CHANGE: {
      table: "con_contract_change",
      column: "status",
      approved: "APPROVED",
    },
    INVOICE_APPLICATION: {
      table: "fin_invoice_application",
      column: "status",
      approved: "APPROVED",
    },
    EXPENSE_REIMBURSEMENT: {
      table: "fin_reimbursement",
      column: "approval_status",
      approved: "APPROVED",
    },
    PROJECT_PAYMENT: {
      table: "fin_payment_application",
      column: "status",
      approved: "APPROVED",
    },
    PARTNER_SETTLEMENT: {
      table: "partner_settlement",
      column: "status",
      approved: "APPROVED",
    },
    DAILY_PURCHASE: {
      table: "fin_daily_purchase",
      column: "status",
      approved: "APPROVED",
    },
    PROJECT_START: {
      table: "prj_start",
      column: "status",
      approved: "APPROVED",
    },
    PROJECT_CHANGE: {
      table: "prj_change",
      column: "status",
      approved: "APPROVED",
    },
    PROJECT_CLOSE: {
      table: "prj_close_application",
      column: "status",
      approved: "CLOSED",
    },
  };
  const config = map[businessType];
  if (!config) return;
  const target = status === "APPROVED" ? config.approved : status;
  await connection.execute(
    `UPDATE ${config.table} SET ${config.column}=?,updated_by=?,version=version+1 WHERE id=?`,
    [target, actorUserId, businessId],
  );
  if (status !== "APPROVED") return;
  if (businessType === "CONTRACT_CHANGE") {
    const [changes] = await connection.execute<RowDataPacket[]>(
      `SELECT contract_id contractId,new_tax_inclusive_amount taxInclusiveAmount,new_tax_exclusive_amount taxExclusiveAmount,new_tax_rate taxRate,new_tax_amount taxAmount,new_end_on newEndOn FROM con_contract_change WHERE id=?`,
      [businessId],
    );
    const change = changes[0];
    if (!change)
      throw new AppError("CONTRACT_CHANGE_NOT_FOUND", "合同变更不存在", 404);
    await connection.execute(
      `UPDATE con_contract SET tax_inclusive_amount=?,tax_exclusive_amount=?,tax_rate=?,tax_amount=?,expires_on=COALESCE(?,expires_on),contract_version=contract_version+1,status='PERFORMING',updated_by=?,version=version+1 WHERE id=?`,
      [
        change.taxInclusiveAmount,
        change.taxExclusiveAmount,
        change.taxRate,
        change.taxAmount,
        change.newEndOn,
        actorUserId,
        change.contractId,
      ],
    );
  }
  if (businessType === "PROJECT_APPLICATION") {
    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM prj_project WHERE application_id=?`,
      [businessId],
    );
    if (!existing[0]) {
      const [apps] = await connection.execute<RowDataPacket[]>(
        `SELECT project_name,customer_id,project_type,service_scope,proposed_manager_id,estimated_revenue,estimated_cost,source_lead_id FROM prj_project_application WHERE id=?`,
        [businessId],
      );
      const app = apps[0];
      if (!app)
        throw new AppError(
          "PROJECT_APPLICATION_NOT_FOUND",
          "立项申请不存在",
          404,
        );
      const code = await allocateNumber(connection, "PROJECT");
      await connection.execute(
        `INSERT INTO prj_project(project_code,application_id,project_name,customer_id,project_type,service_scope,project_manager_id,estimated_revenue,estimated_cost,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          code,
          businessId,
          app.project_name,
          app.customer_id,
          app.project_type,
          app.service_scope,
          app.proposed_manager_id,
          app.estimated_revenue,
          app.estimated_cost,
          actorUserId,
          actorUserId,
        ],
      );
      if (app.source_lead_id)
        await connection.execute(
          `UPDATE mkt_lead SET status='CONVERTED',updated_by=?,version=version+1 WHERE id=?`,
          [actorUserId, app.source_lead_id],
        );
    }
  } else if (businessType === "PARTNER_SETTLEMENT")
    await connection.execute(
      `UPDATE partner_settlement SET confirmed_cost_amount=net_settlement_amount WHERE id=?`,
      [businessId],
    );
  else if (businessType === "PROJECT_START")
    await connection.execute(
      `UPDATE prj_project p JOIN prj_start s ON s.project_id=p.id SET p.status='IN_PROGRESS',p.updated_by=?,p.version=p.version+1 WHERE s.id=?`,
      [actorUserId, businessId],
    );
  else if (businessType === "PROJECT_CHANGE")
    await connection.execute(
      `UPDATE prj_change SET effective_on=COALESCE(effective_on,CURDATE()) WHERE id=?`,
      [businessId],
    );
  else if (businessType === "PROJECT_CLOSE")
    await connection.execute(
      `UPDATE prj_project p JOIN prj_close_application c ON c.project_id=p.id SET p.status='CLOSED',p.updated_by=?,p.version=p.version+1 WHERE c.id=?`,
      [actorUserId, businessId],
    );
}

export class MySqlActionExecutor {
  constructor(
    private readonly pool: Pool,
    private readonly createTemporaryUrl?: (
      fileId: string,
      maxAge: number,
    ) => Promise<string>,
  ) {}

  async execute(
    action: string,
    value: unknown,
    user: SessionUser,
  ): Promise<unknown> {
    const input = value as Record<string, any>;
    return withTransaction(this.pool, async (connection) => {
      switch (action) {
        case "message.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT id,message_type messageType,title,content,business_type businessType,business_id businessId,read_at readAt,created_at createdAt FROM sys_message WHERE recipient_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
              [user.employeeId, pageSize, (page - 1) * pageSize],
            );
          return { items: rows, page, pageSize };
        }
        case "reminder.refresh": {
          const statements = [
            `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT c.owner_id,'CONTRACT_EXPIRY',CONCAT('合同即将到期：',c.contract_name),CONCAT('到期日：',c.expires_on),'CONTRACT',c.id FROM con_contract c WHERE c.is_deleted=0 AND c.status IN('PENDING_SIGNATURE','PERFORMING') AND c.expires_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=c.owner_id AND m.message_type='CONTRACT_EXPIRY' AND m.business_id=c.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
            `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT b.business_owner_id,'BID_DEADLINE',CONCAT('投标即将截止：',b.bid_code),CONCAT('截止时间：',b.deadline_at),'BID_APPLICATION',b.id FROM bid_application b WHERE b.is_deleted=0 AND b.status NOT IN('WON','LOST','FAILED','ABANDONED') AND b.deadline_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 7 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=b.business_owner_id AND m.message_type='BID_DEADLINE' AND m.business_id=b.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 2 DAY))`,
            `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT p.project_manager_id,'DEPOSIT_OVERDUE',CONCAT('保证金退回逾期：',g.deposit_code),CONCAT('应退日：',g.due_return_on),'DEPOSIT',g.id FROM fin_deposit g JOIN prj_project p ON p.id=g.project_id WHERE g.due_return_on<CURDATE() AND g.occupied_amount>0 AND g.status NOT IN('RETURNED','VOID') AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=p.project_manager_id AND m.message_type='DEPOSIT_OVERDUE' AND m.business_id=g.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
            `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT r.owner_id,'RISK_DUE',CONCAT('问题风险待处理：',r.title),CONCAT('计划解决日：',r.planned_resolution_on),'RISK',r.id FROM prj_risk_issue r WHERE r.is_deleted=0 AND r.status<>'CLOSED' AND r.planned_resolution_on<=DATE_ADD(CURDATE(),INTERVAL 3 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=r.owner_id AND m.message_type='RISK_DUE' AND m.business_id=r.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 3 DAY))`,
          ];
          let created = 0;
          for (const sql of statements) {
            const [result] = await connection.execute<ResultSetHeader>(sql);
            created += result.affectedRows;
          }
          return { created };
        }
        case "report.dashboard": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR p.project_manager_id=? OR EXISTS(SELECT 1 FROM prj_project_member m WHERE m.project_id=p.id AND m.employee_id=? AND m.status='ACTIVE'))`;
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(p.estimated_revenue-p.estimated_cost),0) expectedProfit,COALESCE(SUM((SELECT COALESCE(SUM(c.tax_exclusive_amount),0) FROM con_contract c WHERE c.project_id=p.id AND c.contract_type='INCOME' AND c.amount_status='CONFIRMED' AND c.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND c.is_deleted=0)-(SELECT COALESCE(SUM(d.amount),0) FROM fin_reimbursement_detail d JOIN fin_reimbursement h ON h.id=d.reimbursement_id WHERE h.project_id=p.id AND h.approval_status='APPROVED' AND d.status='ACTIVE')-(SELECT COALESCE(SUM(s.confirmed_cost_amount),0) FROM partner_settlement s WHERE s.project_id=p.id AND s.status IN('APPROVED','PAID'))-(SELECT COALESCE(SUM(g.loss_confirmed_amount),0) FROM fin_deposit g WHERE g.project_id=p.id)),0) contractOperatingProfit,COALESCE(SUM((SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE')-(SELECT COALESCE(SUM(x.amount),0) FROM fin_payment_detail x WHERE x.project_id=p.id AND x.status='ACTIVE')),0) cashContribution,COUNT(*) projectCount FROM prj_project p WHERE p.is_deleted=0 AND ${access}`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          return { ...rows[0], disclaimer: "内部项目经营口径，不属于会计利润" };
        }
        case "report.project.export": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR p.project_manager_id=? OR EXISTS(SELECT 1 FROM prj_project_member m WHERE m.project_id=p.id AND m.employee_id=? AND m.status='ACTIVE'))`;
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT p.project_code projectCode,p.project_name projectName,c.name customerName,p.status,p.estimated_revenue estimatedRevenue,p.estimated_cost estimatedCost,(SELECT COALESCE(SUM(x.tax_exclusive_amount),0) FROM con_contract x WHERE x.project_id=p.id AND x.contract_type='INCOME' AND x.amount_status='CONFIRMED' AND x.is_deleted=0) confirmedIncome,(SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE') receivedAmount FROM prj_project p JOIN crm_counterparty c ON c.id=p.customer_id WHERE p.is_deleted=0 AND ${access} ORDER BY p.id DESC LIMIT 1001`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          if (rows.length > 1000)
            throw new AppError(
              "EXPORT_BACKGROUND_REQUIRED",
              "超过 1000 条的导出必须转后台任务",
              409,
            );
          return { rows, disclaimer: "内部项目经营口径，不属于会计利润" };
        }
        case "admin.overview": {
          const [departments] = await connection.execute<RowDataPacket[]>(
              `SELECT id,code,name,status FROM org_department WHERE is_deleted=0 ORDER BY id`,
            ),
            [employees] = await connection.execute<RowDataPacket[]>(
              `SELECT e.id,e.employee_code employeeCode,e.name,e.employee_type employeeType,e.department_id departmentId,d.name departmentName,e.position_name positionName,e.account_status accountStatus FROM org_employee e JOIN org_department d ON d.id=e.department_id WHERE e.is_deleted=0 ORDER BY e.id DESC LIMIT 200`,
            ),
            [roles] = await connection.execute<RowDataPacket[]>(
              `SELECT id,code,name,status FROM iam_role WHERE is_deleted=0 ORDER BY id`,
            ),
            [users] = await connection.execute<RowDataPacket[]>(
              `SELECT u.id,u.username,u.cloudbase_uid cloudbaseUid,u.status,e.name employeeName,GROUP_CONCAT(r.name ORDER BY r.id SEPARATOR '、') roleNames,GROUP_CONCAT(r.id ORDER BY r.id) roleIds FROM iam_user u JOIN org_employee e ON e.id=u.employee_id LEFT JOIN iam_user_role ur ON ur.user_id=u.id LEFT JOIN iam_role r ON r.id=ur.role_id WHERE u.is_deleted=0 GROUP BY u.id ORDER BY u.id DESC LIMIT 200`,
            );
          const [numberRules] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,rule_code ruleCode,prefix,year_pattern yearPattern,serial_length serialLength,next_serial nextSerial,current_year currentYear,status,version FROM sys_number_rule ORDER BY rule_code`,
            ),
            [approvalTemplates] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(t.id AS CHAR) id,t.template_code templateCode,t.name,t.business_type businessType,t.version,t.status,COUNT(n.id) nodeCount FROM wf_template t LEFT JOIN wf_template_node n ON n.template_id=t.id AND n.status='ENABLED' WHERE t.is_deleted=0 GROUP BY t.id ORDER BY t.business_type`,
            );
          return {
            departments,
            employees,
            roles,
            users,
            numberRules,
            approvalTemplates,
          };
        }
        case "admin.department.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO org_department(code,name) VALUES(?,?)`,
            [input.code, input.name],
          );
          return { id: String(result.insertId) };
        }
        case "admin.employee.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO org_employee(employee_code,name,employee_type,department_id,position_name,mobile,email,joined_on,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [
              input.employeeCode,
              input.name,
              input.employeeType,
              input.departmentId,
              input.positionName ?? null,
              input.mobile ?? null,
              input.email ?? null,
              input.joinedOn ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "admin.user.role.set": {
          const [current] = await connection.execute<RowDataPacket[]>(
              `SELECT 1 FROM iam_user_role ur JOIN iam_role r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code='ADMIN'`,
              [input.userId],
            ),
            [adminRole] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM iam_role WHERE code='ADMIN'`,
            );
          const requestedAdmin = (input.roleIds as string[]).includes(
            String(adminRole[0]?.id ?? ""),
          );
          if (current[0] && !requestedAdmin) {
            const [count] = await connection.execute<RowDataPacket[]>(
              `SELECT COUNT(DISTINCT ur.user_id) count FROM iam_user_role ur JOIN iam_role r ON r.id=ur.role_id JOIN iam_user u ON u.id=ur.user_id WHERE r.code='ADMIN' AND u.status='ENABLED' AND u.is_deleted=0`,
            );
            if (Number(count[0]?.count ?? 0) <= 1)
              throw new AppError(
                "LAST_ADMIN_REQUIRED",
                "系统至少必须保留一名启用的管理员",
                409,
              );
          }
          await connection.execute(
            `DELETE FROM iam_user_role WHERE user_id=?`,
            [input.userId],
          );
          for (const roleId of input.roleIds as string[])
            await connection.execute(
              `INSERT INTO iam_user_role(user_id,role_id) VALUES(?,?)`,
              [input.userId, roleId],
            );
          return { userId: input.userId, roleCount: input.roleIds.length };
        }
        case "admin.numberRule.update": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE sys_number_rule SET prefix=?,serial_length=?,status=?,updated_by=?,version=version+1 WHERE id=? AND version=?`,
            [
              input.prefix,
              input.serialLength,
              input.status,
              user.id,
              input.ruleId,
              input.version,
            ],
          );
          if (!result.affectedRows)
            throw new AppError(
              "NUMBER_RULE_CONFLICT",
              "编号规则已被他人修改，请刷新后重试",
              409,
            );
          return { id: input.ruleId, version: input.version + 1 };
        }
        case "admin.audit.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            action = (input.action as string | undefined) ?? "",
            outcome = (input.outcome as string | undefined) ?? "";
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(a.id AS CHAR) id,a.request_id requestId,a.action,a.resource_type resourceType,a.resource_id resourceId,a.outcome,a.ip_address ipAddress,a.occurred_at occurredAt,u.username FROM sys_audit_log a LEFT JOIN iam_user u ON u.id=a.actor_user_id WHERE (?='' OR a.action=?) AND (?='' OR a.outcome=?) AND (?='' OR a.action LIKE ? ESCAPE '\\\\' OR a.resource_id LIKE ? ESCAPE '\\\\' OR a.request_id LIKE ? ESCAPE '\\\\') ORDER BY a.occurred_at DESC LIMIT ? OFFSET ?`,
            [
              action,
              action,
              outcome,
              outcome,
              keyword,
              pattern,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "file.list": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.business_type businessType,f.business_id businessId,f.project_id projectId,f.logical_name logicalName,f.classification,f.current_version currentVersion,f.status,v.original_name originalName,v.mime_type mimeType,v.size_bytes sizeBytes,v.uploaded_at uploadedAt FROM file_object f JOIN file_version v ON v.file_id=f.id AND v.version_number=f.current_version WHERE f.business_type=? AND f.business_id=? AND f.status='ACTIVE' AND v.status='ACTIVE' AND (?=1 OR f.created_by=? OR (f.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=f.project_id AND (p.project_manager_id=? OR m.employee_id=?)))) ORDER BY f.id DESC`,
              [
                input.businessType,
                input.businessId,
                all ? 1 : 0,
                user.id,
                user.employeeId,
                user.employeeId,
              ],
            );
          return { items: rows };
        }
        case "file.upload.prepare": {
          const file = validateUpload(input);
          if (file.projectId) {
            const all = user.dataScopes.some((scope) => scope.type === "ALL"),
              [access] = await connection.execute<RowDataPacket[]>(
                `SELECT p.id FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=? AND (?=1 OR p.project_manager_id=? OR m.employee_id=?) LIMIT 1`,
                [file.projectId, all ? 1 : 0, user.employeeId, user.employeeId],
              );
            if (!access[0])
              throw new AppError(
                "FILE_BUSINESS_ACCESS_DENIED",
                "无权向该项目上传文件",
                403,
              );
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO file_object(business_type,business_id,project_id,logical_name,classification,status,created_by,updated_by) VALUES(?,?,?,?,?,'UPLOADING',?,?)`,
            [
              file.businessType,
              file.businessId,
              file.projectId ?? null,
              file.logicalName,
              file.classification,
              user.id,
              user.id,
            ],
          );
          const id = String(result.insertId),
            storageKey = buildPrivateStorageKey(
              id,
              1,
              file.sha256,
              file.extension,
            );
          await connection.execute(
            `INSERT INTO file_version(file_id,version_number,storage_key,original_name,extension,mime_type,size_bytes,sha256,uploaded_by,status) VALUES(?,?,?,?,?,?,?,?,?,'UPLOADING')`,
            [
              id,
              1,
              storageKey,
              file.originalName,
              file.extension,
              file.mimeType,
              file.sizeBytes,
              file.sha256,
              user.id,
            ],
          );
          return { id, storageKey };
        }
        case "file.upload.complete": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT f.id,v.id versionId,v.storage_key expectedStorageKey FROM file_object f JOIN file_version v ON v.file_id=f.id AND v.version_number=f.current_version WHERE f.id=? AND f.created_by=? AND f.status='UPLOADING' FOR UPDATE`,
            [input.fileId, user.id],
          );
          const row = rows[0];
          if (!row)
            throw new AppError(
              "FILE_UPLOAD_NOT_PENDING",
              "待完成的文件不存在",
              409,
            );
          if (!input.cloudFileId.endsWith(`/${row.expectedStorageKey}`))
            throw new AppError(
              "FILE_STORAGE_KEY_MISMATCH",
              "上传文件与预分配路径不一致",
              409,
            );
          await connection.execute(
            `UPDATE file_version SET storage_key=?,status='ACTIVE' WHERE id=?`,
            [input.cloudFileId, row.versionId],
          );
          await connection.execute(
            `UPDATE file_object SET status='ACTIVE',updated_by=?,version=version+1 WHERE id=?`,
            [user.id, input.fileId],
          );
          return { id: input.fileId, status: "ACTIVE" };
        }
        case "file.version.prepare": {
          const extension = extractSafeExtension(input.originalName),
            all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [files] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.current_version currentVersion FROM file_object f WHERE f.id=? AND f.status='ACTIVE' AND f.is_deleted=0 AND (?=1 OR f.created_by=? OR (f.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=f.project_id AND (p.project_manager_id=? OR m.employee_id=?)))) FOR UPDATE`,
              [
                input.fileId,
                all ? 1 : 0,
                user.id,
                user.employeeId,
                user.employeeId,
              ],
            );
          const file = files[0];
          if (!file)
            throw new AppError(
              "FILE_BUSINESS_ACCESS_DENIED",
              "无权更新该文件",
              403,
            );
          const nextVersion = Number(file.currentVersion) + 1;
          const [pending] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM file_version WHERE file_id=? AND status='UPLOADING' LIMIT 1 FOR UPDATE`,
            [input.fileId],
          );
          if (pending[0])
            throw new AppError(
              "FILE_VERSION_UPLOAD_PENDING",
              "该文件已有待完成的新版本上传",
              409,
            );
          const storageKey = buildPrivateStorageKey(
            input.fileId,
            nextVersion,
            input.sha256,
            extension,
          );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO file_version(file_id,version_number,storage_key,original_name,extension,mime_type,size_bytes,sha256,uploaded_by,status) VALUES(?,?,?,?,?,?,?,?,?,'UPLOADING')`,
            [
              input.fileId,
              nextVersion,
              storageKey,
              input.originalName,
              extension,
              input.mimeType,
              input.sizeBytes,
              input.sha256,
              user.id,
            ],
          );
          return {
            fileId: input.fileId,
            versionId: String(result.insertId),
            versionNumber: nextVersion,
            storageKey,
          };
        }
        case "file.version.complete": {
          const [versions] = await connection.execute<RowDataPacket[]>(
            `SELECT v.id,v.version_number versionNumber,v.storage_key expectedStorageKey FROM file_version v JOIN file_object f ON f.id=v.file_id WHERE v.id=? AND v.file_id=? AND v.uploaded_by=? AND v.status='UPLOADING' AND f.status='ACTIVE' FOR UPDATE`,
            [input.versionId, input.fileId, user.id],
          );
          const version = versions[0];
          if (!version)
            throw new AppError(
              "FILE_VERSION_UPLOAD_NOT_PENDING",
              "待完成的新版本不存在",
              409,
            );
          if (!input.cloudFileId.endsWith(`/${version.expectedStorageKey}`))
            throw new AppError(
              "FILE_STORAGE_KEY_MISMATCH",
              "上传文件与预分配路径不一致",
              409,
            );
          await connection.execute(
            `UPDATE file_version SET storage_key=?,status='ACTIVE' WHERE id=?`,
            [input.cloudFileId, input.versionId],
          );
          await connection.execute(
            `UPDATE file_object SET current_version=?,updated_by=?,version=version+1 WHERE id=?`,
            [version.versionNumber, user.id, input.fileId],
          );
          return {
            id: input.fileId,
            versionId: input.versionId,
            versionNumber: version.versionNumber,
          };
        }
        case "file.version.history": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [access] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id FROM file_object f WHERE f.id=? AND f.status='ACTIVE' AND f.is_deleted=0 AND (?=1 OR f.created_by=? OR (f.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=f.project_id AND (p.project_manager_id=? OR m.employee_id=?))))`,
              [
                input.fileId,
                all ? 1 : 0,
                user.id,
                user.employeeId,
                user.employeeId,
              ],
            );
          if (!access[0])
            throw new AppError("BUSINESS_ACCESS_DENIED", "无权查看该文件", 403);
          const [versions] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,version_number versionNumber,original_name originalName,mime_type mimeType,size_bytes sizeBytes,sha256,uploaded_at uploadedAt,status FROM file_version WHERE file_id=? AND status='ACTIVE' ORDER BY version_number DESC`,
            [input.fileId],
          );
          return { items: versions };
        }
        case "file.download": {
          if (!this.createTemporaryUrl)
            throw new AppError(
              "FILE_STORAGE_UNAVAILABLE",
              "文件存储服务未配置",
              503,
            );
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.classification,v.id versionId,v.storage_key storageKey FROM file_object f JOIN file_version v ON v.file_id=f.id AND ((? IS NULL AND v.version_number=f.current_version) OR v.id=?) WHERE f.id=? AND f.status='ACTIVE' AND v.status='ACTIVE' AND (?=1 OR f.created_by=? OR (f.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=f.project_id AND (p.project_manager_id=? OR m.employee_id=?))))`,
              [
                input.versionId ?? null,
                input.versionId ?? null,
                input.fileId,
                all ? 1 : 0,
                user.id,
                user.employeeId,
                user.employeeId,
              ],
            );
          const file = rows[0];
          if (!file)
            throw new AppError("BUSINESS_ACCESS_DENIED", "无权下载该文件", 403);
          if (
            file.classification === "SENSITIVE" &&
            !user.permissionCodes.includes("file.sensitive.read")
          ) {
            await connection.execute(
              `INSERT INTO file_access_log(file_id,version_id,user_id,action,outcome,denial_code,request_id) VALUES(?,?,?,'DOWNLOAD','DENIED','SENSITIVE_FILE_DENIED',?)`,
              [file.id, file.versionId, user.id, crypto.randomUUID()],
            );
            throw new AppError("SENSITIVE_FILE_DENIED", "无权下载该文件", 403);
          }
          const url = await this.createTemporaryUrl(
            file.storageKey,
            DOWNLOAD_URL_TTL_SECONDS,
          );
          await connection.execute(
            `INSERT INTO file_access_log(file_id,version_id,user_id,action,outcome,request_id) VALUES(?,?,?,'DOWNLOAD','SUCCESS',?)`,
            [file.id, file.versionId, user.id, crypto.randomUUID()],
          );
          return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
        }
        case "crm.counterparty.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "";
          const pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,counterparty_code code,name,short_name shortName,counterparty_type type,cooperation_status cooperationStatus
             FROM crm_counterparty WHERE is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?)
              AND (?='' OR name LIKE ? ESCAPE '\\\\' OR counterparty_code LIKE ? ESCAPE '\\\\')
             ORDER BY id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.employeeId,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "crm.counterparty.detail": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,counterparty_code code,name,short_name shortName,counterparty_type type,industry,region,address,phone,website,cooperation_status cooperationStatus,remark FROM crm_counterparty WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=?)`,
              [input.counterpartyId, all ? 1 : 0, user.employeeId],
            );
          const counterparty = rows[0];
          if (!counterparty)
            throw new AppError(
              "COUNTERPARTY_NOT_FOUND",
              "往来单位不存在或无权访问",
              404,
            );
          const [contacts] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,name,department_name departmentName,position_name positionName,mobile,phone,email,wechat,is_key_contact isKeyContact,relationship_level relationshipLevel,decision_role decisionRole FROM crm_contact WHERE counterparty_id=? AND status='ACTIVE' AND is_deleted=0 ORDER BY is_key_contact DESC,id DESC`,
              [input.counterpartyId],
            ),
            [visits] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,visit_code code,visited_at visitedAt,visit_method method,purpose,communication,next_action nextAction,next_follow_up_at nextFollowUpAt,generate_lead generateLead FROM crm_visit WHERE customer_id=? AND status='ACTIVE' AND is_deleted=0 ORDER BY visited_at DESC LIMIT 100`,
              [input.counterpartyId],
            );
          return { counterparty, contacts, visits };
        }
        case "lead.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,lead_code code,project_name projectName,CAST(customer_id AS CHAR) customerId,
                    CAST(owner_id AS CHAR) ownerId,success_probability successProbability,status,next_follow_up_at nextFollowUpAt
               FROM mkt_lead WHERE is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?)
                AND (?='' OR project_name LIKE ? ESCAPE '\\\\' OR lead_code LIKE ? ESCAPE '\\\\')
               ORDER BY id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.employeeId,
              user.id,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "lead.detail": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(l.id AS CHAR) id,l.lead_code code,l.project_name projectName,l.customer_id customerId,c.name customerName,l.source_code sourceCode,l.discovered_on discoveredOn,l.estimated_amount estimatedAmount,l.project_type projectType,l.requirement_summary requirementSummary,l.success_probability successProbability,l.status,l.next_follow_up_at nextFollowUpAt FROM mkt_lead l JOIN crm_counterparty c ON c.id=l.customer_id WHERE l.id=? AND l.is_deleted=0 AND (?=1 OR l.owner_id=? OR l.created_by=?)`,
              [input.leadId, all ? 1 : 0, user.employeeId, user.id],
            );
          const lead = rows[0];
          if (!lead)
            throw new AppError("LEAD_NOT_FOUND", "线索不存在或无权访问", 404);
          const [followUps] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,followed_up_at followedUpAt,follow_up_method method,communication,customer_feedback customerFeedback,opportunity_change opportunityChange,success_probability successProbability,next_action nextAction,next_follow_up_at nextFollowUpAt FROM mkt_lead_follow_up WHERE lead_id=? AND status='ACTIVE' AND is_deleted=0 ORDER BY followed_up_at DESC`,
            [input.leadId],
          );
          return { lead, followUps };
        }
        case "lead.close": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM mkt_lead WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.leadId],
          );
          if (!rows[0]) throw new AppError("LEAD_NOT_FOUND", "线索不存在", 404);
          const from = rows[0].status,
            status = transitionLead(from, "CLOSE");
          await connection.execute(
            `UPDATE mkt_lead SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [status, user.id, input.leadId],
          );
          await connection.execute(
            `INSERT INTO sys_status_history(object_type,object_id,from_status,to_status,action,reason,operated_by) VALUES('LEAD',?,?,?,'CLOSE',?,?)`,
            [input.leadId, from, status, input.reason, user.id],
          );
          return { id: input.leadId, status };
        }
        case "project.application.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,application_code code,project_name projectName,estimated_revenue estimatedRevenue,
                    estimated_cost estimatedCost,estimated_profit estimatedProfit,status
               FROM prj_project_application WHERE is_deleted=0 AND (?=1 OR applicant_id=? OR proposed_manager_id=?)
                AND (?='' OR project_name LIKE ? ESCAPE '\\\\' OR application_code LIKE ? ESCAPE '\\\\')
               ORDER BY id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.id,
              user.employeeId,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "project.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT DISTINCT CAST(p.id AS CHAR) id,p.project_code code,p.project_name projectName,p.status,
                    CAST(p.project_manager_id AS CHAR) projectManagerId
               FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE'
              WHERE p.is_deleted=0 AND (?=1 OR p.project_manager_id=? OR m.employee_id=?)
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR p.project_code LIKE ? ESCAPE '\\\\')
               ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "project.detail": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [projects] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(p.id AS CHAR) id,p.project_code code,p.project_name projectName,p.project_type projectType,p.service_scope serviceScope,p.status,p.estimated_revenue estimatedRevenue,p.estimated_cost estimatedCost,p.project_manager_id projectManagerId,c.name customerName,e.name managerName FROM prj_project p JOIN crm_counterparty c ON c.id=p.customer_id JOIN org_employee e ON e.id=p.project_manager_id WHERE p.id=? AND p.is_deleted=0 AND (?=1 OR p.project_manager_id=? OR EXISTS(SELECT 1 FROM prj_project_member m WHERE m.project_id=p.id AND m.employee_id=? AND m.status='ACTIVE'))`,
              [input.projectId, all ? 1 : 0, user.employeeId, user.employeeId],
            );
          const project = projects[0];
          if (!project)
            throw new AppError(
              "PROJECT_NOT_FOUND",
              "项目不存在或无权访问",
              404,
            );
          const [members] = await connection.execute<RowDataPacket[]>(
              `SELECT e.name,m.project_role projectRole,m.joined_on joinedOn,m.status FROM prj_project_member m JOIN org_employee e ON e.id=m.employee_id WHERE m.project_id=? ORDER BY m.joined_on`,
              [input.projectId],
            ),
            [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT contract_code code,contract_name contractName,contract_type contractType,tax_exclusive_amount taxExclusiveAmount,status,expires_on expiresOn FROM con_contract WHERE project_id=? AND is_deleted=0 ORDER BY id DESC`,
              [input.projectId],
            ),
            [stages] = await connection.execute<RowDataPacket[]>(
              `SELECT stage_name stageName,completion_percentage completionPercentage,status,planned_end_on plannedEndOn FROM prj_stage WHERE project_id=? AND is_deleted=0 ORDER BY stage_order`,
              [input.projectId],
            ),
            [risks] = await connection.execute<RowDataPacket[]>(
              `SELECT title,severity,status,planned_resolution_on plannedResolutionOn FROM prj_risk_issue WHERE project_id=? AND is_deleted=0 ORDER BY id DESC LIMIT 20`,
              [input.projectId],
            ),
            [money] = await connection.execute<RowDataPacket[]>(
              `SELECT (SELECT COALESCE(SUM(amount),0) FROM fin_receipt WHERE project_id=? AND status='ACTIVE') receivedAmount,(SELECT COALESCE(SUM(tax_inclusive_amount),0) FROM fin_sales_invoice WHERE project_id=? AND is_reversed=0) invoicedAmount,(SELECT COALESCE(SUM(occupied_amount),0) FROM fin_deposit WHERE project_id=?) occupiedDeposit`,
              [input.projectId, input.projectId, input.projectId],
            );
          const canReadFinancial = user.permissionCodes.includes(
            "report.financial.read",
          );
          if (!canReadFinancial) {
            delete project.estimatedRevenue;
            delete project.estimatedCost;
            for (const contract of contracts)
              delete contract.taxExclusiveAmount;
          }
          return {
            project,
            members,
            contracts,
            stages,
            risks,
            money: canReadFinancial ? money[0] : {},
            financialVisible: canReadFinancial,
          };
        }
        case "bid.application.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(b.id AS CHAR) id,b.bid_code code,p.project_name projectName,b.deadline_at deadlineAt,b.status
               FROM bid_application b JOIN prj_project p ON p.id=b.project_id
              WHERE b.is_deleted=0 AND (?=1 OR b.business_owner_id=? OR b.technical_owner_id=? OR b.pricing_owner_id=?)
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR b.bid_code LIKE ? ESCAPE '\\\\')
               ORDER BY b.id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
              user.employeeId,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "contract.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(c.id AS CHAR) id,c.contract_code code,c.contract_name contractName,c.contract_type contractType,
                    CAST(c.project_id AS CHAR) projectId,CAST(c.party_a_id AS CHAR) partyAId,CAST(c.party_b_id AS CHAR) partyBId,
                    c.tax_inclusive_amount taxInclusiveAmount,c.tax_exclusive_amount taxExclusiveAmount,c.amount_status amountStatus,c.status
               FROM con_contract c WHERE c.is_deleted=0 AND (?=1 OR c.owner_id=?)
                AND (?='' OR c.contract_name LIKE ? ESCAPE '\\\\' OR c.contract_code LIKE ? ESCAPE '\\\\')
               ORDER BY c.id DESC LIMIT ? OFFSET ?`,
            [
              all ? 1 : 0,
              user.employeeId,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "contract.detail": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,contract_code code,contract_name contractName,contract_type contractType,tax_inclusive_amount taxInclusiveAmount,tax_exclusive_amount taxExclusiveAmount,tax_rate taxRate,tax_amount taxAmount,expires_on expiresOn,contract_version contractVersion,status FROM con_contract WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=?)`,
              [input.contractId, all ? 1 : 0, user.employeeId],
            );
          if (!contracts[0])
            throw new AppError(
              "CONTRACT_NOT_FOUND",
              "合同不存在或无权访问",
              404,
            );
          const [changes] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,change_code changeCode,change_type changeType,original_tax_inclusive_amount originalTaxInclusiveAmount,new_tax_inclusive_amount newTaxInclusiveAmount,net_change_amount netChangeAmount,original_end_on originalEndOn,new_end_on newEndOn,change_content changeContent,reason,effective_on effectiveOn,status FROM con_contract_change WHERE contract_id=? AND is_deleted=0 ORDER BY id DESC`,
              [input.contractId],
            ),
            [milestones] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,milestone_type milestoneType,milestone_name milestoneName,planned_on plannedOn,planned_amount plannedAmount,condition_description conditionDescription,completed_on completedOn,status FROM con_contract_milestone WHERE contract_id=? AND is_deleted=0 ORDER BY planned_on,id`,
              [input.contractId],
            );
          return { contract: contracts[0], changes, milestones };
        }
        case "contract.summary": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(CASE WHEN contract_type='INCOME' AND amount_status='CONFIRMED' AND status NOT IN('VOID','REJECTED','TERMINATED') THEN tax_exclusive_amount ELSE 0 END),0) incomeAmount,COALESCE(SUM(CASE WHEN contract_type='EXPENSE' AND amount_status='CONFIRMED' AND status NOT IN('VOID','REJECTED','TERMINATED') THEN tax_exclusive_amount ELSE 0 END),0) expenseAmount,SUM(CASE WHEN expires_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY) AND status IN('PENDING_SIGNATURE','PERFORMING') THEN 1 ELSE 0 END) expiringCount FROM con_contract WHERE is_deleted=0 AND (?=1 OR owner_id=?)`,
            [all ? 1 : 0, user.employeeId],
          );
          return (
            rows[0] ?? {
              incomeAmount: "0.00",
              expenseAmount: "0.00",
              expiringCount: 0,
            }
          );
        }
        case "contract.activate": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM con_contract WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.contractId],
          );
          if (!rows[0] || rows[0].status !== "PENDING_SIGNATURE")
            throw new AppError(
              "CONTRACT_NOT_ACTIVATABLE",
              "只有待签署合同可确认生效",
              409,
            );
          await connection.execute(
            `UPDATE con_contract SET signed_on=?,effective_on=?,status='PERFORMING',updated_by=?,version=version+1 WHERE id=?`,
            [input.signedOn, input.effectiveOn, user.id, input.contractId],
          );
          return { id: input.contractId, status: "PERFORMING" };
        }
        case "approval.instance.submit": {
          const businessMap: Record<
            string,
            { table: string; statusColumn: string; pendingStatus?: string }
          > = {
            PROJECT_APPLICATION: {
              table: "prj_project_application",
              statusColumn: "status",
            },
            LEAD: {
              table: "mkt_lead",
              statusColumn: "status",
              pendingStatus: "PENDING_REGISTRATION",
            },
            BID_APPLICATION: {
              table: "bid_application",
              statusColumn: "status",
            },
            CONTRACT: { table: "con_contract", statusColumn: "status" },
            CONTRACT_CHANGE: {
              table: "con_contract_change",
              statusColumn: "status",
            },
            INVOICE_APPLICATION: {
              table: "fin_invoice_application",
              statusColumn: "status",
            },
            EXPENSE_REIMBURSEMENT: {
              table: "fin_reimbursement",
              statusColumn: "approval_status",
            },
            PROJECT_PAYMENT: {
              table: "fin_payment_application",
              statusColumn: "status",
            },
            PARTNER_SETTLEMENT: {
              table: "partner_settlement",
              statusColumn: "status",
            },
            DAILY_PURCHASE: {
              table: "fin_daily_purchase",
              statusColumn: "status",
            },
            PROJECT_START: { table: "prj_start", statusColumn: "status" },
            PROJECT_CHANGE: { table: "prj_change", statusColumn: "status" },
            PROJECT_CLOSE: {
              table: "prj_close_application",
              statusColumn: "status",
            },
          };
          const config = businessMap[input.businessType];
          if (!config)
            throw new AppError(
              "APPROVAL_BUSINESS_UNSUPPORTED",
              "不支持的审批业务类型",
              400,
            );
          const [records] = await connection.execute<RowDataPacket[]>(
            `SELECT id,created_by createdBy,${config.statusColumn} businessStatus FROM ${config.table} WHERE id=? FOR UPDATE`,
            [input.businessId],
          );
          const record = records[0];
          if (!record)
            throw new AppError(
              "APPROVAL_BUSINESS_NOT_FOUND",
              "待审批业务不存在",
              404,
            );
          if (
            String(record.createdBy) !== String(user.id) &&
            !user.roleCodes.includes("ADMIN")
          )
            throw new AppError(
              "APPROVAL_SUBMIT_FORBIDDEN",
              "仅创建人可提交审批",
              403,
            );
          const submittableStatuses =
            input.businessType === "LEAD"
              ? ["DRAFT", "RETURNED"]
              : ["DRAFT", "RETURNED", "REJECTED", "WITHDRAWN"];
          if (!submittableStatuses.includes(String(record.businessStatus)))
            throw new AppError(
              "APPROVAL_BUSINESS_STATUS_INVALID",
              "当前业务状态不能提交审批",
              409,
            );
          const [templates] = await connection.execute<RowDataPacket[]>(
            `SELECT id,template_code code,version FROM wf_template WHERE business_type=? AND status='ENABLED' AND is_deleted=0 LIMIT 1`,
            [input.businessType],
          );
          const template = templates[0];
          if (!template)
            throw new AppError(
              "APPROVAL_TEMPLATE_NOT_FOUND",
              "审批模板不存在",
              409,
            );
          const [nodeRows] = await connection.execute<RowDataPacket[]>(
            `SELECT node_order nodeOrder,node_name nodeName,position_code positionCode,minimum_amount minimumAmount,maximum_amount maximumAmount,is_cc isCc FROM wf_template_node WHERE template_id=? AND status='ENABLED' ORDER BY node_order`,
            [template.id],
          );
          const amount = input.amount == null ? null : Number(input.amount),
            nodes = nodeRows.filter(
              (node) =>
                (node.minimumAmount == null ||
                  (amount != null && amount >= Number(node.minimumAmount))) &&
                (node.maximumAmount == null ||
                  (amount != null && amount <= Number(node.maximumAmount))),
            );
          const approvalNodes = nodes.filter((n) => !n.isCc);
          if (!approvalNodes.length)
            throw new AppError(
              "APPROVAL_NODES_EMPTY",
              "审批模板没有适用节点",
              409,
            );
          const firstNode = approvalNodes[0]!;
          const assignments = new Map<string, string[]>();
          for (const node of nodes) {
            if (assignments.has(node.positionCode)) continue;
            const [people] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(employee_id AS CHAR) employeeId FROM org_position_assignment a JOIN org_position p ON p.id=a.position_id WHERE p.position_code=? AND a.status='ENABLED' AND a.starts_on<=CURDATE() AND (a.ends_on IS NULL OR a.ends_on>=CURDATE())`,
              [node.positionCode],
            );
            if (!people.length && !node.isCc)
              throw new AppError(
                "APPROVER_NOT_CONFIGURED",
                `岗位 ${node.positionCode} 未配置有效任职人员`,
                409,
              );
            assignments.set(
              node.positionCode,
              people.map((p) => String(p.employeeId)),
            );
          }
          const snapshot = {
            templateId: String(template.id),
            templateCode: template.code,
            templateVersion: template.version,
            approvalNodes,
            ccNodes: nodes.filter((n) => n.isCc),
          };
          const [existing] = await connection.execute<RowDataPacket[]>(
            `SELECT id,status FROM wf_instance WHERE business_type=? AND business_id=? FOR UPDATE`,
            [input.businessType, input.businessId],
          );
          let instanceId: string;
          if (existing[0]) {
            if (existing[0].status === "PENDING")
              throw new AppError(
                "APPROVAL_ALREADY_PENDING",
                "业务已在审批中",
                409,
              );
            instanceId = String(existing[0].id);
            await connection.execute(
              `UPDATE wf_instance SET title=?,amount=?,applicant_id=?,current_node_order=?,status='PENDING',configuration_snapshot=?,submitted_at=NOW(3),completed_at=NULL,version=version+1 WHERE id=?`,
              [
                input.title,
                amount,
                user.id,
                firstNode.nodeOrder,
                JSON.stringify(snapshot),
                instanceId,
              ],
            );
            await connection.execute(
              `UPDATE wf_task SET status='CANCELLED',completed_at=NOW(3) WHERE instance_id=? AND status IN('PENDING','WAITING')`,
              [instanceId],
            );
          } else {
            const code = `WF-${crypto.randomUUID()}`;
            const [result] = await connection.execute<ResultSetHeader>(
              `INSERT INTO wf_instance(instance_code,template_id,business_type,business_id,title,amount,applicant_id,current_node_order,configuration_snapshot,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,NOW(3))`,
              [
                code,
                template.id,
                input.businessType,
                input.businessId,
                input.title,
                amount,
                user.id,
                firstNode.nodeOrder,
                JSON.stringify(snapshot),
              ],
            );
            instanceId = String(result.insertId);
          }
          for (const node of approvalNodes)
            for (const employeeId of assignments.get(node.positionCode) ?? [])
              await connection.execute(
                `INSERT INTO wf_task(instance_id,node_order,position_code,assignee_id,status,assigned_at) VALUES(?,?,?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE position_code=VALUES(position_code),status=VALUES(status),assigned_at=NOW(3),completed_at=NULL,completed_by=NULL`,
                [
                  instanceId,
                  node.nodeOrder,
                  node.positionCode,
                  employeeId,
                  node.nodeOrder === firstNode.nodeOrder
                    ? "PENDING"
                    : "WAITING",
                ],
              );
          for (const node of nodes.filter((n) => n.isCc))
            for (const employeeId of assignments.get(node.positionCode) ?? [])
              await connection.execute(
                `INSERT IGNORE INTO wf_cc_recipient(instance_id,position_code,recipient_id) VALUES(?,?,?)`,
                [instanceId, node.positionCode, employeeId],
              );
          await connection.execute(
            `UPDATE ${config.table} SET ${config.statusColumn}=?,approval_instance_id=?,updated_by=?,version=version+1 WHERE id=?`,
            [
              config.pendingStatus ?? "APPROVAL_PENDING",
              instanceId,
              user.id,
              input.businessId,
            ],
          );
          return { instanceId, status: "PENDING" };
        }
        case "approval.task.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number;
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(t.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,
                    i.business_type businessType,CAST(i.business_id AS CHAR) businessId,t.node_order nodeOrder,
                    t.position_code positionCode,t.assigned_at assignedAt
               FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id
              WHERE t.assignee_id=? AND t.status='PENDING' AND i.status='PENDING'
               ORDER BY t.assigned_at ASC LIMIT ? OFFSET ?`,
            [user.employeeId, pageSize, (page - 1) * pageSize],
          );
          return { items: rows, page, pageSize };
        }
        case "approval.inbox.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            offset = (page - 1) * pageSize;
          let sql: string, params: Array<string | number>;
          if (input.mode === "PENDING") {
            sql = `SELECT CAST(t.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status,t.status taskStatus,t.position_code positionCode,t.assigned_at occurredAt,1 canAct FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id WHERE t.assignee_id=? AND t.status='PENDING' AND i.status='PENDING' ORDER BY t.assigned_at ASC LIMIT ? OFFSET ?`;
            params = [user.employeeId, pageSize, offset];
          } else if (input.mode === "INITIATED") {
            sql = `SELECT CAST(i.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status,NULL taskStatus,NULL positionCode,i.submitted_at occurredAt,0 canAct FROM wf_instance i WHERE i.applicant_id=? ORDER BY i.submitted_at DESC LIMIT ? OFFSET ?`;
            params = [user.id, pageSize, offset];
          } else if (input.mode === "CC") {
            sql = `SELECT CAST(c.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status,NULL taskStatus,c.position_code positionCode,c.created_at occurredAt,0 canAct FROM wf_cc_recipient c JOIN wf_instance i ON i.id=c.instance_id WHERE c.recipient_id=? ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
            params = [user.employeeId, pageSize, offset];
          } else {
            sql = `SELECT CAST(t.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status,t.status taskStatus,t.position_code positionCode,t.completed_at occurredAt,0 canAct FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id WHERE t.completed_by=? AND t.status='APPROVED' ORDER BY t.completed_at DESC LIMIT ? OFFSET ?`;
            params = [user.employeeId, pageSize, offset];
          }
          const [rows] = await connection.execute<RowDataPacket[]>(sql, params);
          return { items: rows, page, pageSize };
        }
        case "approval.task.action": {
          const [existing] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM wf_action_history WHERE action_key=? LIMIT 1",
            [input.actionKey],
          );
          if (existing[0]) return { idempotent: true };
          const [rows] = await connection.execute<ApprovalTaskRow[]>(
            `SELECT CAST(t.id AS CHAR) task_id,CAST(t.instance_id AS CHAR) instance_id,t.node_order,CAST(t.assignee_id AS CHAR) assignee_id,
                    t.status task_status,i.status instance_status,i.current_node_order,CAST(i.applicant_id AS CHAR) applicant_id,i.configuration_snapshot,
                    i.business_type,CAST(i.business_id AS CHAR) business_id
               FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id WHERE t.id=? FOR UPDATE`,
            [input.taskId],
          );
          const task = rows[0];
          if (
            !task ||
            task.assignee_id !== user.employeeId ||
            task.task_status !== "PENDING" ||
            task.instance_status !== "PENDING" ||
            task.current_node_order !== task.node_order
          )
            throw new AppError(
              "APPROVAL_TASK_NOT_ACTIVE",
              "当前用户没有有效审批任务",
              403,
            );
          await connection.execute(
            `INSERT INTO wf_action_history(action_key,instance_id,task_id,node_order,action,operator_id,comment) VALUES(?,?,?,?,?,?,?)`,
            [
              input.actionKey,
              task.instance_id,
              task.task_id,
              task.node_order,
              input.action,
              user.id,
              input.comment ?? null,
            ],
          );
          if (input.action === "APPROVE") {
            await connection.execute(
              `UPDATE wf_task SET status=CASE WHEN id=? THEN 'APPROVED' ELSE 'CANCELLED' END,completed_at=NOW(3),completed_by=? WHERE instance_id=? AND node_order=? AND status='PENDING'`,
              [
                task.task_id,
                user.employeeId,
                task.instance_id,
                task.node_order,
              ],
            );
            const [nextRows] = await connection.execute<RowDataPacket[]>(
              `SELECT MIN(node_order) next_order FROM wf_task WHERE instance_id=? AND node_order>? AND status='WAITING'`,
              [task.instance_id, task.node_order],
            );
            const next = nextRows[0]?.next_order as number | null;
            if (next == null) {
              await connection.execute(
                `UPDATE wf_instance SET status='APPROVED',current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,
                [task.instance_id],
              );
              await applyBusinessApprovalResult(
                connection,
                task.business_type,
                task.business_id,
                "APPROVED",
                user.id,
              );
            } else {
              await connection.execute(
                `UPDATE wf_task SET status='PENDING',assigned_at=NOW(3) WHERE instance_id=? AND node_order=? AND status='WAITING'`,
                [task.instance_id, next],
              );
              await connection.execute(
                `UPDATE wf_instance SET current_node_order=?,version=version+1 WHERE id=?`,
                [next, task.instance_id],
              );
            }
          } else {
            const status = input.action === "RETURN" ? "RETURNED" : "REJECTED";
            await connection.execute(
              `UPDATE wf_task SET status='CANCELLED',completed_at=NOW(3) WHERE instance_id=? AND status IN ('PENDING','WAITING')`,
              [task.instance_id],
            );
            await connection.execute(
              `UPDATE wf_instance SET status=?,current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,
              [status, task.instance_id],
            );
            await applyBusinessApprovalResult(
              connection,
              task.business_type,
              task.business_id,
              status,
              user.id,
            );
          }
          return { idempotent: false, status: input.action };
        }
        case "approval.instance.withdraw": {
          const [existing] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM wf_action_history WHERE action_key=? LIMIT 1",
            [input.actionKey],
          );
          if (existing[0]) return { idempotent: true };
          const [instances] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,CAST(applicant_id AS CHAR) applicantId,status,business_type businessType,CAST(business_id AS CHAR) businessId FROM wf_instance WHERE id=? FOR UPDATE`,
            [input.instanceId],
          );
          const instance = instances[0];
          if (
            !instance ||
            instance.applicantId !== user.id ||
            instance.status !== "PENDING"
          )
            throw new AppError(
              "WITHDRAW_NOT_ALLOWED",
              "仅申请人可撤回审批中的实例",
              403,
            );
          await connection.execute(
            `INSERT INTO wf_action_history(action_key,instance_id,action,operator_id,comment) VALUES(?,?,?,?,?)`,
            [
              input.actionKey,
              input.instanceId,
              "WITHDRAW",
              user.id,
              input.comment ?? null,
            ],
          );
          await connection.execute(
            `UPDATE wf_task SET status='CANCELLED',completed_at=NOW(3) WHERE instance_id=? AND status IN ('PENDING','WAITING')`,
            [input.instanceId],
          );
          await connection.execute(
            `UPDATE wf_instance SET status='WITHDRAWN',current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,
            [input.instanceId],
          );
          await applyBusinessApprovalResult(
            connection,
            instance.businessType,
            instance.businessId,
            "WITHDRAWN",
            user.id,
          );
          return { idempotent: false, status: "WITHDRAWN" };
        }
        case "finance.summary": {
          const projectId = (input.projectId as string | undefined) ?? null,
            all = user.dataScopes.some((scope) => scope.type === "ALL");
          const access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [invoiceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.tax_inclusive_amount),0) amount FROM fin_sales_invoice x WHERE x.is_reversed=0 AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [receiptRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.amount),0) amount FROM fin_receipt x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [paymentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.amount),0) amount FROM fin_payment_detail x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          return {
            invoicedAmount: invoiceRows[0]?.amount ?? "0.00",
            receivedAmount: receiptRows[0]?.amount ?? "0.00",
            paidAmount: paymentRows[0]?.amount ?? "0.00",
          };
        }
        case "finance.documents": {
          const projectId = (input.projectId as string | undefined) ?? null,
            all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [applications] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.application_code code,x.project_id projectId,x.contract_id contractId,x.requested_amount requestedAmount,x.status FROM fin_invoice_application x WHERE x.is_deleted=0 AND (? IS NULL OR x.project_id=?) AND ${access} ORDER BY x.id DESC LIMIT 200`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [receipts] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.receipt_code code,x.project_id projectId,x.contract_id contractId,x.amount,x.receipt_type receiptType,COALESCE((SELECT SUM(a.allocated_amount) FROM fin_receipt_invoice_allocation a WHERE a.receipt_id=x.id AND a.status='ACTIVE'),0) allocatedAmount FROM fin_receipt x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access} ORDER BY x.id DESC LIMIT 200`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [invoices] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.invoice_number invoiceNumber,x.project_id projectId,x.contract_id contractId,x.tax_inclusive_amount amount,x.status,COALESCE((SELECT SUM(a.allocated_amount) FROM fin_receipt_invoice_allocation a WHERE a.invoice_id=x.id AND a.status='ACTIVE'),0) allocatedAmount FROM fin_sales_invoice x WHERE x.is_reversed=0 AND (? IS NULL OR x.project_id=?) AND ${access} ORDER BY x.id DESC LIMIT 200`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          return { applications, receipts, invoices };
        }
        case "sales.invoice.create": {
          const [applications] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,contract_id contractId,requested_amount requestedAmount,status FROM fin_invoice_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.applicationId],
          );
          const application = applications[0];
          if (!application || application.status !== "APPROVED")
            throw new AppError(
              "INVOICE_APPLICATION_NOT_APPROVED",
              "只有审批通过的开票申请才能完成开票",
              409,
            );
          const [applicationUsed] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_inclusive_amount),0) amount FROM fin_sales_invoice WHERE application_id=? AND is_reversed=0`,
            [input.applicationId],
          );
          if (
            Number(applicationUsed[0]?.amount ?? 0) +
              Number(input.taxInclusiveAmount) >
            Number(application.requestedAmount)
          )
            throw new AppError(
              "INVOICE_APPLICATION_AMOUNT_EXCEEDED",
              "开票金额超过申请额度",
              409,
            );
          const [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT tax_inclusive_amount amount FROM con_contract WHERE id=? FOR UPDATE`,
              [application.contractId],
            ),
            [contractUsed] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(tax_inclusive_amount),0) amount FROM fin_sales_invoice WHERE contract_id=? AND is_reversed=0`,
              [application.contractId],
            );
          if (
            Number(contractUsed[0]?.amount ?? 0) +
              Number(input.taxInclusiveAmount) >
            Number(contracts[0]?.amount ?? 0)
          )
            throw new AppError(
              "INVOICE_CAPACITY_EXCEEDED",
              "开票金额超过合同可开票余额",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_sales_invoice(application_id,project_id,contract_id,invoice_number,invoice_code,invoiced_on,tax_inclusive_amount,tax_exclusive_amount,tax_amount,buyer_name,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.applicationId,
              application.projectId,
              application.contractId,
              input.invoiceNumber,
              input.invoiceCode ?? null,
              input.invoicedOn,
              input.taxInclusiveAmount,
              input.taxExclusiveAmount,
              input.taxAmount,
              input.buyerName,
              user.id,
              user.id,
            ],
          );
          const completed =
            Number(applicationUsed[0]?.amount ?? 0) +
              Number(input.taxInclusiveAmount) >=
            Number(application.requestedAmount);
          if (completed)
            await connection.execute(
              `UPDATE fin_invoice_application SET status='COMPLETED',updated_by=?,version=version+1 WHERE id=?`,
              [user.id, input.applicationId],
            );
          return {
            id: String(result.insertId),
            applicationCompleted: completed,
          };
        }
        case "receipt.invoice.allocate": {
          const [receipts] = await connection.execute<RowDataPacket[]>(
              `SELECT id,project_id projectId,contract_id contractId,amount,receipt_type receiptType FROM fin_receipt WHERE id=? AND status='ACTIVE' FOR UPDATE`,
              [input.receiptId],
            ),
            [invoices] = await connection.execute<RowDataPacket[]>(
              `SELECT id,project_id projectId,contract_id contractId,tax_inclusive_amount amount FROM fin_sales_invoice WHERE id=? AND is_reversed=0 FOR UPDATE`,
              [input.invoiceId],
            );
          const receipt = receipts[0],
            invoice = invoices[0];
          if (!receipt || !invoice)
            throw new AppError(
              "ALLOCATION_OBJECT_NOT_FOUND",
              "收款或发票不存在",
              404,
            );
          if (receipt.receiptType === "ADVANCE")
            throw new AppError(
              "ADVANCE_RECEIPT_NOT_ALLOCATABLE",
              "预收款暂不允许核销发票",
              409,
            );
          if (
            String(receipt.projectId) !== String(invoice.projectId) ||
            String(receipt.contractId) !== String(invoice.contractId)
          )
            throw new AppError(
              "ALLOCATION_BUSINESS_MISMATCH",
              "收款与发票必须属于同一项目和合同",
              409,
            );
          const [receiptUsed] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(allocated_amount),0) amount FROM fin_receipt_invoice_allocation WHERE receipt_id=? AND status='ACTIVE'`,
              [input.receiptId],
            ),
            [invoiceUsed] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(allocated_amount),0) amount FROM fin_receipt_invoice_allocation WHERE invoice_id=? AND status='ACTIVE'`,
              [input.invoiceId],
            );
          if (
            Number(input.allocationAmount) >
            Number(receipt.amount) - Number(receiptUsed[0]?.amount ?? 0)
          )
            throw new AppError(
              "RECEIPT_BALANCE_EXCEEDED",
              "核销金额超过收款未分配余额",
              409,
            );
          if (
            Number(input.allocationAmount) >
            Number(invoice.amount) - Number(invoiceUsed[0]?.amount ?? 0)
          )
            throw new AppError(
              "INVOICE_BALANCE_EXCEEDED",
              "核销金额超过发票未核销余额",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_receipt_invoice_allocation(receipt_id,invoice_id,allocated_amount,allocated_on,operator_id) VALUES(?,?,?,?,?)`,
            [
              input.receiptId,
              input.invoiceId,
              input.allocationAmount,
              input.allocatedOn,
              user.employeeId,
            ],
          );
          const total =
              Number(invoiceUsed[0]?.amount ?? 0) +
              Number(input.allocationAmount),
            status =
              total >= Number(invoice.amount)
                ? "ALLOCATED"
                : "PARTIALLY_ALLOCATED";
          await connection.execute(
            `UPDATE fin_sales_invoice SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [status, user.id, input.invoiceId],
          );
          return {
            id: String(result.insertId),
            invoiceStatus: status,
            receiptRemaining:
              Number(receipt.amount) -
              Number(receiptUsed[0]?.amount ?? 0) -
              Number(input.allocationAmount),
            invoiceRemaining: Number(invoice.amount) - total,
          };
        }
        case "invoice.application.create": {
          const [contracts] = await connection.execute<RowDataPacket[]>(
            `SELECT tax_inclusive_amount amount,status FROM con_contract WHERE id=? AND contract_type='INCOME' AND is_deleted=0 FOR UPDATE`,
            [input.contractId],
          );
          const contract = contracts[0];
          if (
            !contract ||
            ["VOID", "REJECTED", "TERMINATED"].includes(contract.status)
          )
            throw new AppError("INCOME_CONTRACT_INVALID", "收入合同无效", 409);
          const [usedRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_inclusive_amount),0) used FROM fin_sales_invoice WHERE contract_id=? AND is_reversed=0`,
            [input.contractId],
          );
          const available =
            Number(contract.amount) - Number(usedRows[0]?.used ?? 0);
          if (Number(input.requestedAmount) > available)
            throw new AppError(
              "INVOICE_CAPACITY_EXCEEDED",
              "申请开票金额超过合同可开票余额",
              409,
            );
          const code = await allocateNumber(connection, "INVOICE_APPLICATION");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_invoice_application(application_code,project_id,contract_id,requested_amount,invoice_type,tax_rate,invoice_content,buyer_information,planned_invoice_on,collection_condition,applicant_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.contractId,
              input.requestedAmount,
              input.invoiceType,
              input.taxRate,
              input.invoiceContent,
              input.buyerInformation,
              input.plannedInvoiceOn,
              input.collectionCondition ?? null,
              input.applicantId,
              user.id,
              user.id,
            ],
          );
          return {
            id: String(result.insertId),
            code,
            availableBefore: available,
          };
        }
        case "receipt.create": {
          const code = await allocateNumber(connection, "RECEIPT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_receipt(receipt_code,project_id,contract_id,customer_id,received_on,amount,receiving_account,payer_name,payer_account,receipt_type,voucher_number,operator_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.contractId,
              input.customerId,
              input.receivedOn,
              input.amount,
              input.receivingAccount,
              input.payerName,
              input.payerAccount ?? null,
              input.receiptType,
              input.voucherNumber ?? null,
              input.operatorId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "reimbursement.create": {
          const code = await allocateNumber(connection, "REIMBURSEMENT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_reimbursement(reimbursement_code,claimant_id,department_id,project_id,reason,payment_recipient,receiving_account,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.claimantId,
              input.departmentId,
              input.projectId ?? null,
              input.reason,
              input.paymentRecipient,
              input.receivingAccount,
              user.id,
              user.id,
            ],
          );
          for (const detail of input.details as Array<Record<string, any>>) {
            await connection.execute(
              `INSERT INTO fin_reimbursement_detail(reimbursement_id,expense_type,incurred_on,amount,description,has_invoice,invoice_number,invoicing_party) VALUES(?,?,?,?,?,?,?,?)`,
              [
                result.insertId,
                detail.expenseType,
                detail.incurredOn,
                detail.amount,
                detail.description,
                detail.hasInvoice,
                detail.invoiceNumber ?? null,
                detail.invoicingParty ?? null,
              ],
            );
          }
          return {
            id: String(result.insertId),
            code,
            detailCount: (input.details as unknown[]).length,
          };
        }
        case "finance.expenseApplications": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [reimbursements] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(h.id AS CHAR) id,h.reimbursement_code code,h.reason,h.payment_recipient paymentRecipient,h.approval_status approvalStatus,h.payment_status paymentStatus,h.created_at createdAt,COALESCE(SUM(d.amount),0) totalAmount FROM fin_reimbursement h LEFT JOIN fin_reimbursement_detail d ON d.reimbursement_id=h.id AND d.status='ACTIVE' WHERE h.is_deleted=0 AND (?=1 OR h.claimant_id=?) GROUP BY h.id ORDER BY h.id DESC LIMIT 100`,
              [all ? 1 : 0, user.employeeId],
            ),
            [purchases] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,purchase_code code,purchase_type purchaseType,item_description itemDescription,quantity,budget_amount budgetAmount,expected_on expectedOn,status,created_at createdAt FROM fin_daily_purchase WHERE is_deleted=0 AND (?=1 OR applicant_id=?) ORDER BY id DESC LIMIT 100`,
              [all ? 1 : 0, user.employeeId],
            );
          return { reimbursements, purchases };
        }
        case "finance.operations": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [payments] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.payment_code code,x.project_id projectId,x.recipient_name recipientName,x.requested_amount requestedAmount,x.receiving_account receivingAccount,x.status,COALESCE((SELECT SUM(d.amount) FROM fin_payment_detail d WHERE d.payment_id=x.id AND d.status='ACTIVE'),0) paidAmount FROM fin_payment_application x WHERE ${access} ORDER BY x.id DESC LIMIT 200`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [plans] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.plan_code code,x.project_id projectId,c.name partnerName,x.status FROM partner_plan x JOIN crm_counterparty c ON c.id=x.partner_id WHERE x.is_deleted=0 AND x.status IN('DRAFT','ENABLED') AND ${access} ORDER BY x.id DESC LIMIT 200`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [settlements] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.settlement_code code,x.project_id projectId,x.net_settlement_amount netAmount,x.status FROM partner_settlement x WHERE ${access} ORDER BY x.id DESC LIMIT 200`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [deposits] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.deposit_code code,x.project_id projectId,x.amount,x.occupied_amount occupiedAmount,x.loss_confirmed_amount lossAmount,x.status FROM fin_deposit x WHERE ${access} ORDER BY x.id DESC LIMIT 200`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          return { payments, plans, settlements, deposits };
        }
        case "payment.detail.create": {
          const [seen] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM fin_payment_detail WHERE idempotency_key=?`,
            [input.idempotencyKey],
          );
          if (seen[0]) return { idempotent: true, id: String(seen[0].id) };
          const [payments] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,requested_amount requestedAmount,receiving_account receivingAccount,status FROM fin_payment_application WHERE id=? FOR UPDATE`,
            [input.paymentId],
          );
          const payment = payments[0];
          if (
            !payment ||
            !["APPROVED", "PARTIALLY_PAID"].includes(payment.status)
          )
            throw new AppError(
              "PAYMENT_NOT_APPROVED",
              "付款申请未审批或已完成",
              409,
            );
          const [paidRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(amount),0) amount FROM fin_payment_detail WHERE payment_id=? AND status='ACTIVE'`,
            [input.paymentId],
          );
          const paid = Number(paidRows[0]?.amount ?? 0);
          if (paid + Number(input.amount) > Number(payment.requestedAmount))
            throw new AppError(
              "PAYMENT_AMOUNT_EXCEEDED",
              "累计付款金额超过申请金额",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_payment_detail(payment_id,project_id,paid_on,amount,paying_account,receiving_account,bank_reference,recorder_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              input.paymentId,
              payment.projectId,
              input.paidOn,
              input.amount,
              input.payingAccount,
              input.receivingAccount,
              input.bankReference,
              user.employeeId,
              input.idempotencyKey,
            ],
          );
          const total = paid + Number(input.amount),
            status =
              total >= Number(payment.requestedAmount)
                ? "PAID"
                : "PARTIALLY_PAID";
          await connection.execute(
            `UPDATE fin_payment_application SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [status, user.id, input.paymentId],
          );
          return {
            idempotent: false,
            id: String(result.insertId),
            status,
            remainingAmount: Number(payment.requestedAmount) - total,
          };
        }
        case "payment.application.create": {
          const code = await allocateNumber(connection, "PAYMENT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_payment_application(payment_code,project_id,source_type,source_id,recipient_name,payment_type,requested_amount,planned_on,payment_basis,receiving_account,invoice_required,operator_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.sourceType,
              input.sourceId,
              input.recipientName,
              input.paymentType,
              input.requestedAmount,
              input.plannedOn,
              input.paymentBasis,
              input.receivingAccount,
              input.invoiceRequired,
              input.operatorId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "daily.purchase.create": {
          const code = await allocateNumber(connection, "DAILY_PURCHASE");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_daily_purchase(purchase_code,applicant_id,department_id,purchase_type,supplier_id,item_description,quantity,budget_amount,purpose,expected_on,payment_method,contract_related,contract_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.applicantId,
              input.departmentId,
              input.purchaseType,
              input.supplierId ?? null,
              input.itemDescription,
              input.quantity,
              input.budgetAmount,
              input.purpose,
              input.expectedOn,
              input.paymentMethod,
              input.contractRelated,
              input.contractId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "crm.counterparty.create": {
          const code = await allocateNumber(connection, "COUNTERPARTY");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO crm_counterparty(counterparty_code,name,short_name,credit_code,counterparty_type,industry,region,address,phone,website,owner_id,source_code,cooperation_status,remark,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.name,
              input.shortName ?? null,
              input.creditCode ?? null,
              input.type,
              input.industry ?? null,
              input.region ?? null,
              input.address ?? null,
              input.phone ?? null,
              input.website ?? null,
              input.ownerId,
              input.sourceCode ?? null,
              input.cooperationStatus,
              input.remark ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "crm.contact.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO crm_contact(counterparty_id,name,gender,department_name,position_name,mobile,phone,email,wechat,is_key_contact,relationship_level,decision_role,owner_id,remark,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.counterpartyId,
              input.name,
              input.gender ?? null,
              input.departmentName ?? null,
              input.positionName ?? null,
              input.mobile ?? null,
              input.phone ?? null,
              input.email ?? null,
              input.wechat ?? null,
              input.isKeyContact,
              input.relationshipLevel ?? null,
              input.decisionRole ?? null,
              input.ownerId,
              input.remark ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "crm.visit.create": {
          if (input.contactId) {
            const [contacts] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM crm_contact WHERE id=? AND counterparty_id=? AND status='ACTIVE'`,
              [input.contactId, input.customerId],
            );
            if (!contacts[0])
              throw new AppError(
                "CONTACT_CUSTOMER_MISMATCH",
                "联系人不属于当前客户",
                409,
              );
          }
          const code = await allocateNumber(connection, "VISIT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO crm_visit(visit_code,customer_id,contact_id,visited_at,visit_method,location,purpose,communication,customer_needs,opportunity_assessment,next_action,next_follow_up_at,owner_id,generate_lead,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.customerId,
              input.contactId ?? null,
              input.visitedAt,
              input.method,
              input.location ?? null,
              input.purpose,
              input.communication,
              input.customerNeeds ?? null,
              input.opportunityAssessment ?? null,
              input.nextAction ?? null,
              input.nextFollowUpAt ?? null,
              input.ownerId,
              input.generateLead,
              user.id,
              user.id,
            ],
          );
          for (const employeeId of input.participantIds as string[])
            await connection.execute(
              `INSERT INTO crm_visit_participant(visit_id,employee_id) VALUES(?,?)`,
              [result.insertId, employeeId],
            );
          let leadId: string | null = null;
          if (input.generateLead) {
            const leadCode = await allocateNumber(connection, "LEAD");
            const [lead] = await connection.execute<ResultSetHeader>(
              `INSERT INTO mkt_lead(lead_code,project_name,customer_id,source_code,source_description,discovered_on,project_type,requirement_summary,success_probability,owner_id,next_follow_up_at,source_visit_id,created_by,updated_by) VALUES(?,?,?,?,?,DATE(?),'OTHER',?,?,?,?,?,?,?)`,
              [
                leadCode,
                input.purpose,
                input.customerId,
                "CUSTOMER_VISIT",
                input.opportunityAssessment ?? null,
                input.visitedAt,
                input.communication,
                10,
                input.ownerId,
                input.nextFollowUpAt ?? null,
                result.insertId,
                user.id,
                user.id,
              ],
            );
            leadId = String(lead.insertId);
          }
          return { id: String(result.insertId), code, leadId };
        }
        case "lead.create": {
          const [duplicates] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,lead_code code FROM mkt_lead
              WHERE customer_id=? AND project_name=? AND status NOT IN('INVALID','CONVERTED') AND is_deleted=0
              LIMIT 1 FOR UPDATE`,
            [input.customerId, input.projectName],
          );
          if (duplicates[0])
            throw new AppError(
              "DUPLICATE_LEAD",
              `该客户已存在同名有效线索（${duplicates[0].code}）`,
              409,
            );
          const code = await allocateNumber(connection, "LEAD");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO mkt_lead(lead_code,project_name,customer_id,source_code,source_description,discovered_on,estimated_amount,estimated_start_on,project_type,project_background,requirement_summary,competition,success_probability,owner_id,next_follow_up_at,source_visit_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectName,
              input.customerId,
              input.sourceCode,
              input.sourceDescription ?? null,
              input.discoveredOn,
              input.estimatedAmount ?? null,
              input.estimatedStartOn ?? null,
              input.projectType,
              input.projectBackground ?? null,
              input.requirementSummary,
              input.competition ?? null,
              input.successProbability,
              input.ownerId,
              input.nextFollowUpAt ?? null,
              input.sourceVisitId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "lead.followUp.create": {
          const [leads] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM mkt_lead WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.leadId],
          );
          if (!leads[0])
            throw new AppError("LEAD_NOT_FOUND", "线索不存在", 404);
          if (leads[0].status !== "FOLLOWING")
            throw new AppError(
              "LEAD_NOT_FOLLOWING",
              "只有跟进中的线索可以新增跟进记录",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO mkt_lead_follow_up(
                lead_id,followed_up_at,follow_up_method,participants,communication,
                customer_feedback,opportunity_change,success_probability,next_action,
                next_follow_up_at,recorder_id,created_by,updated_by
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.leadId,
              input.followedUpAt,
              input.method,
              JSON.stringify(input.participantIds),
              input.communication,
              input.customerFeedback ?? null,
              input.opportunityChange ?? null,
              input.successProbability,
              input.nextAction,
              input.nextFollowUpAt ?? null,
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          await connection.execute(
            `UPDATE mkt_lead SET success_probability=?,next_follow_up_at=?,updated_by=?,version=version+1 WHERE id=?`,
            [
              input.successProbability,
              input.nextFollowUpAt ?? null,
              user.id,
              input.leadId,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "project.application.create": {
          const code = await allocateNumber(connection, "PROJECT_APPLICATION");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_project_application(application_code,project_name,customer_id,source_lead_id,project_type,background,service_scope,estimated_revenue,estimated_cost,estimated_start_on,estimated_end_on,proposed_manager_id,bidding_method,risk_description,necessity,applicant_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectName,
              input.customerId,
              input.sourceLeadId ?? null,
              input.projectType,
              input.background ?? null,
              input.serviceScope,
              input.estimatedRevenue,
              input.estimatedCost,
              input.estimatedStartOn,
              input.estimatedEndOn,
              input.proposedManagerId,
              input.biddingMethod ?? null,
              input.riskDescription ?? null,
              input.necessity,
              input.applicantId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "bid.application.create": {
          const code = await allocateNumber(connection, "BID");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_application(bid_code,project_id,tenderer_id,agency_id,tender_number,project_budget,bid_ceiling,registration_at,document_purchase_at,clarification_at,deadline_at,opening_at,bid_location,bid_method,deposit_amount,document_fee,business_owner_id,technical_owner_id,pricing_owner_id,application_reason,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.tendererId,
              input.agencyId ?? null,
              input.tenderNumber ?? null,
              input.projectBudget ?? null,
              input.bidCeiling ?? null,
              input.registrationAt ?? null,
              input.documentPurchaseAt ?? null,
              input.clarificationAt ?? null,
              input.deadlineAt,
              input.openingAt ?? null,
              input.bidLocation ?? null,
              input.bidMethod,
              input.depositAmount,
              input.documentFee,
              input.businessOwnerId,
              input.technicalOwnerId,
              input.pricingOwnerId,
              input.applicationReason,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "bid.status.transition": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM bid_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.bidId],
          );
          if (!rows[0])
            throw new AppError("BID_NOT_FOUND", "投标申请不存在", 404);
          const status = transitionBid(rows[0].status, input.action);
          await connection.execute(
            `UPDATE bid_application SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [status, user.id, input.bidId],
          );
          return { id: input.bidId, status };
        }
        case "bid.result.create": {
          const [bids] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM bid_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.bidId],
          );
          if (!bids[0] || bids[0].status !== "OPENED")
            throw new AppError(
              "BID_NOT_OPENED",
              "只有已开标项目可登记结果",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_result(bid_id,opened_on,quoted_amount,ranking,result,winning_amount,notice_on,loss_reason,competitors,retrospective,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.bidId,
              input.openedOn,
              input.quotedAmount,
              input.ranking ?? null,
              input.result,
              input.winningAmount ?? null,
              input.noticeOn ?? null,
              input.lossReason ?? null,
              input.competitors ?? null,
              input.retrospective ?? null,
              user.id,
              user.id,
            ],
          );
          await connection.execute(
            `UPDATE bid_application SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [input.result, user.id, input.bidId],
          );
          return { id: String(result.insertId), status: input.result };
        }
        case "contract.create": {
          const code = await allocateNumber(connection, "CONTRACT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO con_contract(contract_code,contract_name,contract_type,project_id,party_a_id,party_b_id,signing_entity_id,tax_inclusive_amount,tax_exclusive_amount,tax_rate,tax_amount,amount_status,signed_on,effective_on,expires_on,service_content,payment_terms,invoice_terms,owner_id,parent_contract_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.contractName,
              input.contractType,
              input.projectId,
              input.partyAId,
              input.partyBId,
              input.signingEntityId,
              input.taxInclusiveAmount,
              input.taxExclusiveAmount,
              input.taxRate,
              input.taxAmount,
              input.amountStatus,
              input.signedOn ?? null,
              input.effectiveOn ?? null,
              input.expiresOn ?? null,
              input.serviceContent,
              input.paymentTerms,
              input.invoiceTerms ?? null,
              input.ownerId,
              input.parentContractId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "contract.change.create": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT tax_inclusive_amount taxInclusiveAmount,expires_on expiresOn,status FROM con_contract WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=?) FOR UPDATE`,
              [input.contractId, all ? 1 : 0, user.employeeId],
            );
          const contract = contracts[0];
          if (!contract)
            throw new AppError(
              "CONTRACT_NOT_FOUND",
              "合同不存在或无权访问",
              404,
            );
          if (contract.status !== "PERFORMING")
            throw new AppError(
              "CONTRACT_CHANGE_NOT_ALLOWED",
              "只有履行中的合同可以申请变更",
              409,
            );
          const [pending] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM con_contract_change WHERE contract_id=? AND status IN('DRAFT','APPROVAL_PENDING') AND is_deleted=0 LIMIT 1 FOR UPDATE`,
            [input.contractId],
          );
          if (pending[0])
            throw new AppError(
              "CONTRACT_CHANGE_ALREADY_OPEN",
              "该合同已有未完成的变更申请",
              409,
            );
          const code = await allocateNumber(connection, "CONTRACT_CHANGE");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO con_contract_change(contract_id,change_code,change_type,original_tax_inclusive_amount,new_tax_inclusive_amount,new_tax_exclusive_amount,new_tax_rate,new_tax_amount,original_end_on,new_end_on,change_content,reason,effective_on,applicant_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.contractId,
              code,
              input.changeType,
              contract.taxInclusiveAmount,
              input.newTaxInclusiveAmount,
              input.newTaxExclusiveAmount,
              input.newTaxRate,
              input.newTaxAmount,
              contract.expiresOn,
              input.newEndOn ?? null,
              input.changeContent,
              input.reason,
              input.effectiveOn,
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "contract.milestone.create": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT id,status FROM con_contract WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=?)`,
              [input.contractId, all ? 1 : 0, user.employeeId],
            );
          if (!contracts[0])
            throw new AppError(
              "CONTRACT_NOT_FOUND",
              "合同不存在或无权访问",
              404,
            );
          if (
            !["PENDING_SIGNATURE", "PERFORMING", "CHANGED"].includes(
              String(contracts[0].status),
            )
          )
            throw new AppError(
              "CONTRACT_MILESTONE_NOT_ALLOWED",
              "当前合同状态不能新增履约节点",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO con_contract_milestone(contract_id,milestone_type,milestone_name,planned_on,planned_amount,condition_description,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)`,
            [
              input.contractId,
              input.milestoneType,
              input.milestoneName,
              input.plannedOn,
              input.plannedAmount ?? null,
              input.conditionDescription ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "contract.milestone.complete": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [milestones] = await connection.execute<RowDataPacket[]>(
              `SELECT m.id,m.status FROM con_contract_milestone m JOIN con_contract c ON c.id=m.contract_id WHERE m.id=? AND m.is_deleted=0 AND c.is_deleted=0 AND (?=1 OR c.owner_id=?) FOR UPDATE`,
              [input.milestoneId, all ? 1 : 0, user.employeeId],
            );
          if (!milestones[0])
            throw new AppError(
              "CONTRACT_MILESTONE_NOT_FOUND",
              "履约节点不存在或无权访问",
              404,
            );
          if (milestones[0].status !== "PENDING")
            throw new AppError(
              "CONTRACT_MILESTONE_COMPLETED",
              "履约节点已完成",
              409,
            );
          await connection.execute(
            `UPDATE con_contract_milestone SET completed_on=?,status='COMPLETED',updated_by=?,version=version+1 WHERE id=?`,
            [input.completedOn, user.id, input.milestoneId],
          );
          return { id: input.milestoneId, status: "COMPLETED" };
        }
        case "partner.plan.create": {
          if (input.settlementMethod === "RATIO") {
            const [ratioRows] = await connection.execute<RowDataPacket[]>(
              `SELECT v.ratio FROM partner_plan p JOIN partner_plan_version v ON v.plan_id=p.id AND v.status IN('DRAFT','ENABLED') WHERE p.project_id=? AND p.status IN('DRAFT','ENABLED') AND v.calculation_basis=? FOR UPDATE`,
              [input.projectId, input.calculationBasis],
            );
            const ratioTotal = ratioRows.reduce(
              (sum, row) => sum + Number(row.ratio ?? 0),
              0,
            );
            if (ratioTotal + Number(input.ratio) > 1.0000001)
              throw new AppError(
                "PARTNER_RATIO_EXCEEDED",
                "同一项目同一基数的合作比例合计不得超过 100%",
                409,
              );
          }
          const code = await allocateNumber(connection, "PARTNER_PLAN");
          const [plan] = await connection.execute<ResultSetHeader>(
            `INSERT INTO partner_plan(project_id,partner_id,plan_code,owner_id,created_by,updated_by) VALUES(?,?,?,?,?,?)`,
            [
              input.projectId,
              input.partnerId,
              code,
              input.ownerId,
              user.id,
              user.id,
            ],
          );
          await connection.execute(
            `INSERT INTO partner_plan_version(plan_id,version_number,settlement_method,fixed_amount,ratio,calculation_basis,deductible_cost_scope,upper_limit,lower_limit,effective_from,effective_to,conditions,rounding_rule) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              plan.insertId,
              1,
              input.settlementMethod,
              input.fixedAmount ?? null,
              input.ratio ?? null,
              input.calculationBasis,
              JSON.stringify(input.deductibleCostScope),
              input.upperLimit ?? null,
              input.lowerLimit ?? null,
              input.effectiveFrom,
              input.effectiveTo ?? null,
              input.conditions ?? null,
              "ROUND_HALF_UP",
            ],
          );
          return { id: String(plan.insertId), code, version: 1 };
        }
        case "partner.settlement.create": {
          const [plans] = await connection.execute<RowDataPacket[]>(
            `SELECT p.id planId,p.project_id projectId,p.partner_id partnerId,v.id versionId,v.version_number versionNumber,v.settlement_method settlementMethod,v.fixed_amount fixedAmount,v.ratio,v.calculation_basis basis,v.deductible_cost_scope deductibleScope,v.upper_limit upperLimit,v.lower_limit lowerLimit,v.rounding_rule roundingRule FROM partner_plan p JOIN partner_plan_version v ON v.plan_id=p.id WHERE p.id=? AND p.status IN('ENABLED','DRAFT') AND v.status IN('ENABLED','DRAFT') AND v.effective_from<=? AND (v.effective_to IS NULL OR v.effective_to>=?) ORDER BY v.version_number DESC LIMIT 1 FOR UPDATE`,
            [input.planId, input.periodEndOn, input.periodStartOn],
          );
          const plan = plans[0];
          if (!plan)
            throw new AppError(
              "PARTNER_PLAN_NOT_EFFECTIVE",
              "结算期间没有有效合作方案",
              409,
            );
          let basisAmount = 0;
          if (plan.basis === "CONTRACT_REVENUE_EX_TAX") {
            const [r] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status NOT IN('VOID','REJECTED')`,
              [plan.projectId],
            );
            basisAmount = Number(r[0]?.amount ?? 0);
          } else if (plan.basis === "ACTUAL_RECEIPTS") {
            const [r] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(amount),0) amount FROM fin_receipt WHERE project_id=? AND status='ACTIVE' AND received_on<=?`,
              [plan.projectId, input.periodEndOn],
            );
            basisAmount = Number(r[0]?.amount ?? 0);
          } else if (plan.basis === "PROJECT_GROSS_PROFIT") {
            const [incomeRows] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status NOT IN('VOID','REJECTED')`,
              [plan.projectId],
            );
            const [costRows] = await connection.execute<RowDataPacket[]>(
              `SELECT (COALESCE((SELECT SUM(d.amount) FROM fin_reimbursement_detail d JOIN fin_reimbursement h ON h.id=d.reimbursement_id WHERE h.project_id=? AND h.approval_status='APPROVED' AND d.status='ACTIVE'),0)+COALESCE((SELECT SUM(confirmed_cost_amount) FROM partner_settlement WHERE project_id=? AND status='APPROVED'),0)+COALESCE((SELECT SUM(loss_confirmed_amount) FROM fin_deposit WHERE project_id=?),0)) amount`,
              [plan.projectId, plan.projectId, plan.projectId],
            );
            basisAmount = Math.max(
              0,
              Number(incomeRows[0]?.amount ?? 0) -
                Number(costRows[0]?.amount ?? 0),
            );
          }
          const [historyRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(net_settlement_amount),0) amount FROM partner_settlement WHERE plan_id=? AND status IN('APPROVED','PAID')`,
            [plan.planId],
          );
          const historical = Number(historyRows[0]?.amount ?? 0);
          const calculated = calculateSettlement({
            basis: plan.basis,
            basisCents: toCents(basisAmount),
            ratioPpm:
              plan.ratio == null
                ? null
                : BigInt(Math.round(Number(plan.ratio) * 1_000_000)),
            fixedCents:
              plan.fixedAmount == null ? null : toCents(plan.fixedAmount),
            historicalSettledCents: toCents(historical),
            deductionCents: toCents(input.deductionAmount),
            lowerLimitCents:
              plan.lowerLimit == null ? null : toCents(plan.lowerLimit),
            upperLimitCents:
              plan.upperLimit == null ? null : toCents(plan.upperLimit),
          });
          const snapshot = {
            planVersionId: String(plan.versionId),
            versionNumber: plan.versionNumber,
            basis: plan.basis,
            basisAmount,
            ratio: plan.ratio,
            fixedAmount: plan.fixedAmount,
            deductibleCostScope: plan.deductibleScope,
            roundingRule: plan.roundingRule,
            calculated: {
              theoretical: fromCents(calculated.theoreticalCents),
              available: fromCents(calculated.availableCents),
              net: fromCents(calculated.netSettlementCents),
            },
          };
          const snapshotJson = JSON.stringify(snapshot);
          const hash = createHash("sha256").update(snapshotJson).digest("hex");
          const code = await allocateNumber(connection, "PARTNER_SETTLEMENT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO partner_settlement(settlement_code,project_id,plan_id,plan_version_id,partner_id,period_start_on,period_end_on,basis_amount_snapshot,ratio_snapshot,rule_snapshot,gross_settlement_amount,historical_settled_amount,deduction_amount,net_settlement_amount,rounding_difference,invoice_requirement,snapshot_sha256,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              plan.projectId,
              plan.planId,
              plan.versionId,
              plan.partnerId,
              input.periodStartOn,
              input.periodEndOn,
              basisAmount,
              plan.ratio,
              snapshotJson,
              fromCents(calculated.theoreticalCents),
              historical,
              input.deductionAmount,
              fromCents(calculated.netSettlementCents),
              "0.00",
              input.invoiceRequirement ?? null,
              hash,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code, snapshot };
        }
        case "deposit.create": {
          const code = await allocateNumber(connection, "DEPOSIT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_deposit(deposit_code,project_id,bid_id,contract_id,deposit_type,direction,counterparty_id,amount,due_payment_on,due_return_on,account,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.bidId ?? null,
              input.contractId ?? null,
              input.depositType,
              input.direction,
              input.counterpartyId,
              input.amount,
              input.duePaymentOn,
              input.dueReturnOn ?? null,
              input.account ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "deposit.event.create": {
          const [old] = await connection.execute<RowDataPacket[]>(
            `SELECT amount,occupied_amount occupied,loss_confirmed_amount loss,status FROM fin_deposit WHERE id=? FOR UPDATE`,
            [input.depositId],
          );
          const deposit = old[0];
          if (!deposit)
            throw new AppError("DEPOSIT_NOT_FOUND", "保证金不存在", 404);
          const [seen] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM fin_deposit_event WHERE idempotency_key=?`,
            [input.idempotencyKey],
          );
          if (seen[0]) return { idempotent: true };
          let occupied = Number(deposit.occupied),
            loss = Number(deposit.loss),
            status = deposit.status as string;
          if (input.eventType === "PAY") {
            const [paidRows] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(amount),0) amount FROM fin_deposit_event WHERE deposit_id=? AND event_type='PAY'`,
              [input.depositId],
            );
            if (
              Number(paidRows[0]?.amount ?? 0) + Number(input.amount) >
              Number(deposit.amount)
            )
              throw new AppError(
                "DEPOSIT_AMOUNT_EXCEEDED",
                "累计缴纳金额超过保证金登记金额",
                409,
              );
            occupied += Number(input.amount);
            status = "PAID";
          } else if (input.eventType === "RETURN") {
            if (Number(input.amount) > occupied)
              throw new AppError(
                "DEPOSIT_BALANCE_EXCEEDED",
                "退回金额超过资金占用",
                409,
              );
            occupied -= Number(input.amount);
            status = occupied === 0 ? "RETURNED" : "PENDING_RETURN";
          } else if (input.eventType === "FORFEIT") {
            if (Number(input.amount) > occupied)
              throw new AppError(
                "DEPOSIT_BALANCE_EXCEEDED",
                "没收金额超过资金占用",
                409,
              );
            occupied -= Number(input.amount);
            status = "FORFEITED";
          } else if (input.eventType === "CONFIRM_LOSS") {
            if (
              !user.roleCodes.some((role) =>
                ["ADMIN", "COMPANY_PRINCIPAL"].includes(role),
              )
            )
              throw new AppError(
                "DEPOSIT_LOSS_APPROVAL_REQUIRED",
                "仅公司负责人可确认保证金损失",
                403,
              );
            const [forfeitRows] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(amount),0) amount FROM fin_deposit_event WHERE deposit_id=? AND event_type='FORFEIT'`,
              [input.depositId],
            );
            if (
              loss + Number(input.amount) >
              Number(forfeitRows[0]?.amount ?? 0)
            )
              throw new AppError(
                "DEPOSIT_LOSS_EXCEEDED",
                "损失确认金额超过已没收金额",
                409,
              );
            loss += Number(input.amount);
            status = "FORFEITED";
          } else {
            if (occupied !== 0)
              throw new AppError(
                "DEPOSIT_OCCUPIED",
                "仍有资金占用不能作废",
                409,
              );
            status = "VOID";
          }
          await connection.execute(
            `INSERT INTO fin_deposit_event(deposit_id,event_type,amount,occurred_on,description,operator_id,idempotency_key) VALUES(?,?,?,?,?,?,?)`,
            [
              input.depositId,
              input.eventType,
              input.amount,
              input.occurredOn,
              input.description ?? null,
              user.id,
              input.idempotencyKey,
            ],
          );
          await connection.execute(
            `UPDATE fin_deposit SET occupied_amount=?,loss_confirmed_amount=?,status=?,paid_on=CASE WHEN ?='PAY' THEN ? ELSE paid_on END,returned_on=CASE WHEN ?='RETURN' AND ?=0 THEN ? ELSE returned_on END,version=version+1,updated_by=? WHERE id=?`,
            [
              occupied,
              loss,
              status,
              input.eventType,
              input.occurredOn,
              input.eventType,
              occupied,
              input.occurredOn,
              user.id,
              input.depositId,
            ],
          );
          return {
            idempotent: false,
            status,
            occupiedAmount: occupied,
            lossConfirmedAmount: loss,
          };
        }
        case "project.close.create": {
          const [acceptanceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_acceptance WHERE project_id=? AND status='COMPLETED'`,
            [input.projectId],
          );
          const acceptancePassed = Number(acceptanceRows[0]?.count ?? 0) > 0;
          const [contractRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status NOT IN('VOID','REJECTED')`,
            [input.projectId],
          );
          const contractAmount = Number(contractRows[0]?.amount ?? 0);
          const [invoiceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_inclusive_amount),0) amount FROM fin_sales_invoice WHERE project_id=? AND is_reversed=0`,
            [input.projectId],
          );
          const invoicedAmount = Number(invoiceRows[0]?.amount ?? 0);
          const [receiptRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(amount),0) amount FROM fin_receipt WHERE project_id=? AND status='ACTIVE'`,
            [input.projectId],
          );
          const receivedAmount = Number(receiptRows[0]?.amount ?? 0);
          const [depositRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(occupied_amount),0) amount FROM fin_deposit WHERE project_id=?`,
            [input.projectId],
          );
          const unreturnedDeposit = Number(depositRows[0]?.amount ?? 0) > 0;
          const [riskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_risk_issue WHERE project_id=? AND is_deleted=0 AND status NOT IN('CLOSED')`,
            [input.projectId],
          );
          const openIssues = Number(riskRows[0]?.count ?? 0) > 0;
          const [settlementRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(net_settlement_amount),0) amount FROM partner_settlement WHERE project_id=? AND status IN('APPROVED','PAID')`,
            [input.projectId],
          );
          const settlementAmount = Number(settlementRows[0]?.amount ?? 0);
          const [costRows] = await connection.execute<RowDataPacket[]>(
            `SELECT (COALESCE((SELECT SUM(d.amount) FROM fin_reimbursement_detail d JOIN fin_reimbursement h ON h.id=d.reimbursement_id WHERE h.project_id=? AND h.approval_status='APPROVED' AND d.status='ACTIVE'),0)+COALESCE((SELECT SUM(confirmed_cost_amount) FROM partner_settlement WHERE project_id=? AND status IN('APPROVED','PAID')),0)+COALESCE((SELECT SUM(loss_confirmed_amount) FROM fin_deposit WHERE project_id=?),0)) amount`,
            [input.projectId, input.projectId, input.projectId],
          );
          const confirmedCost = Number(costRows[0]?.amount ?? 0);
          const check = {
            acceptancePassed,
            archivePassed: Boolean(input.archiveCheckPassed),
            outstandingReceivable: receivedAmount < contractAmount,
            unreturnedDeposit,
            openIssues,
          };
          validateProjectClose(
            check,
            input.closeType,
            input.openItems,
            user.roleCodes.includes("COMPANY_PRINCIPAL")
              ? "COMPANY_PRINCIPAL"
              : undefined,
          );
          const code = await allocateNumber(connection, "PROJECT_CLOSE");
          const profit = {
            contractOperatingProfit: contractAmount - confirmedCost,
            cashContribution: receivedAmount,
          };
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_close_application(close_code,project_id,applied_on,completion_summary,acceptance_conclusion,contract_amount_snapshot,invoiced_amount_snapshot,received_amount_snapshot,confirmed_cost_snapshot,settlement_amount_snapshot,archive_check_passed,profit_snapshot,close_description,close_type,special_approval_comment,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              input.projectId,
              input.appliedOn,
              input.completionSummary,
              input.acceptanceConclusion,
              contractAmount,
              invoicedAmount,
              receivedAmount,
              confirmedCost,
              settlementAmount,
              input.archiveCheckPassed,
              JSON.stringify(profit),
              input.closeDescription,
              input.closeType,
              input.specialApprovalComment ?? null,
              user.id,
              user.id,
            ],
          );
          for (const item of input.openItems as Array<Record<string, any>>) {
            await connection.execute(
              `INSERT INTO prj_close_open_item(close_application_id,item_type,description,responsible_id,due_on) VALUES(?,?,?,?,?)`,
              [
                result.insertId,
                item.type,
                item.description,
                item.responsibleId,
                item.dueOn,
              ],
            );
          }
          return { id: String(result.insertId), code, check, profit };
        }
        case "settlement.summary": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [planRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM partner_plan x WHERE x.is_deleted=0 AND ${access}`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [settlementRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.net_settlement_amount),0) amount FROM partner_settlement x WHERE x.status IN('APPROVED','PAID') AND ${access}`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [depositRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.occupied_amount),0) amount FROM fin_deposit x WHERE ${access}`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [closeRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_close_application x WHERE x.status NOT IN('CLOSED','REJECTED','WITHDRAWN') AND ${access}`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          return {
            planCount: Number(planRows[0]?.count ?? 0),
            settledAmount: settlementRows[0]?.amount ?? "0.00",
            occupiedDeposit: depositRows[0]?.amount ?? "0.00",
            pendingCloseCount: Number(closeRows[0]?.count ?? 0),
          };
        }
        case "delivery.summary": {
          const projectId = (input.projectId as string | undefined) ?? null,
            all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [stageRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count,COALESCE(AVG(completion_percentage),0) progress FROM prj_stage x WHERE x.is_deleted=0 AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [riskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_risk_issue x WHERE x.is_deleted=0 AND x.status<>'CLOSED' AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          const [deliverableRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_deliverable x WHERE x.status='CONFIRMED' AND (? IS NULL OR x.project_id=?) AND ${access}`,
            [
              projectId,
              projectId,
              all ? 1 : 0,
              user.employeeId,
              user.employeeId,
            ],
          );
          return {
            stageCount: Number(stageRows[0]?.count ?? 0),
            averageProgress: Number(stageRows[0]?.progress ?? 0),
            openRiskCount: Number(riskRows[0]?.count ?? 0),
            confirmedDeliverableCount: Number(deliverableRows[0]?.count ?? 0),
          };
        }
        case "delivery.records": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            access = `(?=1 OR EXISTS(SELECT 1 FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE' WHERE p.id=x.project_id AND (p.project_manager_id=? OR m.employee_id=?)))`;
          const [deliverables] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.deliverable_name deliverableName,x.deliverable_version deliverableVersion,x.submitted_on submittedOn,x.status,p.project_name projectName FROM prj_deliverable x JOIN prj_project p ON p.id=x.project_id WHERE ${access} ORDER BY x.id DESC LIMIT 100`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [acceptances] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.acceptance_type acceptanceType,x.accepted_on acceptedOn,x.result,x.status,p.project_name projectName FROM prj_acceptance x JOIN prj_project p ON p.id=x.project_id WHERE ${access} ORDER BY x.id DESC LIMIT 100`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [stages] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.stage_name stageName,x.completion_percentage completionPercentage,x.status,p.project_name projectName FROM prj_stage x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0 AND ${access} ORDER BY x.project_id,x.stage_order`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [risks] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.title,x.severity,x.status,p.project_name projectName FROM prj_risk_issue x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0 AND ${access} ORDER BY x.id DESC LIMIT 100`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          const [changes] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.change_type changeType,x.schedule_impact_days scheduleImpactDays,x.amount_impact amountImpact,x.status,p.project_name projectName FROM prj_change x JOIN prj_project p ON p.id=x.project_id WHERE ${access} ORDER BY x.id DESC LIMIT 100`,
            [all ? 1 : 0, user.employeeId, user.employeeId],
          );
          return { deliverables, acceptances, stages, risks, changes };
        }
        case "project.start.create": {
          const [contractRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM con_contract WHERE project_id=? AND status IN('PERFORMING','COMPLETED') AND effective_on IS NOT NULL AND effective_on<=CURDATE() AND is_deleted=0`,
            [input.projectId],
          );
          const hasContract = Number(contractRows[0]?.count ?? 0) > 0;
          if (input.startType === "NORMAL" && !hasContract)
            throw new AppError(
              "EFFECTIVE_CONTRACT_REQUIRED",
              "正常启动必须存在有效合同",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_start(project_id,start_type,started_on,project_manager_id,objectives,scope_description,communication_mechanism,deliverables,risks,current_contract_status,early_start_reason,start_basis,estimated_contract_amount,expected_signing_on,contract_reminder_active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.startType,
              input.startedOn,
              input.projectManagerId,
              input.objectives,
              input.scopeDescription,
              input.communicationMechanism,
              input.deliverables,
              input.risks ?? null,
              input.currentContractStatus ?? null,
              input.earlyStartReason ?? null,
              input.startBasis ?? null,
              input.estimatedContractAmount ?? null,
              input.expectedSigningOn ?? null,
              input.startType === "EARLY" && !hasContract,
              user.id,
              user.id,
            ],
          );
          return {
            id: String(result.insertId),
            reminderRequired: input.startType === "EARLY" && !hasContract,
          };
        }
        case "project.stage.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_stage(project_id,stage_name,stage_order,planned_start_on,planned_end_on,owner_id,objective,deliverables,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.stageName,
              input.stageOrder,
              input.plannedStartOn,
              input.plannedEndOn,
              input.ownerId,
              input.objective,
              input.deliverables,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "project.stage.transition": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM prj_stage WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.stageId],
          );
          if (!rows[0])
            throw new AppError("STAGE_NOT_FOUND", "阶段不存在", 404);
          const status = transitionStage(rows[0].status, input.action);
          await connection.execute(
            `UPDATE prj_stage SET status=?,actual_start_on=CASE WHEN ?='IN_PROGRESS' AND actual_start_on IS NULL THEN CURDATE() ELSE actual_start_on END,actual_end_on=CASE WHEN ?='COMPLETED' THEN CURDATE() ELSE actual_end_on END,updated_by=?,version=version+1 WHERE id=?`,
            [status, status, status, user.id, input.stageId],
          );
          return { id: input.stageId, status };
        }
        case "project.progress.create": {
          if (input.stageId) {
            const [stages] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM prj_stage WHERE id=? AND project_id=? AND is_deleted=0 FOR UPDATE`,
              [input.stageId, input.projectId],
            );
            if (!stages[0])
              throw new AppError(
                "STAGE_PROJECT_MISMATCH",
                "阶段不属于当前项目",
                409,
              );
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_progress(project_id,stage_id,recorded_on,completed_work,current_progress,next_plan,deviation_description,coordination_needed,recorder_id) VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.stageId ?? null,
              input.recordedOn,
              input.completedWork,
              input.currentProgress,
              input.nextPlan,
              input.deviationDescription ?? null,
              input.coordinationNeeded ?? null,
              input.recorderId,
            ],
          );
          if (input.stageId)
            await connection.execute(
              `UPDATE prj_stage SET completion_percentage=?,status=CASE WHEN ?=100 THEN 'PENDING_CONFIRMATION' WHEN status='NOT_STARTED' THEN 'IN_PROGRESS' ELSE status END,updated_by=?,version=version+1 WHERE id=?`,
              [
                input.currentProgress,
                input.currentProgress,
                user.id,
                input.stageId,
              ],
            );
          return { id: String(result.insertId) };
        }
        case "project.risk.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_risk_issue(project_id,item_type,title,description,severity,impact,owner_id,discovered_on,planned_resolution_on,measures,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.itemType,
              input.title,
              input.description,
              input.severity,
              input.impact,
              input.ownerId,
              input.discoveredOn,
              input.plannedResolutionOn,
              input.measures,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "project.risk.transition": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM prj_risk_issue WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.riskId],
          );
          if (!rows[0])
            throw new AppError("RISK_NOT_FOUND", "问题风险不存在", 404);
          const status = transitionRisk(rows[0].status, input.action);
          await connection.execute(
            `UPDATE prj_risk_issue SET status=?,actual_resolution_on=CASE WHEN ?='CLOSED' THEN CURDATE() ELSE actual_resolution_on END,updated_by=?,version=version+1 WHERE id=?`,
            [status, status, user.id, input.riskId],
          );
          return { id: input.riskId, status };
        }
        case "project.deliverable.create": {
          if (input.stageId) {
            const [stages] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM prj_stage WHERE id=? AND project_id=? AND is_deleted=0`,
              [input.stageId, input.projectId],
            );
            if (!stages[0])
              throw new AppError(
                "STAGE_PROJECT_MISMATCH",
                "阶段不属于当前项目",
                409,
              );
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_deliverable(project_id,stage_id,deliverable_name,deliverable_type,deliverable_version,submitted_on,submitter_id,recipient,description,status) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTED')`,
            [
              input.projectId,
              input.stageId ?? null,
              input.deliverableName,
              input.deliverableType,
              input.deliverableVersion,
              input.submittedOn,
              input.submitterId,
              input.recipient ?? null,
              input.description ?? null,
            ],
          );
          return { id: String(result.insertId), status: "SUBMITTED" };
        }
        case "project.deliverable.confirm": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id,status FROM prj_deliverable WHERE id=? FOR UPDATE`,
            [input.deliverableId],
          );
          if (!rows[0] || rows[0].status !== "SUBMITTED")
            throw new AppError(
              "DELIVERABLE_NOT_CONFIRMABLE",
              "成果当前不可确认",
              409,
            );
          const status =
            input.confirmationResult === "ACCEPTED" ? "CONFIRMED" : "REJECTED";
          await connection.execute(
            `UPDATE prj_deliverable SET confirmation_result=?,status=? WHERE id=?`,
            [input.confirmationResult, status, input.deliverableId],
          );
          return { id: input.deliverableId, status };
        }
        case "project.acceptance.create": {
          const status = input.result === "FAILED" ? "FAILED" : "COMPLETED";
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_acceptance(project_id,contract_id,acceptance_type,applied_on,acceptance_scope,acceptance_basis,accepted_on,acceptance_organization,result,remaining_issues,rectification_due_on,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.contractId ?? null,
              input.acceptanceType,
              input.appliedOn,
              input.acceptanceScope,
              input.acceptanceBasis,
              input.acceptedOn,
              input.acceptanceOrganization,
              input.result,
              input.remainingIssues ?? null,
              input.rectificationDueOn ?? null,
              status,
              user.id,
              user.id,
            ],
          );
          if (status === "COMPLETED")
            await connection.execute(
              `UPDATE prj_project SET status='ACCEPTED',updated_by=?,version=version+1 WHERE id=? AND status NOT IN('CLOSED','TERMINATED','CANCELLED')`,
              [user.id, input.projectId],
            );
          return { id: String(result.insertId), status };
        }
        case "project.change.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_change(project_id,change_type,original_content,new_content,reason,impact_scope,schedule_impact_days,amount_impact,applicant_id,effective_on,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.changeType,
              input.originalContent,
              input.newContent,
              input.reason,
              input.impactScope,
              input.scheduleImpactDays,
              input.amountImpact,
              input.applicantId,
              input.effectiveOn ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        default:
          throw new AppError(
            "ACTION_PERSISTENCE_NOT_IMPLEMENTED",
            `动作尚未接入持久化：${action}`,
            501,
          );
      }
    });
  }
}
