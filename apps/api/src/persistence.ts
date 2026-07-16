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
import { chooseExportMode } from "./metrics.js";
import {
  calculateSettlement,
  validateProjectClose,
  validateSpecialCloseFinalApprover,
} from "./settlements.js";
import { transitionRisk, transitionStage } from "./delivery.js";
import { transitionBid, transitionBidTask } from "./bids.js";
import { transitionLead } from "./leads.js";
import { resolveContractAmountStatus } from "./contracts.js";
import { assertProjectApplicationEditable } from "./project-applications.js";
import { validatePaymentSource } from "./finance.js";
import { refreshReminders } from "./reminders.js";
import { assertAccountStatusChangeAllowed } from "./accounts.js";
import {
  buildPrivateStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  extractSafeExtension,
  validateUpload,
} from "./files.js";
import { requirePermission } from "./rbac.js";

const toCents = (value: unknown) =>
  BigInt(Math.round(Number(value ?? 0) * 100));
const fromCents = (value: bigint) => (Number(value) / 100).toFixed(2);

async function loadNumberParameter(
  connection: PoolConnection,
  paramKey: string,
  fallback: number,
  minimum = 0,
  maximum = 3650,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT param_value paramValue FROM sys_parameter WHERE param_key=? AND status='ENABLED' AND is_deleted=0 LIMIT 1`,
    [paramKey],
  );
  const parsed = Number(rows[0]?.paramValue);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    return fallback;
  return parsed;
}

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
  position_code: string;
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
export async function requireProjectWriteAccess(
  connection: PoolConnection,
  projectId: string | number | null | undefined,
  user: SessionUser,
): Promise<void> {
  if (projectId == null) return;
  const all = user.dataScopes.some((scope) => scope.type === "ALL");
  const scopedProjectIds = user.dataScopes.flatMap((scope) =>
    scope.type === "PROJECT" ? scope.projectIds : [],
  );
  const scopedDepartmentIds = user.dataScopes.flatMap((scope) =>
    scope.type === "DEPARTMENT" ? scope.departmentIds : [],
  );
  const projectScope = scopedProjectIds.length
    ? `p.id IN (${scopedProjectIds.map(() => "?").join(",")})`
    : "0=1";
  const departmentScope = scopedDepartmentIds.length
    ? `pm.department_id IN (${scopedDepartmentIds.map(() => "?").join(",")})`
    : "0=1";
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT p.id
       FROM prj_project p
       JOIN org_employee pm ON pm.id=p.project_manager_id
       LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE'
      WHERE p.id=? AND p.is_deleted=0
        AND (?=1 OR p.project_manager_id=? OR m.employee_id=? OR ${projectScope} OR ${departmentScope} OR EXISTS(SELECT 1 FROM iam_project_grant g WHERE g.project_id=p.id AND g.employee_id=? AND g.status='ENABLED' AND g.starts_on<=CURDATE() AND (g.ends_on IS NULL OR g.ends_on>=CURDATE())))
      LIMIT 1`,
    [
      projectId,
      all ? 1 : 0,
      user.employeeId,
      user.employeeId,
      ...scopedProjectIds,
      ...scopedDepartmentIds,
      user.employeeId,
    ],
  );
  if (!rows[0])
    throw new AppError(
      "PROJECT_WRITE_FORBIDDEN",
      "数据范围不允许写入该项目",
      403,
    );
}

async function resolveApprovalBusinessProjectId(
  connection: PoolConnection,
  businessType: string,
  businessId: string | number,
): Promise<string | null> {
  const directProjectTables: Record<string, string> = {
    BID_APPLICATION: "bid_application",
    CONTRACT: "con_contract",
    INVOICE_APPLICATION: "fin_invoice_application",
    EXPENSE_REIMBURSEMENT: "fin_reimbursement",
    PROJECT_PAYMENT: "fin_payment_application",
    PARTNER_SETTLEMENT: "partner_settlement",
    DEPOSIT: "fin_deposit",
    PROJECT_START: "prj_start",
    PROJECT_CHANGE: "prj_change",
    PROJECT_ACCEPTANCE: "prj_acceptance",
    PROJECT_CLOSE: "prj_close_application",
  };
  const directTable = directProjectTables[businessType];
  if (directTable) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT CAST(project_id AS CHAR) projectId FROM ${directTable} WHERE id=?`,
      [businessId],
    );
    return rows[0]?.projectId == null ? null : String(rows[0].projectId);
  }
  if (businessType === "CONTRACT_CHANGE") {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT CAST(c.project_id AS CHAR) projectId FROM con_contract_change x JOIN con_contract c ON c.id=x.contract_id WHERE x.id=?`,
      [businessId],
    );
    return rows[0]?.projectId == null ? null : String(rows[0].projectId);
  }
  if (businessType === "DEPOSIT_LOSS") {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT CAST(d.project_id AS CHAR) projectId FROM fin_deposit_event e JOIN fin_deposit d ON d.id=e.deposit_id WHERE e.id=?`,
      [businessId],
    );
    return rows[0]?.projectId == null ? null : String(rows[0].projectId);
  }
  if (businessType === "DAILY_PURCHASE") {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT CAST(c.project_id AS CHAR) projectId FROM fin_daily_purchase p LEFT JOIN con_contract c ON c.id=p.contract_id WHERE p.id=?`,
      [businessId],
    );
    return rows[0]?.projectId == null ? null : String(rows[0].projectId);
  }
  return null;
}

async function readOutstandingInvoiceApplicationAmount(
  connection: PoolConnection,
  contractId: string,
  excludedApplicationId?: string,
): Promise<number> {
  const exclusionSql = excludedApplicationId ? " AND a.id<>?" : "";
  const params = excludedApplicationId
    ? [contractId, excludedApplicationId]
    : [contractId];
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(GREATEST(a.requested_amount-COALESCE((SELECT SUM(s.tax_inclusive_amount) FROM fin_sales_invoice s WHERE s.application_id=a.id AND s.is_reversed=0),0),0)),0) amount FROM fin_invoice_application a WHERE a.contract_id=? AND a.is_deleted=0 AND a.status IN('DRAFT','APPROVAL_PENDING','RETURNED','PENDING_INVOICE','PARTIALLY_INVOICED')${exclusionSql}`,
    params,
  );
  return Number(rows[0]?.amount ?? 0);
}

async function assertInvoiceApplicationCapacityForSubmit(
  connection: PoolConnection,
  applicationId: string,
) {
  const [applications] = await connection.execute<RowDataPacket[]>(
    `SELECT contract_id contractId,requested_amount requestedAmount FROM fin_invoice_application WHERE id=? AND is_deleted=0`,
    [applicationId],
  );
  const application = applications[0];
  if (!application)
    throw new AppError(
      "INVOICE_APPLICATION_NOT_FOUND",
      "寮€绁ㄧ敵璇蜂笉瀛樺湪",
      404,
    );
  const [contracts] = await connection.execute<RowDataPacket[]>(
    `SELECT tax_inclusive_amount amount,status FROM con_contract WHERE id=? AND contract_type='INCOME' AND is_deleted=0 FOR UPDATE`,
    [application.contractId],
  );
  const contract = contracts[0];
  if (
    !contract ||
    !["PENDING_SIGNATURE", "PERFORMING", "COMPLETED"].includes(contract.status)
  )
    throw new AppError("INCOME_CONTRACT_INVALID", "鏀跺叆鍚堝悓鏃犳晥", 409);
  const [usedRows] = await connection.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(tax_inclusive_amount),0) used FROM fin_sales_invoice WHERE contract_id=? AND is_reversed=0`,
    [application.contractId],
  );
  const reservedAmount = await readOutstandingInvoiceApplicationAmount(
    connection,
    String(application.contractId),
    applicationId,
  );
  const available =
    Number(contract.amount) - Number(usedRows[0]?.used ?? 0) - reservedAmount;
  if (Number(application.requestedAmount) > available)
    throw new AppError(
      "INVOICE_CAPACITY_EXCEEDED",
      "鐢宠寮€绁ㄩ噾棰濊秴杩囧悎鍚屽彲寮€绁ㄤ綑棰?",
      409,
    );
}

async function assertPaymentApplicationSourceForSubmit(
  connection: PoolConnection,
  paymentApplicationId: string,
) {
  const [applications] = await connection.execute<RowDataPacket[]>(
    `SELECT project_id projectId,source_type sourceType,source_id sourceId,recipient_name recipientName,receiving_account receivingAccount,requested_amount requestedAmount FROM fin_payment_application WHERE id=?`,
    [paymentApplicationId],
  );
  const application = applications[0];
  if (!application)
    throw new AppError(
      "PAYMENT_APPLICATION_NOT_FOUND",
      "浠樻鐢宠涓嶅瓨鍦?",
      404,
    );
  const sourceType = String(application.sourceType) as
    | "EXPENSE_CONTRACT"
    | "REIMBURSEMENT"
    | "PARTNER_SETTLEMENT"
    | "DEPOSIT"
    | "PURCHASE";
  const paymentSourceQueries = {
    EXPENSE_CONTRACT: `SELECT c.project_id projectId,v.name recipientName,v.bank_account receivingAccount,c.status approvalStatus,'UNPAID' paymentStatus,c.tax_inclusive_amount sourceAmount FROM con_contract c JOIN crm_counterparty v ON v.id=c.party_b_id WHERE c.id=? AND c.contract_type='EXPENSE' AND c.amount_status='CONFIRMED' AND c.is_deleted=0 FOR UPDATE`,
    REIMBURSEMENT: `SELECT r.project_id projectId,r.payment_recipient recipientName,r.receiving_account receivingAccount,r.approval_status approvalStatus,r.payment_status paymentStatus,COALESCE((SELECT SUM(d.amount) FROM fin_reimbursement_detail d WHERE d.reimbursement_id=r.id AND d.status='ACTIVE'),0) sourceAmount FROM fin_reimbursement r WHERE r.id=? AND r.is_deleted=0 FOR UPDATE`,
    PARTNER_SETTLEMENT: `SELECT s.project_id projectId,c.name recipientName,'' receivingAccount,s.status approvalStatus,s.payment_status paymentStatus,s.net_settlement_amount sourceAmount FROM partner_settlement s JOIN crm_counterparty c ON c.id=s.partner_id WHERE s.id=? FOR UPDATE`,
    DEPOSIT: `SELECT g.project_id projectId,c.name recipientName,g.account receivingAccount,g.status approvalStatus,g.status paymentStatus,g.amount sourceAmount FROM fin_deposit g JOIN crm_counterparty c ON c.id=g.counterparty_id WHERE g.id=? AND g.direction='PAY' FOR UPDATE`,
    PURCHASE: `SELECT c.project_id projectId,s.name recipientName,s.bank_account receivingAccount,p.status approvalStatus,'UNPAID' paymentStatus,p.budget_amount sourceAmount FROM fin_daily_purchase p JOIN con_contract c ON c.id=p.contract_id AND c.is_deleted=0 JOIN crm_counterparty s ON s.id=p.supplier_id WHERE p.id=? AND p.contract_related=1 AND p.is_deleted=0 FOR UPDATE`,
  };
  const sourceSql =
    paymentSourceQueries[sourceType as keyof typeof paymentSourceQueries];
  if (!sourceSql)
    throw new AppError(
      "PAYMENT_SOURCE_NOT_FOUND",
      "浠樻鏉ユ簮涓嶅瓨鍦?",
      404,
    );
  const [sources] = await connection.execute<RowDataPacket[]>(sourceSql, [
    application.sourceId,
  ]);
  const source = sources[0];
  if (!source)
    throw new AppError(
      "PAYMENT_SOURCE_NOT_FOUND",
      "浠樻鏉ユ簮涓嶅瓨鍦?",
      404,
    );
  const [existingPayments] = await connection.execute<RowDataPacket[]>(
    `SELECT COUNT(*) count,COALESCE(SUM(requested_amount),0) appliedAmount FROM fin_payment_application WHERE source_type=? AND source_id=? AND status<>'REJECTED' AND id<>?`,
    [sourceType, application.sourceId, paymentApplicationId],
  );
  validatePaymentSource({
    sourceType,
    source: {
      projectId: source.projectId,
      recipientName: source.recipientName,
      receivingAccount: source.receivingAccount,
      approvalStatus: source.approvalStatus,
      paymentStatus: source.paymentStatus,
      sourceAmount: source.sourceAmount,
    },
    application: {
      projectId: String(application.projectId),
      recipientName: String(application.recipientName),
      receivingAccount: String(application.receivingAccount),
      requestedAmount: Number(application.requestedAmount),
    },
    alreadyUsed: Number(existingPayments[0]?.count ?? 0) > 0,
    alreadyAppliedAmount: Number(existingPayments[0]?.appliedAmount ?? 0),
  });
}

function buildProjectDataScope(user: SessionUser) {
  const projectIds = user.dataScopes.flatMap((scope) =>
    scope.type === "PROJECT" ? scope.projectIds : [],
  );
  const departmentIds = user.dataScopes.flatMap((scope) =>
    scope.type === "DEPARTMENT" ? scope.departmentIds : [],
  );
  const projectScope = projectIds.length
    ? `p.id IN (${projectIds.map(() => "?").join(",")})`
    : "0=1";
  const departmentScope = departmentIds.length
    ? `pm.department_id IN (${departmentIds.map(() => "?").join(",")})`
    : "0=1";
  return {
    sql: `(?=1 OR p.project_manager_id=? OR EXISTS(SELECT 1 FROM prj_project_member m WHERE m.project_id=p.id AND m.employee_id=? AND m.status='ACTIVE') OR ${projectScope} OR ${departmentScope} OR EXISTS(SELECT 1 FROM iam_project_grant g WHERE g.project_id=p.id AND g.employee_id=? AND g.status='ENABLED' AND g.starts_on<=CURDATE() AND (g.ends_on IS NULL OR g.ends_on>=CURDATE())))`,
    params: [
      user.dataScopes.some((scope) => scope.type === "ALL") ? 1 : 0,
      user.employeeId,
      user.employeeId,
      ...projectIds,
      ...departmentIds,
      user.employeeId,
    ],
  };
}

function buildProjectReferenceScope(user: SessionUser, projectIdExpression: string) {
  const projectScope = buildProjectDataScope(user);
  return {
    sql: `EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.id=${projectIdExpression} AND p.is_deleted=0 AND ${projectScope.sql})`,
    params: projectScope.params,
  };
}

function buildFileAccessScope(user: SessionUser) {
  const projectScope = buildProjectDataScope(user);
  return {
    sql: `(f.business_type='EXPORT_TASK' AND f.created_by=?) OR (f.business_type<>'EXPORT_TASK' AND (f.created_by=? OR (f.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.id=f.project_id AND ${projectScope.sql}))))`,
    params: [
      user.id,
      user.id,
      ...projectScope.params,
    ],
  };
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
      approved: "PENDING_INVOICE",
    },
    EXPENSE_REIMBURSEMENT: {
      table: "fin_reimbursement",
      column: "approval_status",
      approved: "APPROVED",
    },
    PROJECT_PAYMENT: {
      table: "fin_payment_application",
      column: "status",
      approved: "PENDING_PAYMENT",
    },
    PARTNER_SETTLEMENT: {
      table: "partner_settlement",
      column: "status",
      approved: "APPROVED",
    },
    DEPOSIT: {
      table: "fin_deposit",
      column: "status",
      approved: "PENDING_PAYMENT",
    },
    DEPOSIT_LOSS: {
      table: "fin_deposit_event",
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
    PROJECT_ACCEPTANCE: {
      table: "prj_acceptance",
      column: "status",
      approved: "PENDING_ACCEPTANCE",
    },
    PROJECT_CLOSE: {
      table: "prj_close_application",
      column: "status",
      approved: "CLOSED",
    },
  };
  const config = map[businessType];
  if (!config) return;
  const target =
    status === "APPROVED"
      ? config.approved
      : businessType === "LEAD" && status === "WITHDRAWN"
        ? "DRAFT"
        : status;
  await connection.execute(
    `UPDATE ${config.table} SET ${config.column}=?,updated_by=?,version=version+1 WHERE id=?`,
    [target, actorUserId, businessId],
  );
  if (status !== "APPROVED") return;
  if (businessType === "CONTRACT_CHANGE") {
    const [changes] = await connection.execute<RowDataPacket[]>(
      `SELECT contract_id contractId,change_type changeType,new_tax_inclusive_amount taxInclusiveAmount,new_tax_exclusive_amount taxExclusiveAmount,new_tax_rate taxRate,new_tax_amount taxAmount,new_end_on newEndOn FROM con_contract_change WHERE id=?`,
      [businessId],
    );
    const change = changes[0];
    if (!change)
      throw new AppError("CONTRACT_CHANGE_NOT_FOUND", "合同变更不存在", 404);
    const [contracts] = await connection.execute<RowDataPacket[]>(
      `SELECT amount_status amountStatus FROM con_contract WHERE id=? FOR UPDATE`,
      [change.contractId],
    );
    if (!contracts[0])
      throw new AppError("CONTRACT_NOT_FOUND", "合同不存在", 404);
    const amountStatus = resolveContractAmountStatus(
      String(contracts[0].amountStatus) as "PROVISIONAL" | "CONFIRMED",
      String(change.changeType) as "AMOUNT" | "TERM" | "SCOPE" | "COMPOSITE",
    );
    await connection.execute(
      `UPDATE con_contract SET tax_inclusive_amount=?,tax_exclusive_amount=?,tax_rate=?,tax_amount=?,amount_status=?,expires_on=COALESCE(?,expires_on),contract_version=contract_version+1,status='PERFORMING',updated_by=?,version=version+1 WHERE id=?`,
      [
        change.taxInclusiveAmount,
        change.taxExclusiveAmount,
        change.taxRate,
        change.taxAmount,
        amountStatus,
        change.newEndOn,
        actorUserId,
        change.contractId,
      ],
    );
  }
  if (businessType === "PROJECT_ACCEPTANCE") {
    await connection.execute(
      `UPDATE prj_project p JOIN prj_acceptance a ON a.project_id=p.id SET p.status='PENDING_ACCEPTANCE',p.updated_by=?,p.version=p.version+1 WHERE a.id=? AND p.status NOT IN('CLOSED','TERMINATED','CANCELLED')`,
      [actorUserId, businessId],
    );
  }
  if (businessType === "PROJECT_CHANGE") {
    await connection.execute(
      `UPDATE prj_project p JOIN prj_change c ON c.project_id=p.id SET p.estimated_cost=GREATEST(0,p.estimated_cost+c.amount_impact),p.estimated_end_on=DATE_ADD(p.estimated_end_on,INTERVAL c.schedule_impact_days DAY),p.updated_by=?,p.version=p.version+1 WHERE c.id=?`,
      [actorUserId, businessId],
    );
    await connection.execute(
      `UPDATE prj_change SET effective_on=COALESCE(effective_on,CURDATE()) WHERE id=?`,
      [businessId],
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
      `UPDATE partner_settlement SET confirmed_cost_amount=net_settlement_amount,payment_status='PENDING_PAYMENT' WHERE id=?`,
      [businessId],
    );
  else if (businessType === "DEPOSIT_LOSS" && status === "APPROVED") {
    const [events] = await connection.execute<RowDataPacket[]>(
      `SELECT e.deposit_id depositId,e.amount,d.occupied_amount occupied FROM fin_deposit_event e JOIN fin_deposit d ON d.id=e.deposit_id WHERE e.id=? AND e.event_type='FORFEIT' FOR UPDATE`,
      [businessId],
    );
    const event = events[0];
    if (!event)
      throw new AppError(
        "DEPOSIT_LOSS_EVENT_NOT_FOUND",
        "保证金损失事件不存在",
        404,
      );
    if (Number(event.amount) > Number(event.occupied))
      throw new AppError(
        "DEPOSIT_BALANCE_EXCEEDED",
        "审批时保证金可用占用余额不足",
        409,
      );
    await connection.execute(
      `UPDATE fin_deposit SET occupied_amount=occupied_amount-?,loss_confirmed_amount=loss_confirmed_amount+?,status='FORFEITED',updated_by=?,version=version+1 WHERE id=?`,
      [event.amount, event.amount, actorUserId, event.depositId],
    );
  } else if (businessType === "PROJECT_START")
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
    requestId: string = crypto.randomUUID(),
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
        case "message.read": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE sys_message SET read_at=COALESCE(read_at,NOW(3)) WHERE id=? AND recipient_id=?`,
            [input.messageId, user.employeeId],
          );
          if (!result.affectedRows)
            throw new AppError(
              "MESSAGE_NOT_FOUND",
              "消息不存在或无权访问",
              404,
            );
          return { id: input.messageId, read: true };
        }
        case "reminder.refresh": {
          return refreshReminders(connection);
        }
        case "report.dashboard": {
          const projectScope = buildProjectDataScope(user);
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(p.estimated_revenue-p.estimated_cost),0) expectedProfit,COALESCE(SUM((SELECT COALESCE(SUM(c.tax_exclusive_amount),0) FROM con_contract c WHERE c.project_id=p.id AND c.contract_type='INCOME' AND c.amount_status='CONFIRMED' AND c.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND c.is_deleted=0)-(SELECT COALESCE(SUM(d.amount),0) FROM fin_reimbursement_detail d JOIN fin_reimbursement h ON h.id=d.reimbursement_id WHERE h.project_id=p.id AND h.approval_status='APPROVED' AND d.status='ACTIVE')-(SELECT COALESCE(SUM(s.confirmed_cost_amount),0) FROM partner_settlement s WHERE s.project_id=p.id AND s.status IN('APPROVED','PAID'))-(SELECT COALESCE(SUM(g.loss_confirmed_amount),0) FROM fin_deposit g WHERE g.project_id=p.id)),0) contractOperatingProfit,COALESCE(SUM((SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE')-(SELECT COALESCE(SUM(x.amount),0) FROM fin_payment_detail x WHERE x.project_id=p.id AND x.status='ACTIVE')),0) cashContribution,COUNT(*) projectCount FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.is_deleted=0 AND ${projectScope.sql}`,
            projectScope.params,
          );
          return { ...rows[0], disclaimer: "\u5185\u90e8\u9879\u76ee\u7ecf\u8425\u53e3\u5f84\uff0c\u4e0d\u5c5e\u4e8e\u4f1a\u8ba1\u5229\u6da6" };
        }
        case "report.analytics": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            employee = user.employeeId,
            projectScope = buildProjectDataScope(user),
            bidProjectScope = buildProjectReferenceScope(user, "b.project_id");
          const [leadStatus] = await connection.execute<RowDataPacket[]>(
              `SELECT status,COUNT(*) count,COALESCE(SUM(estimated_amount),0) amount FROM mkt_lead WHERE is_deleted=0 AND (?=1 OR owner_id=?) GROUP BY status ORDER BY status`,
              [all ? 1 : 0, employee],
            ),
            [bidStatus] = await connection.execute<RowDataPacket[]>(
              `SELECT b.status,COUNT(*) count FROM bid_application b WHERE b.is_deleted=0 AND (b.business_owner_id=? OR b.technical_owner_id=? OR b.pricing_owner_id=? OR ${bidProjectScope.sql}) GROUP BY b.status ORDER BY b.status`,
              [employee, employee, employee, ...bidProjectScope.params],
            ),
            [projectStatus] = await connection.execute<RowDataPacket[]>(
              `SELECT p.status,COUNT(DISTINCT p.id) count,COALESCE(AVG((SELECT MAX(x.overall_progress) FROM prj_progress x WHERE x.project_id=p.id)),0) averageProgress FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.is_deleted=0 AND ${projectScope.sql} GROUP BY p.status ORDER BY p.status`,
              projectScope.params,
            ),
            [collection] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(c.tax_inclusive_amount),0) contractAmount,COALESCE(SUM((SELECT SUM(r.amount) FROM fin_receipt r WHERE r.contract_id=c.id AND r.status='ACTIVE')),0) receivedAmount FROM con_contract c JOIN prj_project p ON p.id=c.project_id JOIN org_employee pm ON pm.id=p.project_manager_id WHERE c.contract_type='INCOME' AND c.amount_status='CONFIRMED' AND c.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND c.is_deleted=0 AND ${projectScope.sql}`,
              projectScope.params,
            ),
            [profits] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(p.id AS CHAR) projectId,p.project_code projectCode,p.project_name projectName,p.estimated_revenue-p.estimated_cost expectedProfit,(SELECT COALESCE(SUM(c.tax_exclusive_amount),0) FROM con_contract c WHERE c.project_id=p.id AND c.contract_type='INCOME' AND c.amount_status='CONFIRMED' AND c.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND c.is_deleted=0)-(SELECT COALESCE(SUM(d.amount),0) FROM fin_reimbursement_detail d JOIN fin_reimbursement h ON h.id=d.reimbursement_id WHERE h.project_id=p.id AND h.approval_status='APPROVED' AND d.status='ACTIVE')-(SELECT COALESCE(SUM(s.confirmed_cost_amount),0) FROM partner_settlement s WHERE s.project_id=p.id AND s.status IN('APPROVED','PAID'))-(SELECT COALESCE(SUM(g.loss_confirmed_amount),0) FROM fin_deposit g WHERE g.project_id=p.id) operatingProfit,(SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE')-(SELECT COALESCE(SUM(d.amount),0) FROM fin_payment_detail d WHERE d.project_id=p.id AND d.status='ACTIVE') cashContribution FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.is_deleted=0 AND ${projectScope.sql} ORDER BY p.id DESC LIMIT 100`,
              projectScope.params,
            );
          return {
            leadStatus,
            bidStatus,
            projectStatus,
            collection: collection[0] ?? {},
            profits,
            disclaimer: "\u5185\u90e8\u9879\u76ee\u7ecf\u8425\u53e3\u5f84\uff0c\u4e0d\u5c5e\u4e8e\u4f1a\u8ba1\u5229\u6da6",
          };
        }
        case "report.receivables": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            projectScope = buildProjectDataScope(user);
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(c.id AS CHAR) id,c.contract_code contractCode,c.contract_name contractName,p.project_name projectName,c.expires_on dueOn,c.tax_inclusive_amount contractAmount,COALESCE((SELECT SUM(r.amount) FROM fin_receipt r WHERE r.contract_id=c.id AND r.status='ACTIVE'),0) receivedAmount,c.tax_inclusive_amount-COALESCE((SELECT SUM(r.amount) FROM fin_receipt r WHERE r.contract_id=c.id AND r.status='ACTIVE'),0) outstandingAmount,CASE WHEN c.expires_on<CURDATE() THEN 1 ELSE 0 END overdue FROM con_contract c JOIN prj_project p ON p.id=c.project_id JOIN org_employee pm ON pm.id=p.project_manager_id WHERE c.contract_type='INCOME' AND c.amount_status='CONFIRMED' AND c.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND c.is_deleted=0 AND c.tax_inclusive_amount>COALESCE((SELECT SUM(r.amount) FROM fin_receipt r WHERE r.contract_id=c.id AND r.status='ACTIVE'),0) AND ${projectScope.sql} ORDER BY overdue DESC,c.expires_on LIMIT ? OFFSET ?`,
            [...projectScope.params, pageSize, (page - 1) * pageSize],
          );
          return { items: rows, page, pageSize };
        }
        case "report.project.export": {
          requirePermission(user, "report.financial.read");
          const projectScope = buildProjectDataScope(user);
          const [countRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.is_deleted=0 AND ${projectScope.sql}`,
            projectScope.params,
          );
          const estimatedRows = Number(countRows[0]?.count ?? 0);
          if (chooseExportMode(estimatedRows) === "BACKGROUND") {
            const [temporaryGrants] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(project_id AS CHAR) projectId FROM iam_project_grant WHERE employee_id=? AND status='ENABLED' AND starts_on<=CURDATE() AND (ends_on IS NULL OR ends_on>=CURDATE())`,
              [user.employeeId],
            );
            const code = await allocateNumber(connection, "EXPORT_TASK");
            const [task] = await connection.execute<ResultSetHeader>(
              `INSERT INTO sys_export_task(task_code,requester_id,export_type,filter_snapshot,permission_snapshot,estimated_rows,status) VALUES(?,?,?,?,?,?,'PENDING')`,
              [
                code,
                user.id,
                "PROJECT_OPERATING",
                JSON.stringify({}),
                JSON.stringify({
                  employeeId: user.employeeId,
                  dataScopes: user.dataScopes,
                  permissionCodes: user.permissionCodes.filter((code) =>
                    [
                      "project.export",
                      "project.read",
                      "report.financial.read",
                    ].includes(code),
                  ),
                  temporaryProjectIds: temporaryGrants.map((row) =>
                    String(row.projectId),
                  ),
                }),
                estimatedRows,
              ],
            );
            return {
              mode: "BACKGROUND",
              taskId: String(task.insertId),
              taskCode: code,
              status: "PENDING",
              estimatedRows,
              message: `\u5bfc\u51fa\u6570\u636e\u7ea6 ${estimatedRows} \u6761\uff0c\u5df2\u8f6c\u5165\u540e\u53f0\u4efb\u52a1 ${code}`,
            };
          }
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT p.project_code projectCode,p.project_name projectName,c.name customerName,p.status,p.estimated_revenue estimatedRevenue,p.estimated_cost estimatedCost,(SELECT COALESCE(SUM(x.tax_exclusive_amount),0) FROM con_contract x WHERE x.project_id=p.id AND x.contract_type='INCOME' AND x.amount_status='CONFIRMED' AND x.status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') AND x.is_deleted=0) confirmedIncome,(SELECT COALESCE(SUM(r.amount),0) FROM fin_receipt r WHERE r.project_id=p.id AND r.status='ACTIVE') receivedAmount FROM prj_project p JOIN crm_counterparty c ON c.id=p.customer_id JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.is_deleted=0 AND ${projectScope.sql} ORDER BY p.id DESC LIMIT 1000`,
            projectScope.params,
          );
          return {
            mode: "SYNCHRONOUS",
            rows,
            disclaimer: "\u5185\u90e8\u9879\u76ee\u7ecf\u8425\u53e3\u5f84\uff0c\u4e0d\u5c5e\u4e8e\u4f1a\u8ba1\u5229\u6da6",
          };
        }
        case "report.exportTasks": {
          const page = input.page as number,
            pageSize = input.pageSize as number;
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(t.id AS CHAR) id,t.task_code taskCode,t.export_type exportType,t.estimated_rows estimatedRows,t.status,t.failure_reason failureReason,CAST(t.file_id AS CHAR) fileId,t.created_at createdAt,t.started_at startedAt,t.completed_at completedAt,t.expires_at expiresAt,f.logical_name logicalName,v.size_bytes sizeBytes
               FROM sys_export_task t
               LEFT JOIN file_object f ON f.id=t.file_id AND f.status='ACTIVE'
               LEFT JOIN file_version v ON v.file_id=f.id AND v.version_number=f.current_version AND v.status='ACTIVE'
              WHERE t.requester_id=?
              ORDER BY t.created_at DESC
              LIMIT ? OFFSET ?`,
            [user.id, pageSize, (page - 1) * pageSize],
          );
          return { items: rows, page, pageSize };
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
            [permissions] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,code,name,permission_type permissionType FROM iam_permission ORDER BY permission_type,code`,
            ),
            [rolePermissions] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(role_id AS CHAR) roleId,CAST(permission_id AS CHAR) permissionId FROM iam_role_permission ORDER BY role_id,permission_id`,
            ),
            [roleDataScopes] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,CAST(role_id AS CHAR) roleId,scope_type scopeType,scope_value scopeValue,status FROM iam_role_data_scope ORDER BY role_id,scope_type,scope_value`,
            ),
            [sensitiveGrants] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,CAST(role_id AS CHAR) roleId,field_code fieldCode,access_level accessLevel,explicit_deny explicitDeny,status FROM iam_sensitive_field_grant ORDER BY role_id,field_code`,
            ),
            [users] = await connection.execute<RowDataPacket[]>(
              `SELECT u.id,u.username,u.cloudbase_uid cloudbaseUid,u.status,u.last_synced_at lastSyncedAt,e.name employeeName,GROUP_CONCAT(r.name ORDER BY r.id SEPARATOR '、') roleNames,GROUP_CONCAT(r.id ORDER BY r.id) roleIds FROM iam_user u JOIN org_employee e ON e.id=u.employee_id LEFT JOIN iam_user_role ur ON ur.user_id=u.id LEFT JOIN iam_role r ON r.id=ur.role_id WHERE u.is_deleted=0 GROUP BY u.id ORDER BY u.id DESC LIMIT 200`,
            );
          const [numberRules] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,rule_code ruleCode,prefix,year_pattern yearPattern,serial_length serialLength,next_serial nextSerial,current_year currentYear,status,version FROM sys_number_rule ORDER BY rule_code`,
            ),
            [approvalTemplates] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(t.id AS CHAR) id,t.template_code templateCode,t.name,t.business_type businessType,t.version,t.status,COUNT(n.id) nodeCount FROM wf_template t LEFT JOIN wf_template_node n ON n.template_id=t.id AND n.status='ENABLED' WHERE t.is_deleted=0 GROUP BY t.id ORDER BY t.business_type`,
            ),
            [approvalNodes] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(n.id AS CHAR) id,CAST(n.template_id AS CHAR) templateId,n.node_order nodeOrder,n.node_name nodeName,n.position_code positionCode,n.minimum_amount minimumAmount,n.maximum_amount maximumAmount,n.is_cc isCc,n.status,n.version FROM wf_template_node n ORDER BY n.template_id,n.node_order,n.is_cc`,
            ),
            [positions] = await connection.execute<RowDataPacket[]>(
              `SELECT position_code code,name FROM org_position WHERE status='ENABLED' ORDER BY position_code`,
            ),
            [positionAssignments] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(a.id AS CHAR) id,p.position_code positionCode,p.name positionName,CAST(a.employee_id AS CHAR) employeeId,e.name employeeName,a.starts_on startsOn,a.ends_on endsOn,a.is_delegate isDelegate,a.status FROM org_position_assignment a JOIN org_position p ON p.id=a.position_id JOIN org_employee e ON e.id=a.employee_id ORDER BY p.position_code,a.status,a.starts_on DESC`,
            ),
            [projectOptions] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,project_code projectCode,project_name projectName,status FROM prj_project WHERE is_deleted=0 ORDER BY id DESC LIMIT 500`,
            ),
            [projectGrants] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(g.id AS CHAR) id,CAST(g.project_id AS CHAR) projectId,p.project_code projectCode,p.project_name projectName,CAST(g.employee_id AS CHAR) employeeId,e.name employeeName,g.starts_on startsOn,g.ends_on endsOn,g.reason,g.status,iu.username grantedBy,g.created_at createdAt FROM iam_project_grant g JOIN prj_project p ON p.id=g.project_id JOIN org_employee e ON e.id=g.employee_id JOIN iam_user iu ON iu.id=g.granted_by ORDER BY g.status,g.starts_on DESC,g.id DESC LIMIT 200`,
            ),
            [dictionaryTypes] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(t.id AS CHAR) id,t.type_code typeCode,t.name,t.description,t.status,t.version FROM sys_dictionary_type t ORDER BY t.type_code`,
            ),
            [dictionaryItems] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(i.id AS CHAR) id,CAST(i.type_id AS CHAR) typeId,i.item_code itemCode,i.label,i.value_text valueText,i.sort_order sortOrder,i.status,i.version FROM sys_dictionary_item i ORDER BY i.type_id,i.sort_order,i.id`,
            ),
            [parameters] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,param_key parameterKey,name,param_value parameterValue,value_type valueType,description,status,version FROM sys_parameter WHERE is_deleted=0 ORDER BY param_key`,
            );
          return {
            departments,
            employees,
            roles,
            permissions,
            rolePermissions,
            roleDataScopes,
            sensitiveGrants,
            users,
            numberRules,
            approvalTemplates,
            approvalNodes,
            positions,
            positionAssignments,
            projectOptions,
            projectGrants,
            dictionaryTypes,
            dictionaryItems,
            parameters,
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
        case "admin.positionAssignment.create": {
          const [positions] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM org_position WHERE position_code=? AND status='ENABLED'`,
            [input.positionCode],
          );
          if (!positions[0])
            throw new AppError(
              "POSITION_NOT_FOUND",
              "审批岗位不存在或未启用",
              404,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO org_position_assignment(position_id,employee_id,starts_on,ends_on,is_delegate,created_by) VALUES(?,?,?,?,?,?)`,
            [
              positions[0].id,
              input.employeeId,
              input.startsOn,
              input.endsOn ?? null,
              input.isDelegate,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "admin.positionAssignment.status": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE org_position_assignment SET status=? WHERE id=?`,
            [input.status, input.assignmentId],
          );
          if (!result.affectedRows)
            throw new AppError(
              "POSITION_ASSIGNMENT_NOT_FOUND",
              "岗位任职记录不存在",
              404,
            );
          return { id: input.assignmentId, status: input.status };
        }
        case "admin.projectGrant.create": {
          const [projects] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM prj_project WHERE id=? AND is_deleted=0`,
            [input.projectId],
          );
          if (!projects[0])
            throw new AppError("PROJECT_NOT_FOUND", "项目不存在", 404);
          const [employees] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM org_employee WHERE id=? AND is_deleted=0 AND account_status='ENABLED'`,
            [input.employeeId],
          );
          if (!employees[0])
            throw new AppError("EMPLOYEE_NOT_FOUND", "人员不存在或已停用", 404);
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO iam_project_grant(project_id,employee_id,starts_on,ends_on,reason,granted_by) VALUES(?,?,?,?,?,?)`,
            [
              input.projectId,
              input.employeeId,
              input.startsOn,
              input.endsOn ?? null,
              input.reason ?? null,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "admin.projectGrant.status": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE iam_project_grant SET status=?,version=version+1 WHERE id=?`,
            [input.status, input.grantId],
          );
          if (!result.affectedRows)
            throw new AppError("PROJECT_GRANT_NOT_FOUND", "临时项目授权不存在", 404);
          return { id: input.grantId, status: input.status };
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
        case "admin.role.permission.set": {
          const roleId = input.roleId as string,
            permissionIds = [...new Set(input.permissionIds as string[])];
          const [roles] = await connection.execute<RowDataPacket[]>(
            `SELECT id,code FROM iam_role WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [roleId],
          );
          const role = roles[0];
          if (!role)
            throw new AppError("ROLE_NOT_FOUND", "角色不存在", 404);
          if (permissionIds.length) {
            const placeholders = permissionIds.map(() => "?").join(",");
            const [valid] = await connection.execute<RowDataPacket[]>(
              `SELECT id,code FROM iam_permission WHERE id IN (${placeholders})`,
              permissionIds,
            );
            if (valid.length !== permissionIds.length)
              throw new AppError("PERMISSION_INVALID", "所选权限不存在", 409);
            if (
              role.code === "ADMIN" &&
              !valid.some((permission) => permission.code === "system.admin")
            )
              throw new AppError(
                "ADMIN_PERMISSION_REQUIRED",
                "管理员角色必须保留系统管理权限",
                409,
              );
          } else if (role.code === "ADMIN")
            throw new AppError(
              "ADMIN_PERMISSION_REQUIRED",
              "管理员角色必须保留系统管理权限",
              409,
            );
          await connection.execute(`DELETE FROM iam_role_permission WHERE role_id=?`, [
            roleId,
          ]);
          for (const permissionId of permissionIds)
            await connection.execute(
              `INSERT INTO iam_role_permission(role_id,permission_id) VALUES(?,?)`,
              [roleId, permissionId],
            );
          return { roleId, permissionCount: permissionIds.length };
        }
        case "admin.role.dataScope.set": {
          const roleId = input.roleId as string,
            scopes = (input.scopes as Array<{ scopeType: string; scopeValue: string }>).map(
              (scope) => ({
                scopeType: scope.scopeType,
                scopeValue: scope.scopeValue ?? "",
              }),
            );
          const [roles] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM iam_role WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [roleId],
          );
          if (!roles[0])
            throw new AppError("ROLE_NOT_FOUND", "角色不存在", 404);
          await connection.execute(`DELETE FROM iam_role_data_scope WHERE role_id=?`, [
            roleId,
          ]);
          const uniqueScopes = new Map(
            scopes.map((scope) => [`${scope.scopeType}:${scope.scopeValue}`, scope]),
          );
          for (const scope of uniqueScopes.values())
            await connection.execute(
              `INSERT INTO iam_role_data_scope(role_id,scope_type,scope_value,status) VALUES(?,?,?,'ENABLED')`,
              [roleId, scope.scopeType, scope.scopeValue],
            );
          return { roleId, scopeCount: uniqueScopes.size };
        }
        case "admin.role.sensitiveField.set": {
          const roleId = input.roleId as string,
            grants = [
              ...new Map(
                (
                  input.grants as Array<{
                    fieldCode: string;
                    accessLevel: "FULL" | "MASKED";
                    explicitDeny: boolean;
                  }>
                ).map((grant) => [grant.fieldCode, grant]),
              ).values(),
            ];
          const [roles] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM iam_role WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [roleId],
          );
          if (!roles[0])
            throw new AppError("ROLE_NOT_FOUND", "角色不存在", 404);
          await connection.execute(
            `DELETE FROM iam_sensitive_field_grant WHERE role_id=?`,
            [roleId],
          );
          for (const grant of grants)
            await connection.execute(
              `INSERT INTO iam_sensitive_field_grant(role_id,field_code,access_level,explicit_deny,status) VALUES(?,?,?,?, 'ENABLED')`,
              [roleId, grant.fieldCode, grant.accessLevel, grant.explicitDeny ? 1 : 0],
            );
          return { roleId, grantCount: grants.length };
        }
        case "admin.user.create": {
          const [employees] = await connection.execute<RowDataPacket[]>(
            `SELECT e.id,e.department_id FROM org_employee e LEFT JOIN iam_user u ON u.employee_id=e.id AND u.is_deleted=0 WHERE e.id=? AND e.is_deleted=0 AND e.account_status='ENABLED' AND u.id IS NULL FOR UPDATE`,
            [input.employeeId],
          );
          if (!employees[0])
            throw new AppError(
              "EMPLOYEE_ACCOUNT_UNAVAILABLE",
              "人员不存在、已停用或已经关联账号",
              409,
            );
          const roleIds = [...new Set(input.roleIds as string[])];
          const placeholders = roleIds.map(() => "?").join(",");
          const [validRoles] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM iam_role WHERE id IN (${placeholders}) AND status='ENABLED' AND is_deleted=0`,
            roleIds,
          );
          if (validRoles.length !== roleIds.length)
            throw new AppError("ROLE_INVALID", "所选角色不存在或已停用", 409);
          const [duplicates] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM iam_user WHERE (username=? OR cloudbase_uid=?) AND is_deleted=0 FOR UPDATE`,
            [input.username, input.cloudbaseUid],
          );
          if (duplicates[0])
            throw new AppError(
              "ACCOUNT_MAPPING_EXISTS",
              "登录账号或 CloudBase UID 已被关联",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO iam_user(cloudbase_uid,employee_id,department_id,username,status,last_synced_at) VALUES(?,?,?,?, 'ENABLED',NOW(3))`,
            [
              input.cloudbaseUid,
              input.employeeId,
              employees[0].department_id,
              input.username,
            ],
          );
          for (const roleId of roleIds)
            await connection.execute(
              `INSERT INTO iam_user_role(user_id,role_id) VALUES(?,?)`,
              [result.insertId, roleId],
            );
          return {
            id: String(result.insertId),
            username: input.username,
            cloudbaseUid: input.cloudbaseUid,
          };
        }
        case "admin.user.status": {
          const [targets] = await connection.execute<RowDataPacket[]>(
            `SELECT u.id,u.status,EXISTS(SELECT 1 FROM iam_user_role ur JOIN iam_role r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='ADMIN') isAdmin FROM iam_user u WHERE u.id=? AND u.is_deleted=0 FOR UPDATE`,
            [input.userId],
          );
          if (!targets[0])
            throw new AppError("USER_NOT_FOUND", "账号不存在", 404);
          const [adminCounts] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT u.id) count FROM iam_user u JOIN iam_user_role ur ON ur.user_id=u.id JOIN iam_role r ON r.id=ur.role_id WHERE u.status='ENABLED' AND u.is_deleted=0 AND r.code='ADMIN'`,
          );
          assertAccountStatusChangeAllowed({
            targetUserId: String(targets[0].id),
            actorUserId: user.id,
            nextStatus: input.status,
            targetIsAdmin: Number(targets[0].isAdmin) === 1,
            enabledAdminCount: Number(adminCounts[0]?.count ?? 0),
          });
          await connection.execute(
            `UPDATE iam_user u JOIN org_employee e ON e.id=u.employee_id SET u.status=?,u.version=u.version+1,e.account_status=?,e.updated_by=?,e.version=e.version+1 WHERE u.id=?`,
            [input.status, input.status, user.id, input.userId],
          );
          return {
            userId: input.userId,
            status: input.status,
            cloudbaseSyncRequired: true,
          };
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
        case "admin.parameter.update": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT value_type valueType FROM sys_parameter WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.parameterId],
          );
          const parameter = rows[0];
          if (!parameter)
            throw new AppError("PARAMETER_NOT_FOUND", "系统参数不存在", 404);
          const value = input.parameterValue as string;
          if (
            parameter.valueType === "NUMBER" &&
            (!value || !Number.isFinite(Number(value)))
          )
            throw new AppError("PARAMETER_VALUE_INVALID", "数字参数值非法", 409);
          if (
            parameter.valueType === "BOOLEAN" &&
            !["true", "false", "1", "0"].includes(value.toLowerCase())
          )
            throw new AppError("PARAMETER_VALUE_INVALID", "布尔参数值非法", 409);
          if (parameter.valueType === "JSON") {
            try {
              JSON.parse(value);
            } catch {
              throw new AppError("PARAMETER_VALUE_INVALID", "JSON 参数值非法", 409);
            }
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE sys_parameter SET name=?,param_value=?,description=?,status=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND is_deleted=0`,
            [
              input.name,
              value,
              input.description ?? null,
              input.status,
              user.id,
              input.parameterId,
              input.version,
            ],
          );
          if (!result.affectedRows)
            throw new AppError(
              "PARAMETER_CONFLICT",
              "系统参数已被修改，请刷新后重试",
              409,
            );
          return { id: input.parameterId, version: input.version + 1 };
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
        case "admin.dictionary.type.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO sys_dictionary_type(type_code,name,description,created_by,updated_by) VALUES(?,?,?,?,?)`,
            [
              input.typeCode,
              input.name,
              input.description ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "admin.dictionary.item.create": {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO sys_dictionary_item(type_id,item_code,label,value_text,sort_order,created_by,updated_by) VALUES(?,?,?,?,?,?,?)`,
            [
              input.typeId,
              input.itemCode,
              input.label,
              input.valueText,
              input.sortOrder,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "admin.dictionary.item.update": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE sys_dictionary_item SET label=?,value_text=?,sort_order=?,status=?,updated_by=?,version=version+1 WHERE id=? AND version=?`,
            [
              input.label,
              input.valueText,
              input.sortOrder,
              input.status,
              user.id,
              input.itemId,
              input.version,
            ],
          );
          if (!result.affectedRows)
            throw new AppError(
              "DICTIONARY_ITEM_CONFLICT",
              "字典项已被修改，请刷新后重试",
              409,
            );
          return { id: input.itemId, version: input.version + 1 };
        }
        case "admin.approvalNode.update": {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE wf_template_node SET node_name=?,position_code=?,minimum_amount=?,maximum_amount=?,is_cc=?,status=?,version=version+1 WHERE id=? AND version=?`,
            [
              input.nodeName,
              input.positionCode,
              input.minimumAmount,
              input.maximumAmount,
              input.isCc,
              input.status,
              input.nodeId,
              input.version,
            ],
          );
          if (!result.affectedRows)
            throw new AppError(
              "APPROVAL_NODE_CONFLICT",
              "审批节点已被修改，请刷新后重试",
              409,
            );
          return { id: input.nodeId, version: input.version + 1 };
        }
        case "file.list": {
          const fileAccess = buildFileAccessScope(user),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.business_type businessType,f.business_id businessId,f.project_id projectId,f.logical_name logicalName,f.classification,f.current_version currentVersion,f.status,v.original_name originalName,v.mime_type mimeType,v.size_bytes sizeBytes,v.uploaded_at uploadedAt FROM file_object f JOIN file_version v ON v.file_id=f.id AND v.version_number=f.current_version WHERE f.business_type=? AND f.business_id=? AND f.status='ACTIVE' AND v.status='ACTIVE' AND (f.classification<>'SENSITIVE' OR ?=1) AND (${fileAccess.sql}) ORDER BY f.id DESC`,
              [
                input.businessType,
                input.businessId,
                user.permissionCodes.includes("file.sensitive.read") ? 1 : 0,
                ...fileAccess.params,
              ],
            );
          return { items: rows };
        }
        case "file.upload.prepare": {
          const file = validateUpload(input);
          await requireProjectWriteAccess(connection, file.projectId ?? null, user);
          if (file.projectId) {
            const projectScope = buildProjectDataScope(user),
              [access] = await connection.execute<RowDataPacket[]>(
                `SELECT p.id FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.id=? AND ${projectScope.sql} LIMIT 1`,
                [file.projectId, ...projectScope.params],
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
            [files] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.current_version currentVersion,CAST(f.project_id AS CHAR) projectId,CAST(f.created_by AS CHAR) createdBy FROM file_object f WHERE f.id=? AND f.status='ACTIVE' AND f.is_deleted=0 FOR UPDATE`,
              [input.fileId],
            );
          const file = files[0];
          if (!file) {
            throw new AppError(
              "FILE_BUSINESS_ACCESS_DENIED",
              "无权更新该文件",
              403,
            );
          }
          if (file.createdBy !== user.id) {
            if (file.projectId == null) {
              throw new AppError(
                "FILE_BUSINESS_ACCESS_DENIED",
                "No write access to this file",
                403,
              );
            }
            await requireProjectWriteAccess(connection, file.projectId, user);
          }
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
          const fileAccess = buildFileAccessScope(user),
            [access] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.classification FROM file_object f WHERE f.id=? AND f.status='ACTIVE' AND f.is_deleted=0 AND (${fileAccess.sql})`,
              [
                input.fileId,
                ...fileAccess.params,
              ],
            );
          if (!access[0])
            throw new AppError("BUSINESS_ACCESS_DENIED", "无权查看该文件", 403);
          if (
            access[0].classification === "SENSITIVE" &&
            !user.permissionCodes.includes("file.sensitive.read")
          )
            throw new AppError("SENSITIVE_FILE_DENIED", "No access to sensitive file", 403);
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
          const fileAccess = buildFileAccessScope(user),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,f.classification,v.id versionId,v.storage_key storageKey FROM file_object f JOIN file_version v ON v.file_id=f.id AND ((? IS NULL AND v.version_number=f.current_version) OR v.id=?) WHERE f.id=? AND f.status='ACTIVE' AND v.status='ACTIVE' AND (${fileAccess.sql})`,
              [
                input.versionId ?? null,
                input.versionId ?? null,
                input.fileId,
                ...fileAccess.params,
              ],
            );
          const file = rows[0];
          if (!file) {
            const [deniedFiles] = await connection.execute<RowDataPacket[]>(
              `SELECT f.id,v.id versionId FROM file_object f JOIN file_version v ON v.file_id=f.id AND ((? IS NULL AND v.version_number=f.current_version) OR v.id=?) WHERE f.id=? AND f.status='ACTIVE' AND v.status='ACTIVE'`,
              [
                input.versionId ?? null,
                input.versionId ?? null,
                input.fileId,
              ],
            );
            if (deniedFiles[0])
              await connection.execute(
                `INSERT INTO file_access_log(file_id,version_id,user_id,action,outcome,denial_code,request_id) VALUES(?,?,?,'DOWNLOAD','DENIED','BUSINESS_ACCESS_DENIED',?)`,
                [
                  deniedFiles[0].id,
                  deniedFiles[0].versionId,
                  user.id,
                  requestId,
                ],
              );
            throw new AppError("BUSINESS_ACCESS_DENIED", "无权下载该文件", 403);
          }
          if (
            file.classification === "SENSITIVE" &&
            !user.permissionCodes.includes("file.sensitive.read")
          ) {
            await connection.execute(
              `INSERT INTO file_access_log(file_id,version_id,user_id,action,outcome,denial_code,request_id) VALUES(?,?,?,'DOWNLOAD','DENIED','SENSITIVE_FILE_DENIED',?)`,
              [file.id, file.versionId, user.id, requestId],
            );
            throw new AppError("SENSITIVE_FILE_DENIED", "无权下载该文件", 403);
          }
          const url = await this.createTemporaryUrl(
            file.storageKey,
            DOWNLOAD_URL_TTL_SECONDS,
          );
          await connection.execute(
            `INSERT INTO file_access_log(file_id,version_id,user_id,action,outcome,request_id) VALUES(?,?,?,'DOWNLOAD','SUCCESS',?)`,
            [file.id, file.versionId, user.id, requestId],
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
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM mkt_lead WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) FOR UPDATE`,
            [input.leadId, all ? 1 : 0, user.employeeId, user.id],
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
                    estimated_cost estimatedCost,estimated_profit estimatedProfit,status,version,CAST(created_by AS CHAR) createdBy
               FROM prj_project_application WHERE is_deleted=0 AND (?=1 OR applicant_id=? OR proposed_manager_id=?)
                AND (?='' OR project_name LIKE ? ESCAPE '\\\\' OR application_code LIKE ? ESCAPE '\\\\')
               ORDER BY id DESC LIMIT ? OFFSET ?`,
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
        case "project.application.detail": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,application_code code,project_name projectName,CAST(customer_id AS CHAR) customerId,CAST(source_lead_id AS CHAR) sourceLeadId,project_type projectType,background,service_scope serviceScope,estimated_revenue estimatedRevenue,estimated_cost estimatedCost,estimated_start_on estimatedStartOn,estimated_end_on estimatedEndOn,CAST(proposed_manager_id AS CHAR) proposedManagerId,bidding_method biddingMethod,risk_description riskDescription,necessity,status,version FROM prj_project_application WHERE id=? AND is_deleted=0 AND (?=1 OR created_by=? OR applicant_id=? OR proposed_manager_id=?)`,
              [
                input.applicationId,
                all ? 1 : 0,
                user.id,
                user.employeeId,
                user.employeeId,
              ],
            );
          if (!rows[0])
            throw new AppError(
              "PROJECT_APPLICATION_NOT_FOUND",
              "立项申请不存在或无权访问",
              404,
            );
          const [members] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(employee_id AS CHAR) employeeId,proposed_role proposedRole FROM prj_application_member_suggestion WHERE application_id=? ORDER BY employee_id`,
            [input.applicationId],
          );
          return { application: rows[0], memberSuggestions: members };
        }
        case "project.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            projectScope = buildProjectDataScope(user);
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT DISTINCT CAST(p.id AS CHAR) id,p.project_code code,p.project_name projectName,p.status,
                    CAST(p.project_manager_id AS CHAR) projectManagerId,pm.name managerName
               FROM prj_project p JOIN org_employee pm ON pm.id=p.project_manager_id
              WHERE p.is_deleted=0 AND ${projectScope.sql}
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR p.project_code LIKE ? ESCAPE '\\\\')
               ORDER BY p.id DESC LIMIT ? OFFSET ?`,
            [
              ...projectScope.params,
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
          const projectScope = buildProjectDataScope(user),
            [projects] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(p.id AS CHAR) id,CAST(p.application_id AS CHAR) applicationId,p.project_code code,p.project_name projectName,p.project_type projectType,p.service_scope serviceScope,p.status,p.estimated_revenue estimatedRevenue,p.estimated_cost estimatedCost,p.project_manager_id projectManagerId,c.name customerName,e.name managerName FROM prj_project p JOIN crm_counterparty c ON c.id=p.customer_id JOIN org_employee e ON e.id=p.project_manager_id JOIN org_employee pm ON pm.id=p.project_manager_id WHERE p.id=? AND p.is_deleted=0 AND ${projectScope.sql}`,
              [input.projectId, ...projectScope.params],
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
            ),
            [timeline] = await connection.execute<RowDataPacket[]>(
              `SELECT eventType,title,eventAt,status FROM (
                SELECT 'PROJECT' eventType,CONCAT('项目立项：',p.project_name) title,p.created_at eventAt,p.status FROM prj_project p WHERE p.id=?
                UNION ALL SELECT 'START',CONCAT('项目启动：',start_type),created_at,status FROM prj_start WHERE project_id=?
                UNION ALL SELECT 'STAGE',CONCAT('阶段：',stage_name),created_at,status FROM prj_stage WHERE project_id=? AND is_deleted=0
                UNION ALL SELECT 'PROGRESS','提交项目进展',created_at,'RECORDED' FROM prj_progress WHERE project_id=?
                UNION ALL SELECT 'RISK',CONCAT('风险问题：',title),created_at,status FROM prj_risk_issue WHERE project_id=? AND is_deleted=0
                UNION ALL SELECT 'DELIVERABLE',CONCAT('成果：',deliverable_name),created_at,status FROM prj_deliverable WHERE project_id=? AND is_deleted=0
                UNION ALL SELECT 'ACCEPTANCE',CONCAT('验收：',acceptance_type),created_at,status FROM prj_acceptance WHERE project_id=?
                UNION ALL SELECT 'CONTRACT',CONCAT('合同：',contract_name),created_at,status FROM con_contract WHERE project_id=? AND is_deleted=0
                UNION ALL SELECT 'CLOSE','项目结项申请',created_at,status FROM prj_close_application WHERE project_id=?
              ) events ORDER BY eventAt DESC LIMIT 200`,
              [
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
              ],
            ),
            [approvalRecords] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(i.id AS CHAR) id,i.instance_code instanceCode,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.title,i.status,i.submitted_at submittedAt,i.completed_at completedAt,u.username applicantName
                 FROM wf_instance i LEFT JOIN iam_user u ON u.id=i.applicant_id
                WHERE (i.business_type='PROJECT_APPLICATION' AND i.business_id=?)
                   OR (i.business_type='PROJECT_START' AND i.business_id IN (SELECT id FROM prj_start WHERE project_id=?))
                   OR (i.business_type='PROJECT_CHANGE' AND i.business_id IN (SELECT id FROM prj_change WHERE project_id=?))
                   OR (i.business_type='PROJECT_ACCEPTANCE' AND i.business_id IN (SELECT id FROM prj_acceptance WHERE project_id=?))
                   OR (i.business_type='PROJECT_CLOSE' AND i.business_id IN (SELECT id FROM prj_close_application WHERE project_id=?))
                ORDER BY i.submitted_at DESC,i.id DESC LIMIT 100`,
              [
                project.applicationId,
                input.projectId,
                input.projectId,
                input.projectId,
                input.projectId,
              ],
            ),
            [auditLogs] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(a.id AS CHAR) id,a.request_id requestId,a.action,a.resource_type resourceType,a.resource_id resourceId,a.outcome,a.occurred_at occurredAt,u.username
                 FROM sys_audit_log a LEFT JOIN iam_user u ON u.id=a.actor_user_id
                WHERE a.resource_id=? AND (a.action LIKE 'project.%' OR a.action LIKE 'file.%' OR a.action LIKE 'approval.%')
                ORDER BY a.occurred_at DESC LIMIT 100`,
              [input.projectId],
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
            timeline,
            approvalRecords,
            auditLogs,
            money: canReadFinancial ? money[0] : {},
            financialVisible: canReadFinancial,
          };
        }
        case "bid.application.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            projectAccess = buildProjectReferenceScope(user, "b.project_id");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(b.id AS CHAR) id,CAST(b.project_id AS CHAR) projectId,b.bid_code code,p.project_name projectName,b.deadline_at deadlineAt,b.status
               FROM bid_application b JOIN prj_project p ON p.id=b.project_id
              WHERE b.is_deleted=0 AND (b.business_owner_id=? OR b.technical_owner_id=? OR b.pricing_owner_id=? OR ${projectAccess.sql})
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR b.bid_code LIKE ? ESCAPE '\\\\')
               ORDER BY b.id DESC LIMIT ? OFFSET ?`,
            [
              user.employeeId,
              user.employeeId,
              user.employeeId,
              ...projectAccess.params,
              keyword,
              pattern,
              pattern,
              pageSize,
              (page - 1) * pageSize,
            ],
          );
          return { items: rows, page, pageSize };
        }
        case "organization.employee.options": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,employee_code employeeCode,name,position_name positionName FROM org_employee WHERE account_status='ENABLED' AND is_deleted=0 ORDER BY name LIMIT 500`,
          );
          return { items: rows };
        }
        case "bid.detail": {
          const projectAccess = buildProjectReferenceScope(user, "b.project_id"),
            [bids] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(b.id AS CHAR) id,b.bid_code code,CAST(b.project_id AS CHAR) projectId,p.project_name projectName,b.deadline_at deadlineAt,b.status FROM bid_application b JOIN prj_project p ON p.id=b.project_id WHERE b.id=? AND b.is_deleted=0 AND (b.business_owner_id=? OR b.technical_owner_id=? OR b.pricing_owner_id=? OR ${projectAccess.sql})`,
              [
                input.bidId,
                user.employeeId,
                user.employeeId,
                user.employeeId,
                ...projectAccess.params,
              ],
            );
          if (!bids[0])
            throw new AppError(
              "BID_NOT_FOUND",
              "投标申请不存在或无权访问",
              404,
            );
          const [tasks] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,task_type taskType,task_name taskName,CAST(assignee_id AS CHAR) assigneeId,collaborator_ids collaboratorIds,starts_at startsAt,due_at dueAt,delivery_requirement deliveryRequirement,completion_description completionDescription,CAST(checker_id AS CHAR) checkerId,status FROM bid_task WHERE bid_id=? AND is_deleted=0 ORDER BY due_at,id`,
              [input.bidId],
            ),
            [checks] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(id AS CHAR) id,check_item checkItem,check_standard checkStandard,CAST(responsible_id AS CHAR) responsibleId,result,issue_description issueDescription,CAST(rectifier_id AS CHAR) rectifierId,rectification_due_at rectificationDueAt,recheck_result recheckResult,version FROM bid_check WHERE bid_id=? AND is_deleted=0 ORDER BY id`,
              [input.bidId],
            ),
            [results] = await connection.execute<RowDataPacket[]>(
              `SELECT opened_on openedOn,quoted_amount quotedAmount,ranking,result,winning_amount winningAmount,loss_reason lossReason,retrospective FROM bid_result WHERE bid_id=?`,
              [input.bidId],
            ),
            [partners] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(x.id AS CHAR) id,c.name partnerName,f.name finalCustomerName,x.cooperation_type cooperationType,x.our_quotation ourQuotation,x.result,x.description FROM bid_partner_cooperation x JOIN crm_counterparty c ON c.id=x.partner_id JOIN crm_counterparty f ON f.id=x.final_customer_id WHERE x.project_id=? AND x.is_deleted=0 ORDER BY x.id DESC`,
              [bids[0].projectId],
            );
          return {
            bid: bids[0],
            tasks,
            checks,
            result: results[0] ?? null,
            partners,
          };
        }
        case "contract.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            keyword = (input.keyword as string | undefined) ?? "",
            pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`,
            projectAccess = buildProjectReferenceScope(user, "c.project_id");
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(c.id AS CHAR) id,c.contract_code code,c.contract_name contractName,c.contract_type contractType,v.name partyBName,
                    CAST(c.project_id AS CHAR) projectId,CAST(c.party_a_id AS CHAR) partyAId,CAST(c.party_b_id AS CHAR) partyBId,
                    c.tax_inclusive_amount taxInclusiveAmount,c.tax_exclusive_amount taxExclusiveAmount,c.amount_status amountStatus,c.status,COALESCE((SELECT SUM(pa.requested_amount) FROM fin_payment_application pa WHERE pa.source_type='EXPENSE_CONTRACT' AND pa.source_id=c.id AND pa.status<>'REJECTED'),0) paymentAppliedAmount
               FROM con_contract c JOIN crm_counterparty v ON v.id=c.party_b_id WHERE c.is_deleted=0 AND (c.owner_id=? OR ${projectAccess.sql})
                AND (?='' OR c.contract_name LIKE ? ESCAPE '\\\\' OR c.contract_code LIKE ? ESCAPE '\\\\')
               ORDER BY c.id DESC LIMIT ? OFFSET ?`,
            [
              user.employeeId,
              ...projectAccess.params,
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
          const projectAccess = buildProjectReferenceScope(user, "c.project_id"),
            [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(c.id AS CHAR) id,c.contract_code code,c.contract_name contractName,c.contract_type contractType,c.tax_inclusive_amount taxInclusiveAmount,c.tax_exclusive_amount taxExclusiveAmount,c.tax_rate taxRate,c.tax_amount taxAmount,c.expires_on expiresOn,c.contract_version contractVersion,c.status FROM con_contract c WHERE c.id=? AND c.is_deleted=0 AND (c.owner_id=? OR ${projectAccess.sql})`,
              [input.contractId, user.employeeId, ...projectAccess.params],
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
          const projectAccess = buildProjectReferenceScope(user, "c.project_id"),
            expiryDays = await loadNumberParameter(
              connection,
              "reminder.contract_expiry_days",
              30,
            );
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(CASE WHEN contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') THEN tax_exclusive_amount ELSE 0 END),0) incomeAmount,COALESCE(SUM(CASE WHEN contract_type='EXPENSE' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED') THEN tax_exclusive_amount ELSE 0 END),0) expenseAmount,SUM(CASE WHEN expires_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL ${expiryDays} DAY) AND status IN('PENDING_SIGNATURE','PERFORMING') THEN 1 ELSE 0 END) expiringCount FROM con_contract c WHERE c.is_deleted=0 AND (c.owner_id=? OR ${projectAccess.sql})`,
            [user.employeeId, ...projectAccess.params],
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
            `SELECT status,project_id projectId FROM con_contract WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.contractId],
          );
          if (!rows[0] || rows[0].status !== "PENDING_SIGNATURE")
            throw new AppError(
              "CONTRACT_NOT_ACTIVATABLE",
              "只有待签署合同可确认生效",
              409,
            );
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          await connection.execute(
            `UPDATE con_contract SET signed_on=?,effective_on=?,status='PERFORMING',updated_by=?,version=version+1 WHERE id=?`,
            [input.signedOn, input.effectiveOn, user.id, input.contractId],
          );
          await connection.execute(
            `UPDATE prj_start SET contract_reminder_active=0,updated_by=?,version=version+1 WHERE project_id=? AND start_type='EARLY' AND contract_reminder_active=1`,
            [user.id, rows[0].projectId],
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
            DEPOSIT: {
              table: "fin_deposit",
              statusColumn: "status",
            },
            DEPOSIT_LOSS: {
              table: "fin_deposit_event",
              statusColumn: "status",
            },
            DAILY_PURCHASE: {
              table: "fin_daily_purchase",
              statusColumn: "status",
            },
            PROJECT_START: { table: "prj_start", statusColumn: "status" },
            PROJECT_CHANGE: { table: "prj_change", statusColumn: "status" },
            PROJECT_ACCEPTANCE: {
              table: "prj_acceptance",
              statusColumn: "status",
            },
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
          await requireProjectWriteAccess(
            connection,
            await resolveApprovalBusinessProjectId(
              connection,
              input.businessType,
              input.businessId,
            ),
            user,
          );
          const [submitted] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(h.instance_id AS CHAR) instanceId,CAST(h.operator_id AS CHAR) operatorId,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status FROM wf_action_history h JOIN wf_instance i ON i.id=h.instance_id WHERE h.action_key=? FOR UPDATE`,
            [input.actionKey],
          );
          if (submitted[0]) {
            if (
              submitted[0].operatorId !== user.id ||
              submitted[0].businessType !== input.businessType ||
              submitted[0].businessId !== input.businessId
            )
              throw new AppError(
                "IDEMPOTENCY_KEY_REUSED",
                "幂等键已用于其他业务请求",
                409,
              );
            return {
              idempotent: true,
              instanceId: submitted[0].instanceId,
              status: submitted[0].status,
            };
          }
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
          if (input.businessType === "INVOICE_APPLICATION")
            await assertInvoiceApplicationCapacityForSubmit(
              connection,
              input.businessId,
            );
          if (input.businessType === "PROJECT_PAYMENT")
            await assertPaymentApplicationSourceForSubmit(
              connection,
              input.businessId,
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
            `INSERT INTO wf_action_history(action_key,instance_id,action,operator_id) VALUES(?,?,'SUBMIT',?)`,
            [input.actionKey, instanceId, user.id],
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
          return { idempotent: false, instanceId, status: "PENDING" };
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
            sql = `SELECT CAST(t.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,i.business_type businessType,CAST(i.business_id AS CHAR) businessId,i.status,t.status taskStatus,t.position_code positionCode,t.completed_at occurredAt,0 canAct FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id WHERE t.completed_by=? AND t.status IN ('APPROVED','RETURNED','REJECTED') ORDER BY t.completed_at DESC LIMIT ? OFFSET ?`;
            params = [user.employeeId, pageSize, offset];
          }
          const [rows] = await connection.execute<RowDataPacket[]>(sql, params);
          return { items: rows, page, pageSize };
        }
        case "approval.task.action": {
          const [existing] = await connection.execute<RowDataPacket[]>(
            "SELECT CAST(task_id AS CHAR) taskId,action,CAST(operator_id AS CHAR) operatorId FROM wf_action_history WHERE action_key=? LIMIT 1",
            [input.actionKey],
          );
          if (existing[0]) {
            if (
              existing[0].operatorId !== user.id ||
              existing[0].taskId !== input.taskId ||
              existing[0].action !== input.action
            )
              throw new AppError(
                "IDEMPOTENCY_KEY_REUSED",
                "幂等键已用于其他审批动作",
                409,
              );
            return { idempotent: true, status: existing[0].action };
          }
          const [rows] = await connection.execute<ApprovalTaskRow[]>(
            `SELECT CAST(t.id AS CHAR) task_id,CAST(t.instance_id AS CHAR) instance_id,t.node_order,t.position_code,CAST(t.assignee_id AS CHAR) assignee_id,
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
              if (task.business_type === "PROJECT_CLOSE") {
                const [closeRows] = await connection.execute<RowDataPacket[]>(
                  `SELECT close_type closeType FROM prj_close_application WHERE id=? FOR UPDATE`,
                  [task.business_id],
                );
                if (!closeRows[0])
                  throw new AppError(
                    "PROJECT_CLOSE_NOT_FOUND",
                    "项目结项申请不存在",
                    404,
                  );
                validateSpecialCloseFinalApprover(
                  String(closeRows[0].closeType),
                  task.position_code,
                );
              }
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
              `UPDATE wf_task SET status=CASE WHEN id=? THEN ? ELSE 'CANCELLED' END,completed_at=NOW(3),completed_by=CASE WHEN id=? THEN ? ELSE completed_by END WHERE instance_id=? AND status IN ('PENDING','WAITING')`,
              [
                task.task_id,
                status,
                task.task_id,
                user.employeeId,
                task.instance_id,
              ],
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
            "SELECT CAST(instance_id AS CHAR) instanceId,action,CAST(operator_id AS CHAR) operatorId FROM wf_action_history WHERE action_key=? LIMIT 1",
            [input.actionKey],
          );
          if (existing[0]) {
            if (
              existing[0].operatorId !== user.id ||
              existing[0].instanceId !== input.instanceId ||
              existing[0].action !== "WITHDRAW"
            )
              throw new AppError(
                "IDEMPOTENCY_KEY_REUSED",
                "幂等键已用于其他审批动作",
                409,
              );
            return { idempotent: true, status: "WITHDRAWN" };
          }
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
          await requireProjectWriteAccess(
            connection,
            await resolveApprovalBusinessProjectId(
              connection,
              instance.businessType,
              instance.businessId,
            ),
            user,
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
          const projectId = (input.projectId as string | undefined) ?? null;
          const access = buildProjectReferenceScope(user, "x.project_id");
          const [invoiceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.tax_inclusive_amount),0) amount FROM fin_sales_invoice x WHERE x.is_reversed=0 AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          const [receiptRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.amount),0) amount FROM fin_receipt x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          const [paymentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.amount),0) amount FROM fin_payment_detail x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          return {
            invoicedAmount: invoiceRows[0]?.amount ?? "0.00",
            receivedAmount: receiptRows[0]?.amount ?? "0.00",
            paidAmount: paymentRows[0]?.amount ?? "0.00",
          };
        }
        case "finance.documents": {
          const projectId = (input.projectId as string | undefined) ?? null,
            access = buildProjectReferenceScope(user, "x.project_id");
          const [applications] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.application_code code,x.project_id projectId,x.contract_id contractId,x.requested_amount requestedAmount,x.status FROM fin_invoice_application x WHERE x.is_deleted=0 AND (? IS NULL OR x.project_id=?) AND ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            [projectId, projectId, ...access.params],
          );
          const [receipts] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.receipt_code code,x.project_id projectId,x.contract_id contractId,x.amount,x.receipt_type receiptType,COALESCE((SELECT SUM(a.allocated_amount) FROM fin_receipt_invoice_allocation a WHERE a.receipt_id=x.id AND a.status='ACTIVE'),0) allocatedAmount FROM fin_receipt x WHERE x.status='ACTIVE' AND (? IS NULL OR x.project_id=?) AND ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            [projectId, projectId, ...access.params],
          );
          const [invoices] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.invoice_number invoiceNumber,x.project_id projectId,x.contract_id contractId,x.tax_inclusive_amount amount,x.status,COALESCE((SELECT SUM(a.allocated_amount) FROM fin_receipt_invoice_allocation a WHERE a.invoice_id=x.id AND a.status='ACTIVE'),0) allocatedAmount FROM fin_sales_invoice x WHERE x.is_reversed=0 AND (? IS NULL OR x.project_id=?) AND ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            [projectId, projectId, ...access.params],
          );
          return { applications, receipts, invoices };
        }
        case "sales.invoice.create": {
          const [applications] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,contract_id contractId,requested_amount requestedAmount,status FROM fin_invoice_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.applicationId],
          );
          const application = applications[0];
          if (
            !application ||
            !["PENDING_INVOICE", "PARTIALLY_INVOICED"].includes(
              application.status,
            )
          )
            throw new AppError(
              "INVOICE_APPLICATION_NOT_APPROVED",
              "只有审批通过的开票申请才能完成开票",
              409,
            );
          await requireProjectWriteAccess(connection, application.projectId, user);
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
          await connection.execute(
            `UPDATE fin_invoice_application SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [
              completed ? "COMPLETED" : "PARTIALLY_INVOICED",
              user.id,
              input.applicationId,
            ],
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
          await requireProjectWriteAccess(connection, receipt.projectId, user);
          await requireProjectWriteAccess(connection, invoice.projectId, user);
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
            `SELECT project_id projectId,tax_inclusive_amount amount,status FROM con_contract WHERE id=? AND contract_type='INCOME' AND is_deleted=0 FOR UPDATE`,
            [input.contractId],
          );
          const contract = contracts[0];
          if (
            !contract ||
            !["PENDING_SIGNATURE", "PERFORMING", "COMPLETED"].includes(
              contract.status,
            )
          )
            throw new AppError("INCOME_CONTRACT_INVALID", "收入合同无效", 409);
          if (String(contract.projectId) !== String(input.projectId))
            throw new AppError(
              "INVOICE_CONTRACT_PROJECT_MISMATCH",
              "开票申请与合同项目不一致",
              409,
            );
          await requireProjectWriteAccess(connection, contract.projectId, user);
          const [usedRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_inclusive_amount),0) used FROM fin_sales_invoice WHERE contract_id=? AND is_reversed=0`,
            [input.contractId],
          );
          const reservedAmount = await readOutstandingInvoiceApplicationAmount(
            connection,
            input.contractId,
          );
          const available =
            Number(contract.amount) -
            Number(usedRows[0]?.used ?? 0) -
            reservedAmount;
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
              user.employeeId,
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const [contracts] = await connection.execute<RowDataPacket[]>(
            `SELECT id,CAST(party_a_id AS CHAR) partyAId,CAST(party_b_id AS CHAR) partyBId FROM con_contract WHERE id=? AND project_id=? AND contract_type='INCOME' AND is_deleted=0 LIMIT 1`,
            [input.contractId, input.projectId],
          );
          const contract = contracts[0];
          if (!contract)
            throw new AppError(
              "RECEIPT_CONTRACT_NOT_FOUND",
              "Income contract not found in the same project",
              404,
            );
          if (
            ![String(contract.partyAId), String(contract.partyBId)].includes(
              String(input.customerId),
            )
          )
            throw new AppError(
              "RECEIPT_CUSTOMER_CONTRACT_MISMATCH",
              "Receipt customer must match the income contract party",
              409,
            );
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [customers] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.customerId, all ? 1 : 0, user.employeeId],
          );
          if (!customers[0])
            throw new AppError(
              "RECEIPT_CUSTOMER_NOT_FOUND",
              "Customer not found or access denied",
              404,
            );
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
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "reimbursement.create": {
          await requireProjectWriteAccess(connection, input.projectId ?? null, user);
          const code = await allocateNumber(connection, "REIMBURSEMENT");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_reimbursement(reimbursement_code,claimant_id,department_id,project_id,reason,payment_recipient,receiving_account,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              code,
              user.employeeId,
              user.departmentId,
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
          const reimbursementAccess = buildProjectReferenceScope(
              user,
              "h.project_id",
            ),
            purchaseAccess = buildProjectReferenceScope(user, "c.project_id"),
            [reimbursements] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(h.id AS CHAR) id,CAST(h.project_id AS CHAR) projectId,h.reimbursement_code code,h.reason,h.payment_recipient paymentRecipient,h.receiving_account receivingAccount,h.approval_status approvalStatus,h.payment_status paymentStatus,h.created_at createdAt,EXISTS(SELECT 1 FROM fin_payment_application pa WHERE pa.source_type='REIMBURSEMENT' AND pa.source_id=h.id) hasPaymentApplication,COALESCE(SUM(d.amount),0) totalAmount FROM fin_reimbursement h LEFT JOIN fin_reimbursement_detail d ON d.reimbursement_id=h.id AND d.status='ACTIVE' WHERE h.is_deleted=0 AND (h.claimant_id=? OR ${reimbursementAccess.sql}) GROUP BY h.id ORDER BY h.id DESC LIMIT 100`,
              [user.employeeId, ...reimbursementAccess.params],
            ),
            [purchases] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(p.id AS CHAR) id,p.purchase_code code,p.purchase_type purchaseType,p.item_description itemDescription,p.quantity,p.budget_amount budgetAmount,p.expected_on expectedOn,p.status,p.contract_related contractRelated,CAST(c.project_id AS CHAR) projectId,s.name supplierName,s.bank_account receivingAccount,EXISTS(SELECT 1 FROM fin_payment_application pa WHERE pa.source_type='PURCHASE' AND pa.source_id=p.id AND pa.status<>'REJECTED') hasPaymentApplication,p.created_at createdAt FROM fin_daily_purchase p LEFT JOIN con_contract c ON c.id=p.contract_id LEFT JOIN crm_counterparty s ON s.id=p.supplier_id WHERE p.is_deleted=0 AND (p.applicant_id=? OR ${purchaseAccess.sql}) ORDER BY p.id DESC LIMIT 100`,
              [user.employeeId, ...purchaseAccess.params],
            );
          return { reimbursements, purchases };
        }
        case "finance.operations": {
          const access = buildProjectReferenceScope(user, "x.project_id"),
            depositEventAccess = buildProjectReferenceScope(user, "d.project_id");
          const [payments] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.payment_code code,x.project_id projectId,x.recipient_name recipientName,x.requested_amount requestedAmount,x.receiving_account receivingAccount,x.status,COALESCE((SELECT SUM(d.amount) FROM fin_payment_detail d WHERE d.payment_id=x.id AND d.status='ACTIVE'),0) paidAmount FROM fin_payment_application x WHERE ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            access.params,
          );
          const [plans] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.plan_code code,x.project_id projectId,c.name partnerName,x.current_version currentVersion,x.status,CAST(v.id AS CHAR) versionId,v.settlement_method settlementMethod,v.ratio,v.fixed_amount fixedAmount,v.calculation_basis calculationBasis,v.effective_from effectiveFrom,v.status versionStatus FROM partner_plan x JOIN crm_counterparty c ON c.id=x.partner_id LEFT JOIN partner_plan_version v ON v.plan_id=x.id AND v.version_number=x.current_version WHERE x.is_deleted=0 AND x.status IN('DRAFT','ENABLED') AND ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            access.params,
          );
          const [settlements] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.settlement_code code,x.project_id projectId,c.name partnerName,x.net_settlement_amount netAmount,x.invoice_requirement invoiceRequirement,x.payment_status paymentStatus,x.status,EXISTS(SELECT 1 FROM fin_payment_application pa WHERE pa.source_type='PARTNER_SETTLEMENT' AND pa.source_id=x.id) hasPaymentApplication FROM partner_settlement x JOIN crm_counterparty c ON c.id=x.partner_id WHERE ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            access.params,
          );
          const [deposits] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.deposit_code code,x.project_id projectId,x.direction,c.name counterpartyName,x.amount,x.account,x.occupied_amount occupiedAmount,x.loss_confirmed_amount lossAmount,x.status,EXISTS(SELECT 1 FROM fin_payment_application pa WHERE pa.source_type='DEPOSIT' AND pa.source_id=x.id) hasPaymentApplication FROM fin_deposit x JOIN crm_counterparty c ON c.id=x.counterparty_id WHERE ${access.sql} ORDER BY x.id DESC LIMIT 200`,
            access.params,
          );
          const [depositEvents] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(e.id AS CHAR) id,CAST(e.deposit_id AS CHAR) depositId,d.deposit_code depositCode,e.event_type eventType,e.amount,e.occurred_on occurredOn,e.status FROM fin_deposit_event e JOIN fin_deposit d ON d.id=e.deposit_id WHERE ${depositEventAccess.sql} ORDER BY e.id DESC LIMIT 200`,
            depositEventAccess.params,
          );
          return { payments, plans, settlements, deposits, depositEvents };
        }
        case "payment.detail.create": {
          const [seen] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,CAST(payment_id AS CHAR) paymentId,CAST(project_id AS CHAR) projectId,amount,receiving_account receivingAccount,bank_reference bankReference,CAST(recorder_id AS CHAR) recorderId FROM fin_payment_detail WHERE idempotency_key=?`,
            [input.idempotencyKey],
          );
          if (seen[0]) {
            if (
              seen[0].recorderId !== user.employeeId ||
              seen[0].paymentId !== input.paymentId ||
              Math.abs(Number(seen[0].amount) - Number(input.amount)) > 0.005 ||
              seen[0].receivingAccount !== input.receivingAccount ||
              seen[0].bankReference !== input.bankReference
            )
              throw new AppError(
                "IDEMPOTENCY_KEY_REUSED",
                "幂等键已用于其他付款明细",
                409,
              );
            await requireProjectWriteAccess(connection, seen[0].projectId, user);
            return { idempotent: true, id: String(seen[0].id) };
          }
          const [payments] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,source_type sourceType,source_id sourceId,requested_amount requestedAmount,receiving_account receivingAccount,status FROM fin_payment_application WHERE id=? FOR UPDATE`,
            [input.paymentId],
          );
          const payment = payments[0];
          if (
            !payment ||
            !["PENDING_PAYMENT", "PARTIALLY_PAID"].includes(payment.status)
          )
            throw new AppError(
              "PAYMENT_NOT_APPROVED",
              "付款申请未审批或已完成",
              409,
            );
          await requireProjectWriteAccess(connection, payment.projectId, user);
          if (payment.receivingAccount !== input.receivingAccount)
            throw new AppError(
              "PAYMENT_RECEIVING_ACCOUNT_MISMATCH",
              "实际付款收款账户与付款申请不一致",
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
          if (payment.sourceType === "REIMBURSEMENT")
            await connection.execute(
              `UPDATE fin_reimbursement SET payment_status=?,updated_by=?,version=version+1 WHERE id=?`,
              [status, user.id, payment.sourceId],
            );
          if (payment.sourceType === "PARTNER_SETTLEMENT")
            await connection.execute(
              `UPDATE partner_settlement SET payment_status=?,updated_by=?,version=version+1 WHERE id=?`,
              [status, user.id, payment.sourceId],
            );
          if (payment.sourceType === "PURCHASE" && status === "PAID")
            await connection.execute(
              `UPDATE fin_daily_purchase SET status='COMPLETED',updated_by=?,version=version+1 WHERE id=? AND status='APPROVED'`,
              [user.id, payment.sourceId],
            );
          if (payment.sourceType === "DEPOSIT") {
            const [depositRows] = await connection.execute<RowDataPacket[]>(
              `SELECT amount,occupied_amount occupied FROM fin_deposit WHERE id=? AND direction='PAY' AND status IN('PENDING_PAYMENT','PAID') FOR UPDATE`,
              [payment.sourceId],
            );
            const deposit = depositRows[0];
            if (!deposit)
              throw new AppError(
                "DEPOSIT_PAYMENT_SOURCE_INVALID",
                "保证金付款来源状态异常",
                409,
              );
            const occupied = Number(deposit.occupied) + Number(input.amount);
            if (occupied > Number(deposit.amount))
              throw new AppError(
                "DEPOSIT_AMOUNT_EXCEEDED",
                "累计缴纳金额超过保证金登记金额",
                409,
              );
            await connection.execute(
              `INSERT INTO fin_deposit_event(deposit_id,event_type,amount,occurred_on,status,description,operator_id,idempotency_key,created_by,updated_by) VALUES(?,'PAY',?,?,'APPROVED',?,?,?,?,?)`,
              [
                payment.sourceId,
                input.amount,
                input.paidOn,
                `由付款申请 ${input.paymentId} 生成`,
                user.id,
                input.idempotencyKey,
                user.id,
                user.id,
              ],
            );
            await connection.execute(
              `UPDATE fin_deposit SET occupied_amount=?,paid_on=COALESCE(paid_on,?),status=?,updated_by=?,version=version+1 WHERE id=?`,
              [
                occupied,
                input.paidOn,
                occupied >= Number(deposit.amount) ? "PAID" : "PENDING_PAYMENT",
                user.id,
                payment.sourceId,
              ],
            );
          }
          return {
            idempotent: false,
            id: String(result.insertId),
            status,
            remainingAmount: Number(payment.requestedAmount) - total,
          };
        }
        case "payment.application.create": {
          let receivingAccount = input.receivingAccount;
          const sourceSql = {
            EXPENSE_CONTRACT: `SELECT c.project_id projectId,v.name recipientName,v.bank_account receivingAccount,c.status approvalStatus,'UNPAID' paymentStatus,c.tax_inclusive_amount sourceAmount FROM con_contract c JOIN crm_counterparty v ON v.id=c.party_b_id WHERE c.id=? AND c.contract_type='EXPENSE' AND c.amount_status='CONFIRMED' AND c.is_deleted=0 FOR UPDATE`,
            REIMBURSEMENT: `SELECT r.project_id projectId,r.payment_recipient recipientName,r.receiving_account receivingAccount,r.approval_status approvalStatus,r.payment_status paymentStatus,COALESCE((SELECT SUM(d.amount) FROM fin_reimbursement_detail d WHERE d.reimbursement_id=r.id AND d.status='ACTIVE'),0) sourceAmount FROM fin_reimbursement r WHERE r.id=? AND r.is_deleted=0 FOR UPDATE`,
            PARTNER_SETTLEMENT: `SELECT s.project_id projectId,c.name recipientName,'' receivingAccount,s.status approvalStatus,s.payment_status paymentStatus,s.net_settlement_amount sourceAmount FROM partner_settlement s JOIN crm_counterparty c ON c.id=s.partner_id WHERE s.id=? FOR UPDATE`,
            DEPOSIT: `SELECT g.project_id projectId,c.name recipientName,g.account receivingAccount,g.status approvalStatus,g.status paymentStatus,g.amount sourceAmount FROM fin_deposit g JOIN crm_counterparty c ON c.id=g.counterparty_id WHERE g.id=? AND g.direction='PAY' FOR UPDATE`,
            PURCHASE: `SELECT c.project_id projectId,s.name recipientName,s.bank_account receivingAccount,p.status approvalStatus,'UNPAID' paymentStatus,p.budget_amount sourceAmount FROM fin_daily_purchase p JOIN con_contract c ON c.id=p.contract_id AND c.is_deleted=0 JOIN crm_counterparty s ON s.id=p.supplier_id WHERE p.id=? AND p.contract_related=1 AND p.is_deleted=0 FOR UPDATE`,
          }[
            input.sourceType as
              | "EXPENSE_CONTRACT"
              | "REIMBURSEMENT"
              | "PARTNER_SETTLEMENT"
              | "DEPOSIT"
              | "PURCHASE"
          ];
          const [sources] = await connection.execute<RowDataPacket[]>(
            sourceSql,
            [input.sourceId],
          );
          const source = sources[0];
          if (!source)
            throw new AppError(
              "PAYMENT_SOURCE_NOT_FOUND",
              "付款来源不存在",
              404,
            );
          await requireProjectWriteAccess(connection, source.projectId, user);
          if (
            ["DEPOSIT", "EXPENSE_CONTRACT", "PURCHASE"].includes(
              input.sourceType,
            ) &&
            source.receivingAccount
          )
            receivingAccount = String(source.receivingAccount);
          const [existingPayments] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count,COALESCE(SUM(requested_amount),0) appliedAmount FROM fin_payment_application WHERE source_type=? AND source_id=? AND status<>'REJECTED'`,
            [input.sourceType, input.sourceId],
          );
          validatePaymentSource({
            sourceType: input.sourceType,
            source: {
              projectId: source.projectId,
              recipientName: source.recipientName,
              receivingAccount: source.receivingAccount,
              approvalStatus: source.approvalStatus,
              paymentStatus: source.paymentStatus,
              sourceAmount: source.sourceAmount,
            },
            application: {
              projectId: input.projectId,
              recipientName: input.recipientName,
              receivingAccount,
              requestedAmount: input.requestedAmount,
            },
            alreadyUsed: Number(existingPayments[0]?.count ?? 0) > 0,
            alreadyAppliedAmount: Number(
              existingPayments[0]?.appliedAmount ?? 0,
            ),
          });
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
              receivingAccount,
              input.invoiceRequired,
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          if (input.sourceType === "REIMBURSEMENT")
            await connection.execute(
              `UPDATE fin_reimbursement SET payment_status='PENDING_PAYMENT',updated_by=?,version=version+1 WHERE id=?`,
              [user.id, input.sourceId],
            );
          return { id: String(result.insertId), code };
        }
        case "daily.purchase.create": {
          if (input.supplierId) {
            const all = user.dataScopes.some((scope) => scope.type === "ALL");
            const [suppliers] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
              [input.supplierId, all ? 1 : 0, user.employeeId],
            );
            if (!suppliers[0])
              throw new AppError(
                "PURCHASE_SUPPLIER_NOT_FOUND",
                "Supplier not found or access denied",
                404,
              );
          }
          if (input.contractId) {
            const [contractRows] = await connection.execute<RowDataPacket[]>(
              `SELECT project_id projectId FROM con_contract WHERE id=? AND is_deleted=0`,
              [input.contractId],
            );
            if (!contractRows[0])
              throw new AppError("CONTRACT_NOT_FOUND", "合同不存在", 404);
            await requireProjectWriteAccess(connection, contractRows[0].projectId, user);
          }
          const code = await allocateNumber(connection, "DAILY_PURCHASE");
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO fin_daily_purchase(purchase_code,applicant_id,department_id,purchase_type,supplier_id,item_description,quantity,budget_amount,purpose,expected_on,payment_method,contract_related,contract_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              code,
              user.employeeId,
              user.departmentId,
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
        case "daily.purchase.complete": {
          const [purchases] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(p.applicant_id AS CHAR) applicantId,p.status,CAST(c.project_id AS CHAR) projectId
               FROM fin_daily_purchase p
               LEFT JOIN con_contract c ON c.id=p.contract_id AND c.is_deleted=0
              WHERE p.id=? AND p.is_deleted=0
              FOR UPDATE`,
            [input.purchaseId],
          );
          const purchase = purchases[0];
          if (!purchase || purchase.status !== "APPROVED")
            throw new AppError(
              "PURCHASE_NOT_COMPLETABLE",
              "Only approved daily purchase can be completed",
              409,
            );
          if (purchase.applicantId !== user.employeeId) {
            if (purchase.projectId == null)
              throw new AppError(
                "PURCHASE_COMPLETE_FORBIDDEN",
                "Daily purchase is outside the current user scope",
                403,
              );
            await requireProjectWriteAccess(connection, purchase.projectId, user);
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE fin_daily_purchase SET status='COMPLETED',updated_by=?,version=version+1 WHERE id=? AND status='APPROVED'`,
            [user.id, input.purchaseId],
          );
          if (!result.affectedRows)
            throw new AppError(
              "PURCHASE_NOT_COMPLETABLE",
              "只有审批通过的采购申请可以完成",
              409,
            );
          return { id: input.purchaseId, status: "COMPLETED" };
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
              user.employeeId,
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
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [counterparties] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.counterpartyId, all ? 1 : 0, user.employeeId],
          );
          if (!counterparties[0])
            throw new AppError(
              "COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
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
              user.employeeId,
              input.remark ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "crm.visit.create": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [counterparties] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.customerId, all ? 1 : 0, user.employeeId],
          );
          if (!counterparties[0])
            throw new AppError(
              "COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
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
              user.employeeId,
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
                user.employeeId,
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
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [customers] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.customerId, all ? 1 : 0, user.employeeId],
          );
          if (!customers[0])
            throw new AppError(
              "LEAD_CUSTOMER_NOT_FOUND",
              "Customer not found or access denied",
              404,
            );
          if (input.sourceVisitId) {
            const [visits] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM crm_visit WHERE id=? AND customer_id=? AND status='ACTIVE' AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) LIMIT 1`,
              [
                input.sourceVisitId,
                input.customerId,
                all ? 1 : 0,
                user.employeeId,
                user.id,
              ],
            );
            if (!visits[0])
              throw new AppError(
                "LEAD_SOURCE_VISIT_NOT_FOUND",
                "Source visit not found or access denied",
                404,
              );
          }
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
              user.employeeId,
              input.nextFollowUpAt ?? null,
              input.sourceVisitId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "lead.followUp.create": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [leads] = await connection.execute<RowDataPacket[]>(
            `SELECT status FROM mkt_lead WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) FOR UPDATE`,
            [input.leadId, all ? 1 : 0, user.employeeId, user.id],
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
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [customers] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.customerId, all ? 1 : 0, user.employeeId],
          );
          if (!customers[0])
            throw new AppError(
              "PROJECT_APPLICATION_CUSTOMER_NOT_FOUND",
              "Customer not found or access denied",
              404,
            );
          if (input.sourceLeadId) {
            const [sourceLeads] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM mkt_lead WHERE id=? AND customer_id=? AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) LIMIT 1`,
              [
                input.sourceLeadId,
                input.customerId,
                all ? 1 : 0,
                user.employeeId,
                user.id,
              ],
            );
            if (!sourceLeads[0])
              throw new AppError(
                "PROJECT_APPLICATION_SOURCE_LEAD_NOT_FOUND",
                "Source lead not found or access denied",
                404,
              );
          }
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
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          for (const member of input.memberSuggestions as Array<{
            employeeId: string;
            proposedRole: string;
          }>)
            await connection.execute(
              `INSERT INTO prj_application_member_suggestion(application_id,employee_id,proposed_role) VALUES(?,?,?)`,
              [result.insertId, member.employeeId, member.proposedRole],
            );
          return { id: String(result.insertId), code };
        }
        case "project.application.update": {
          const data = input.data as Record<string, any>,
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT status,version,CAST(created_by AS CHAR) createdBy FROM prj_project_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
              [input.applicationId],
            );
          const application = rows[0];
          if (!application)
            throw new AppError(
              "PROJECT_APPLICATION_NOT_FOUND",
              "立项申请不存在",
              404,
            );
          if (
            application.createdBy !== user.id &&
            !user.roleCodes.includes("ADMIN")
          )
            throw new AppError(
              "PROJECT_APPLICATION_UPDATE_FORBIDDEN",
              "仅创建人可修改立项申请",
              403,
            );
          assertProjectApplicationEditable(String(application.status));
          if (Number(application.version) !== Number(input.version))
            throw new AppError(
              "PROJECT_APPLICATION_VERSION_CONFLICT",
              "立项申请已被修改，请刷新后重试",
              409,
            );
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [customers] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [data.customerId, all ? 1 : 0, user.employeeId],
          );
          if (!customers[0])
            throw new AppError(
              "PROJECT_APPLICATION_CUSTOMER_NOT_FOUND",
              "Customer not found or access denied",
              404,
            );
          if (data.sourceLeadId) {
            const [sourceLeads] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM mkt_lead WHERE id=? AND customer_id=? AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) LIMIT 1`,
              [
                data.sourceLeadId,
                data.customerId,
                all ? 1 : 0,
                user.employeeId,
                user.id,
              ],
            );
            if (!sourceLeads[0])
              throw new AppError(
                "PROJECT_APPLICATION_SOURCE_LEAD_NOT_FOUND",
                "Source lead not found or access denied",
                404,
              );
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE prj_project_application SET project_name=?,customer_id=?,source_lead_id=?,project_type=?,background=?,service_scope=?,estimated_revenue=?,estimated_cost=?,estimated_start_on=?,estimated_end_on=?,proposed_manager_id=?,bidding_method=?,risk_description=?,necessity=?,status='DRAFT',updated_by=?,version=version+1 WHERE id=? AND version=?`,
            [
              data.projectName,
              data.customerId,
              data.sourceLeadId ?? null,
              data.projectType,
              data.background ?? null,
              data.serviceScope,
              data.estimatedRevenue,
              data.estimatedCost,
              data.estimatedStartOn,
              data.estimatedEndOn,
              data.proposedManagerId,
              data.biddingMethod ?? null,
              data.riskDescription ?? null,
              data.necessity,
              user.id,
              input.applicationId,
              input.version,
            ],
          );
          if (!result.affectedRows)
            throw new AppError(
              "PROJECT_APPLICATION_VERSION_CONFLICT",
              "立项申请已被修改，请刷新后重试",
              409,
            );
          await connection.execute(
            `DELETE FROM prj_application_member_suggestion WHERE application_id=?`,
            [input.applicationId],
          );
          for (const member of data.memberSuggestions as Array<{
            employeeId: string;
            proposedRole: string;
          }>)
            await connection.execute(
              `INSERT INTO prj_application_member_suggestion(application_id,employee_id,proposed_role) VALUES(?,?,?)`,
              [input.applicationId, member.employeeId, member.proposedRole],
            );
          return {
            id: input.applicationId,
            status: "DRAFT",
            version: Number(input.version) + 1,
          };
        }
        case "bid.application.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const counterpartyIds = Array.from(
            new Set([input.tendererId, input.agencyId].filter(Boolean)),
          );
          const [counterparties] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id FROM crm_counterparty WHERE id IN (${counterpartyIds.map(() => "?").join(",")}) AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?)`,
            [...counterpartyIds, all ? 1 : 0, user.employeeId],
          );
          if (counterparties.length !== counterpartyIds.length)
            throw new AppError(
              "BID_COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
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
            `SELECT status,project_id projectId FROM bid_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.bidId],
          );
          if (!rows[0])
            throw new AppError("BID_NOT_FOUND", "投标申请不存在", 404);
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          const status = transitionBid(rows[0].status, input.action);
          await connection.execute(
            `UPDATE bid_application SET status=?,updated_by=?,version=version+1 WHERE id=?`,
            [status, user.id, input.bidId],
          );
          return { id: input.bidId, status };
        }
        case "bid.result.create": {
          const [bids] = await connection.execute<RowDataPacket[]>(
            `SELECT status,project_id projectId FROM bid_application WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.bidId],
          );
          if (!bids[0] || bids[0].status !== "OPENED")
            throw new AppError(
              "BID_NOT_OPENED",
              "只有已开标项目可登记结果",
              409,
            );
          await requireProjectWriteAccess(connection, bids[0].projectId, user);
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
        case "bid.task.create": {
          const [bids] = await connection.execute<RowDataPacket[]>(
            `SELECT status,project_id projectId FROM bid_application WHERE id=? AND is_deleted=0`,
            [input.bidId],
          );
          if (!bids[0])
            throw new AppError("BID_NOT_FOUND", "投标申请不存在", 404);
          await requireProjectWriteAccess(connection, bids[0].projectId, user);
          if (!["PREPARING", "SUBMITTED"].includes(String(bids[0].status)))
            throw new AppError(
              "BID_TASK_NOT_ALLOWED",
              "当前投标状态不能新增任务",
              409,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_task(bid_id,task_type,task_name,assignee_id,collaborator_ids,starts_at,due_at,delivery_requirement,checker_id,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?)`,
            [
              input.bidId,
              input.taskType,
              input.taskName,
              input.assigneeId,
              JSON.stringify(input.collaboratorIds),
              input.startsAt ?? null,
              input.dueAt,
              input.deliveryRequirement,
              input.checkerId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "bid.task.transition": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT t.status,t.assignee_id assigneeId,t.checker_id checkerId,b.project_id projectId
               FROM bid_task t
               JOIN bid_application b ON b.id=t.bid_id
              WHERE t.id=? AND t.is_deleted=0 AND b.is_deleted=0
              FOR UPDATE`,
            [input.taskId],
          );
          const task = rows[0];
          if (!task)
            throw new AppError("BID_TASK_NOT_FOUND", "投标任务不存在", 404);
          await requireProjectWriteAccess(connection, task.projectId, user);
          if (
            !user.dataScopes.some((scope) => scope.type === "ALL") &&
            ![String(task.assigneeId), String(task.checkerId)].includes(
              user.employeeId,
            )
          )
            throw new AppError("BID_TASK_FORBIDDEN", "无权处理该投标任务", 403);
          const status = transitionBidTask(task.status, input.action);
          if (input.action === "SUBMIT_CHECK" && !input.completionDescription)
            throw new AppError(
              "BID_TASK_COMPLETION_REQUIRED",
              "提交检查时必须填写完成说明",
              409,
            );
          await connection.execute(
            `UPDATE bid_task SET status=?,completion_description=COALESCE(?,completion_description),updated_by=?,version=version+1 WHERE id=?`,
            [
              status,
              input.completionDescription ?? null,
              user.id,
              input.taskId,
            ],
          );
          return { id: input.taskId, status };
        }
        case "bid.check.create": {
          const [bids] = await connection.execute<RowDataPacket[]>(
            `SELECT project_id projectId FROM bid_application WHERE id=? AND is_deleted=0`,
            [input.bidId],
          );
          if (!bids[0])
            throw new AppError("BID_NOT_FOUND", "投标申请不存在", 404);
          await requireProjectWriteAccess(connection, bids[0].projectId, user);
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_check(bid_id,check_item,check_standard,responsible_id,created_by,updated_by) VALUES(?,?,?,?,?,?)`,
            [
              input.bidId,
              input.checkItem,
              input.checkStandard,
              input.responsibleId,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "bid.check.result": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT c.id,c.responsible_id responsibleId,c.rectifier_id rectifierId,b.project_id projectId
               FROM bid_check c
               JOIN bid_application b ON b.id=c.bid_id
              WHERE c.id=? AND c.is_deleted=0 AND b.is_deleted=0
              FOR UPDATE`,
            [input.checkId],
          );
          if (!rows[0])
            throw new AppError("BID_CHECK_NOT_FOUND", "投标检查项不存在", 404);
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          if (
            !user.dataScopes.some((scope) => scope.type === "ALL") &&
            ![
              String(rows[0].responsibleId),
              String(rows[0].rectifierId),
            ].includes(user.employeeId)
          )
            throw new AppError("BID_CHECK_FORBIDDEN", "无权处理该检查项", 403);
          await connection.execute(
            `UPDATE bid_check SET result=?,issue_description=?,rectifier_id=?,rectification_due_at=?,recheck_result=?,updated_by=?,version=version+1 WHERE id=?`,
            [
              input.result,
              input.issueDescription ?? null,
              input.rectifierId ?? null,
              input.rectificationDueAt ?? null,
              input.recheckResult ?? null,
              user.id,
              input.checkId,
            ],
          );
          return {
            id: input.checkId,
            result: input.result,
            recheckResult: input.recheckResult ?? null,
          };
        }
        case "bid.partner.create": {
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          if (input.projectId)
            await requireProjectWriteAccess(connection, input.projectId, user);
          if (input.leadId) {
            const [leads] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(customer_id AS CHAR) customerId FROM mkt_lead WHERE id=? AND is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?) LIMIT 1`,
              [input.leadId, all ? 1 : 0, user.employeeId, user.id],
            );
            if (!leads[0])
              throw new AppError(
                "BID_PARTNER_LEAD_NOT_FOUND",
                "Lead not found or access denied",
                404,
              );
            if (String(leads[0].customerId) !== String(input.finalCustomerId))
              throw new AppError(
                "BID_PARTNER_LEAD_CUSTOMER_MISMATCH",
                "Final customer must match the source lead customer",
                409,
              );
          }
          const counterpartyIds = Array.from(
            new Set([input.partnerId, input.finalCustomerId]),
          );
          const [counterparties] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id FROM crm_counterparty WHERE id IN (${counterpartyIds.map(() => "?").join(",")}) AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?)`,
            [...counterpartyIds, all ? 1 : 0, user.employeeId],
          );
          if (counterparties.length !== counterpartyIds.length)
            throw new AppError(
              "BID_PARTNER_COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_partner_cooperation(project_id,lead_id,partner_id,final_customer_id,cooperation_type,registration_at,quotation_at,bidding_at,our_quotation,owner_id,result,description,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId ?? null,
              input.leadId ?? null,
              input.partnerId,
              input.finalCustomerId,
              input.cooperationType,
              input.registrationAt ?? null,
              input.quotationAt ?? null,
              input.biddingAt ?? null,
              input.ourQuotation ?? null,
              user.employeeId,
              input.result ?? null,
              input.description ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId) };
        }
        case "contract.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const partyIds = Array.from(new Set([input.partyAId, input.partyBId]));
          const [parties] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id FROM crm_counterparty WHERE id IN (${partyIds.map(() => "?").join(",")}) AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?)`,
            [...partyIds, all ? 1 : 0, user.employeeId],
          );
          if (parties.length !== partyIds.length)
            throw new AppError(
              "CONTRACT_COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
          if (input.parentContractId) {
            const [parents] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM con_contract WHERE id=? AND project_id=? AND is_deleted=0 LIMIT 1`,
              [input.parentContractId, input.projectId],
            );
            if (!parents[0])
              throw new AppError(
                "CONTRACT_PARENT_NOT_FOUND",
                "Parent contract not found in the same project",
                404,
              );
          }
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
              user.employeeId,
              input.parentContractId ?? null,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), code };
        }
        case "contract.change.create": {
          const [contracts] = await connection.execute<RowDataPacket[]>(
            `SELECT project_id projectId,tax_inclusive_amount taxInclusiveAmount,expires_on expiresOn,status FROM con_contract WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.contractId],
          );
          const contract = contracts[0];
          if (!contract)
            throw new AppError(
              "CONTRACT_NOT_FOUND",
              "合同不存在或无权访问",
              404,
            );
          await requireProjectWriteAccess(connection, contract.projectId, user);
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
          const [contracts] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,status FROM con_contract WHERE id=? AND is_deleted=0`,
            [input.contractId],
          );
          if (!contracts[0])
            throw new AppError(
              "CONTRACT_NOT_FOUND",
              "合同不存在或无权访问",
              404,
            );
          await requireProjectWriteAccess(connection, contracts[0].projectId, user);
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
          const [milestones] = await connection.execute<RowDataPacket[]>(
            `SELECT m.id,m.status,c.project_id projectId FROM con_contract_milestone m JOIN con_contract c ON c.id=m.contract_id WHERE m.id=? AND m.is_deleted=0 AND c.is_deleted=0 FOR UPDATE`,
            [input.milestoneId],
          );
          if (!milestones[0])
            throw new AppError(
              "CONTRACT_MILESTONE_NOT_FOUND",
              "履约节点不存在或无权访问",
              404,
            );
          await requireProjectWriteAccess(connection, milestones[0].projectId, user);
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [partners] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.partnerId, all ? 1 : 0, user.employeeId],
          );
          if (!partners[0])
            throw new AppError(
              "PARTNER_PLAN_COUNTERPARTY_NOT_FOUND",
              "Partner not found or access denied",
              404,
            );
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
            `INSERT INTO partner_plan(project_id,partner_id,plan_code,owner_id,status,created_by,updated_by) VALUES(?,?,?,?,'ENABLED',?,?)`,
            [
              input.projectId,
              input.partnerId,
              code,
              user.employeeId,
              user.id,
              user.id,
            ],
          );
          await connection.execute(
            `INSERT INTO partner_plan_version(plan_id,version_number,settlement_method,fixed_amount,ratio,calculation_basis,deductible_cost_scope,upper_limit,lower_limit,effective_from,effective_to,conditions,rounding_rule,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'ENABLED')`,
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
        case "partner.plan.version.create": {
          const [plans] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,current_version currentVersion FROM partner_plan WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.planId],
          );
          if (!plans[0])
            throw new AppError("PARTNER_PLAN_NOT_FOUND", "合作方案不存在", 404);
          await requireProjectWriteAccess(connection, plans[0].projectId, user);
          const [nextRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(MAX(version_number),0)+1 nextVersion FROM partner_plan_version WHERE plan_id=? FOR UPDATE`,
            [input.planId],
          );
          const nextVersion = Number(
            nextRows[0]?.nextVersion ?? Number(plans[0].currentVersion) + 1,
          );
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO partner_plan_version(plan_id,version_number,settlement_method,fixed_amount,ratio,calculation_basis,deductible_cost_scope,upper_limit,lower_limit,effective_from,effective_to,conditions,rounding_rule,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT')`,
            [
              input.planId,
              nextVersion,
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
          return {
            id: String(result.insertId),
            version: nextVersion,
            status: "DRAFT",
          };
        }
        case "partner.plan.version.activate": {
          const [versions] = await connection.execute<RowDataPacket[]>(
            `SELECT v.id,v.version_number versionNumber,v.settlement_method settlementMethod,v.ratio,v.calculation_basis calculationBasis,v.effective_from effectiveFrom,p.project_id projectId FROM partner_plan_version v JOIN partner_plan p ON p.id=v.plan_id WHERE v.id=? AND v.plan_id=? AND v.status='DRAFT' FOR UPDATE`,
            [input.versionId, input.planId],
          );
          const version = versions[0];
          if (!version)
            throw new AppError(
              "PARTNER_PLAN_VERSION_NOT_DRAFT",
              "待启用的方案版本不存在",
              409,
            );
          await requireProjectWriteAccess(connection, version.projectId, user);
          if (version.settlementMethod === "RATIO") {
            const [ratios] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(v.ratio),0) totalRatio FROM partner_plan p JOIN partner_plan_version v ON v.plan_id=p.id AND v.version_number=p.current_version WHERE p.project_id=? AND p.id<>? AND p.status='ENABLED' AND v.status='ENABLED' AND v.calculation_basis=?`,
              [version.projectId, input.planId, version.calculationBasis],
            );
            if (
              Number(ratios[0]?.totalRatio ?? 0) + Number(version.ratio ?? 0) >
              1.0000001
            )
              throw new AppError(
                "PARTNER_RATIO_EXCEEDED",
                "同项目同基数的有效合作比例合计不得超过100%",
                409,
              );
          }
          await connection.execute(
            `UPDATE partner_plan_version SET status='DISABLED',effective_to=CASE WHEN effective_to IS NULL OR effective_to>=? THEN DATE_SUB(?,INTERVAL 1 DAY) ELSE effective_to END WHERE plan_id=? AND status='ENABLED'`,
            [version.effectiveFrom, version.effectiveFrom, input.planId],
          );
          await connection.execute(
            `UPDATE partner_plan_version SET status='ENABLED' WHERE id=?`,
            [input.versionId],
          );
          await connection.execute(
            `UPDATE partner_plan SET current_version=?,status='ENABLED',updated_by=?,version=version+1 WHERE id=?`,
            [version.versionNumber, user.id, input.planId],
          );
          return {
            id: input.planId,
            version: version.versionNumber,
            status: "ENABLED",
          };
        }
        case "partner.settlement.create": {
          const [plans] = await connection.execute<RowDataPacket[]>(
            `SELECT p.id planId,p.project_id projectId,p.partner_id partnerId,v.id versionId,v.version_number versionNumber,v.settlement_method settlementMethod,v.fixed_amount fixedAmount,v.ratio,v.calculation_basis basis,v.deductible_cost_scope deductibleScope,v.upper_limit upperLimit,v.lower_limit lowerLimit,v.rounding_rule roundingRule FROM partner_plan p JOIN partner_plan_version v ON v.plan_id=p.id WHERE p.id=? AND p.status='ENABLED' AND v.status='ENABLED' AND v.effective_from<=? AND (v.effective_to IS NULL OR v.effective_to>=?) ORDER BY v.version_number DESC LIMIT 1 FOR UPDATE`,
            [input.planId, input.periodEndOn, input.periodStartOn],
          );
          const plan = plans[0];
          if (!plan)
            throw new AppError(
              "PARTNER_PLAN_NOT_EFFECTIVE",
              "结算期间没有有效合作方案",
              409,
            );
          await requireProjectWriteAccess(connection, plan.projectId, user);
          let basisAmount = 0;
          if (plan.basis === "CONTRACT_REVENUE_EX_TAX") {
            const [r] = await connection.execute<RowDataPacket[]>(
              `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED')`,
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
              `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED')`,
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const all = user.dataScopes.some((scope) => scope.type === "ALL");
          const [counterparties] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM crm_counterparty WHERE id=? AND is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?) LIMIT 1`,
            [input.counterpartyId, all ? 1 : 0, user.employeeId],
          );
          if (!counterparties[0])
            throw new AppError(
              "DEPOSIT_COUNTERPARTY_NOT_FOUND",
              "Counterparty not found or access denied",
              404,
            );
          if (input.bidId) {
            const [bids] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM bid_application WHERE id=? AND project_id=? AND is_deleted=0 LIMIT 1`,
              [input.bidId, input.projectId],
            );
            if (!bids[0])
              throw new AppError(
                "DEPOSIT_BID_NOT_FOUND",
                "Bid not found in the same project",
                404,
              );
          }
          if (input.contractId) {
            const [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM con_contract WHERE id=? AND project_id=? AND is_deleted=0 LIMIT 1`,
              [input.contractId, input.projectId],
            );
            if (!contracts[0])
              throw new AppError(
                "DEPOSIT_CONTRACT_NOT_FOUND",
                "Contract not found in the same project",
                404,
              );
          }
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
            `SELECT project_id projectId,amount,occupied_amount occupied,loss_confirmed_amount loss,status,direction FROM fin_deposit WHERE id=? FOR UPDATE`,
            [input.depositId],
          );
          const deposit = old[0];
          if (!deposit)
            throw new AppError("DEPOSIT_NOT_FOUND", "保证金不存在", 404);
          await requireProjectWriteAccess(connection, deposit.projectId, user);
          const [seen] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,CAST(deposit_id AS CHAR) depositId,event_type eventType,amount,CAST(operator_id AS CHAR) operatorId FROM fin_deposit_event WHERE idempotency_key=?`,
            [input.idempotencyKey],
          );
          if (seen[0]) {
            if (
              seen[0].operatorId !== user.id ||
              seen[0].depositId !== input.depositId ||
              seen[0].eventType !== input.eventType ||
              Math.abs(Number(seen[0].amount) - Number(input.amount)) > 0.005
            )
              throw new AppError(
                "IDEMPOTENCY_KEY_REUSED",
                "幂等键已用于其他保证金事件",
                409,
              );
            return { idempotent: true, id: String(seen[0].id) };
          }
          let occupied = Number(deposit.occupied),
            loss = Number(deposit.loss),
            status = deposit.status as string;
          if (input.eventType === "PAY") {
            if (deposit.direction === "PAY")
              throw new AppError(
                "DEPOSIT_PAYMENT_FLOW_REQUIRED",
                "我方缴纳保证金必须通过付款申请和实际付款登记",
                409,
              );
            if (!["PENDING_PAYMENT", "PAID"].includes(status))
              throw new AppError(
                "DEPOSIT_PAYMENT_NOT_APPROVED",
                "保证金缴纳审批通过后才能登记实缴",
                409,
              );
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
            const [result] = await connection.execute<ResultSetHeader>(
              `INSERT INTO fin_deposit_event(deposit_id,event_type,amount,occurred_on,status,description,operator_id,idempotency_key,created_by,updated_by) VALUES(?,?,?,?,'DRAFT',?,?,?,?,?)`,
              [
                input.depositId,
                input.eventType,
                input.amount,
                input.occurredOn,
                input.description ?? null,
                user.id,
                input.idempotencyKey,
                user.id,
                user.id,
              ],
            );
            return {
              idempotent: false,
              id: String(result.insertId),
              status: "DRAFT",
              requiresApproval: true,
            };
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
            `INSERT INTO fin_deposit_event(deposit_id,event_type,amount,occurred_on,status,description,operator_id,idempotency_key,created_by,updated_by) VALUES(?,?,?,?,'APPROVED',?,?,?,?,?)`,
            [
              input.depositId,
              input.eventType,
              input.amount,
              input.occurredOn,
              input.description ?? null,
              user.id,
              input.idempotencyKey,
              user.id,
              user.id,
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const [acceptanceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_acceptance WHERE project_id=? AND status='COMPLETED'`,
            [input.projectId],
          );
          const acceptancePassed = Number(acceptanceRows[0]?.count ?? 0) > 0;
          const [contractRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tax_exclusive_amount),0) amount FROM con_contract WHERE project_id=? AND contract_type='INCOME' AND amount_status='CONFIRMED' AND status IN('PENDING_SIGNATURE','PERFORMING','COMPLETED')`,
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
          validateProjectClose(check, input.closeType, input.openItems);
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
        case "project.close.list": {
          const page = input.page as number,
            pageSize = input.pageSize as number,
            closeAccess = buildProjectReferenceScope(user, "x.project_id"),
            openItemAccess = buildProjectReferenceScope(user, "c.project_id"),
            [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(x.id AS CHAR) id,x.close_code code,CAST(x.project_id AS CHAR) projectId,p.project_name projectName,x.applied_on appliedOn,x.close_type closeType,x.contract_amount_snapshot contractAmount,x.received_amount_snapshot receivedAmount,x.confirmed_cost_snapshot confirmedCost,x.status FROM prj_close_application x JOIN prj_project p ON p.id=x.project_id WHERE (x.created_by=? OR ${closeAccess.sql}) ORDER BY x.id DESC LIMIT ? OFFSET ?`,
              [
                user.id,
                ...closeAccess.params,
                pageSize,
                (page - 1) * pageSize,
              ],
            ),
            [openItems] = await connection.execute<RowDataPacket[]>(
              `SELECT CAST(i.id AS CHAR) id,CAST(i.close_application_id AS CHAR) closeApplicationId,c.close_code closeCode,p.project_name projectName,i.item_type itemType,i.description,CAST(i.responsible_id AS CHAR) responsibleId,i.due_on dueOn,i.completed_on completedOn,i.status FROM prj_close_open_item i JOIN prj_close_application c ON c.id=i.close_application_id JOIN prj_project p ON p.id=c.project_id WHERE (c.created_by=? OR i.responsible_id=? OR ${openItemAccess.sql}) ORDER BY i.status='OPEN' DESC,i.due_on,i.id DESC LIMIT 500`,
              [
                user.id,
                user.employeeId,
                ...openItemAccess.params,
              ],
            );
          return { items: rows, openItems, page, pageSize };
        }
        case "org.employee.options": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,employee_code employeeCode,name FROM org_employee WHERE status='ACTIVE' AND is_deleted=0 ORDER BY name,id LIMIT 1000`,
          );
          return { items: rows };
        }
        case "project.close.openItem.complete": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT i.status,CAST(i.responsible_id AS CHAR) responsibleId,CAST(p.project_manager_id AS CHAR) projectManagerId,CAST(c.created_by AS CHAR) createdBy FROM prj_close_open_item i JOIN prj_close_application c ON c.id=i.close_application_id JOIN prj_project p ON p.id=c.project_id WHERE i.id=? FOR UPDATE`,
            [input.itemId],
          );
          const item = rows[0];
          if (!item)
            throw new AppError(
              "CLOSE_OPEN_ITEM_NOT_FOUND",
              "结项未清事项不存在",
              404,
            );
          if (item.status !== "OPEN")
            throw new AppError(
              "CLOSE_OPEN_ITEM_ALREADY_COMPLETED",
              "结项未清事项已完成",
              409,
            );
          const all = user.dataScopes.some((scope) => scope.type === "ALL"),
            authorized =
              all ||
              item.responsibleId === user.employeeId ||
              item.projectManagerId === user.employeeId ||
              item.createdBy === user.id;
          if (!authorized)
            throw new AppError(
              "CLOSE_OPEN_ITEM_FORBIDDEN",
              "仅责任人、项目经理或结项申请人可确认完成",
              403,
            );
          await connection.execute(
            `UPDATE prj_close_open_item SET status='COMPLETED',completed_on=? WHERE id=? AND status='OPEN'`,
            [input.completedOn, input.itemId],
          );
          return {
            id: input.itemId,
            status: "COMPLETED",
            completedOn: input.completedOn,
          };
        }
        case "settlement.summary": {
          const access = buildProjectReferenceScope(user, "x.project_id");
          const [planRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM partner_plan x WHERE x.is_deleted=0 AND ${access.sql}`,
            access.params,
          );
          const [settlementRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.net_settlement_amount),0) amount FROM partner_settlement x WHERE x.status IN('APPROVED','PAID') AND ${access.sql}`,
            access.params,
          );
          const [depositRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(x.occupied_amount),0) amount FROM fin_deposit x WHERE ${access.sql}`,
            access.params,
          );
          const [closeRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_close_application x WHERE x.status NOT IN('CLOSED','REJECTED','WITHDRAWN') AND ${access.sql}`,
            access.params,
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
            access = buildProjectReferenceScope(user, "x.project_id");
          const [stageRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count,COALESCE(AVG(completion_percentage),0) progress FROM prj_stage x WHERE x.is_deleted=0 AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          const [riskRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_risk_issue x WHERE x.is_deleted=0 AND x.status<>'CLOSED' AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          const [deliverableRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) count FROM prj_deliverable x WHERE x.is_deleted=0 AND x.status='CONFIRMED' AND (? IS NULL OR x.project_id=?) AND ${access.sql}`,
            [projectId, projectId, ...access.params],
          );
          return {
            stageCount: Number(stageRows[0]?.count ?? 0),
            averageProgress: Number(stageRows[0]?.progress ?? 0),
            openRiskCount: Number(riskRows[0]?.count ?? 0),
            confirmedDeliverableCount: Number(deliverableRows[0]?.count ?? 0),
          };
        }
        case "delivery.records": {
          const access = buildProjectReferenceScope(user, "x.project_id");
          const [deliverables] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.deliverable_name deliverableName,x.deliverable_version deliverableVersion,x.submitted_on submittedOn,x.status,p.project_name projectName FROM prj_deliverable x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0 AND ${access.sql} ORDER BY x.id DESC LIMIT 100`,
            access.params,
          );
          const [acceptances] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,x.acceptance_type acceptanceType,x.accepted_on acceptedOn,x.result,x.status,p.project_name projectName FROM prj_acceptance x JOIN prj_project p ON p.id=x.project_id WHERE ${access.sql} ORDER BY x.id DESC LIMIT 100`,
            access.params,
          );
          const [stages] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.stage_name stageName,x.completion_percentage completionPercentage,x.status,p.project_name projectName FROM prj_stage x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0 AND ${access.sql} ORDER BY x.project_id,x.stage_order`,
            access.params,
          );
          const [risks] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.title,x.severity,x.status,p.project_name projectName FROM prj_risk_issue x JOIN prj_project p ON p.id=x.project_id WHERE x.is_deleted=0 AND ${access.sql} ORDER BY x.id DESC LIMIT 100`,
            access.params,
          );
          const [changes] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(x.id AS CHAR) id,CAST(x.project_id AS CHAR) projectId,x.change_type changeType,x.schedule_impact_days scheduleImpactDays,x.amount_impact amountImpact,x.status,p.project_name projectName FROM prj_change x JOIN prj_project p ON p.id=x.project_id WHERE ${access.sql} ORDER BY x.id DESC LIMIT 100`,
            access.params,
          );
          return { deliverables, acceptances, stages, risks, changes };
        }
        case "project.start.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_stage(project_id,stage_name,stage_order,planned_start_on,planned_end_on,owner_id,objective,deliverables,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.stageName,
              input.stageOrder,
              input.plannedStartOn,
              input.plannedEndOn,
              user.employeeId,
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
            `SELECT status,project_id projectId FROM prj_stage WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.stageId],
          );
          if (!rows[0])
            throw new AppError("STAGE_NOT_FOUND", "阶段不存在", 404);
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          const status = transitionStage(rows[0].status, input.action);
          await connection.execute(
            `UPDATE prj_stage SET status=?,actual_start_on=CASE WHEN ?='IN_PROGRESS' AND actual_start_on IS NULL THEN CURDATE() ELSE actual_start_on END,actual_end_on=CASE WHEN ?='COMPLETED' THEN CURDATE() ELSE actual_end_on END,updated_by=?,version=version+1 WHERE id=?`,
            [status, status, status, user.id, input.stageId],
          );
          return { id: input.stageId, status };
        }
        case "project.progress.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
          if (input.stageId) {
            const [stages] = await connection.execute<RowDataPacket[]>(
              `SELECT id,status FROM prj_stage WHERE id=? AND project_id=? AND is_deleted=0 FOR UPDATE`,
              [input.stageId, input.projectId],
            );
            if (!stages[0])
              throw new AppError(
                "STAGE_PROJECT_MISMATCH",
                "阶段不属于当前项目",
                409,
              );
            if (
              !["NOT_STARTED", "IN_PROGRESS", "DELAYED"].includes(
                String(stages[0].status),
              )
            )
              throw new AppError(
                "STAGE_PROGRESS_NOT_ALLOWED",
                "当前阶段状态不允许登记进展",
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
              user.employeeId,
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
          await requireProjectWriteAccess(connection, input.projectId, user);
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_risk_issue(project_id,item_type,title,description,severity,impact,owner_id,discovered_on,planned_resolution_on,measures,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              input.projectId,
              input.itemType,
              input.title,
              input.description,
              input.severity,
              input.impact,
              user.employeeId,
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
            `SELECT status,project_id projectId FROM prj_risk_issue WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.riskId],
          );
          if (!rows[0])
            throw new AppError("RISK_NOT_FOUND", "问题风险不存在", 404);
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          const status = transitionRisk(rows[0].status, input.action);
          await connection.execute(
            `UPDATE prj_risk_issue SET status=?,actual_resolution_on=CASE WHEN ?='CLOSED' THEN CURDATE() ELSE actual_resolution_on END,updated_by=?,version=version+1 WHERE id=?`,
            [status, status, user.id, input.riskId],
          );
          return { id: input.riskId, status };
        }
        case "project.deliverable.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
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
              user.employeeId,
              input.recipient ?? null,
              input.description ?? null,
            ],
          );
          return { id: String(result.insertId), status: "SUBMITTED" };
        }
        case "project.deliverable.confirm": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id,project_id projectId,status FROM prj_deliverable WHERE id=? AND is_deleted=0 FOR UPDATE`,
            [input.deliverableId],
          );
          if (!rows[0] || rows[0].status !== "SUBMITTED")
            throw new AppError(
              "DELIVERABLE_NOT_CONFIRMABLE",
              "成果当前不可确认",
              409,
            );
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          const status =
            input.confirmationResult === "ACCEPTED" ? "CONFIRMED" : "REJECTED";
          await connection.execute(
            `UPDATE prj_deliverable SET confirmation_result=?,status=? WHERE id=?`,
            [input.confirmationResult, status, input.deliverableId],
          );
          return { id: input.deliverableId, status };
        }
        case "project.acceptance.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
          if (input.contractId) {
            const [contracts] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM con_contract WHERE id=? AND project_id=? AND is_deleted=0 LIMIT 1`,
              [input.contractId, input.projectId],
            );
            if (!contracts[0])
              throw new AppError(
                "ACCEPTANCE_CONTRACT_NOT_FOUND",
                "Contract not found in the same project",
                404,
              );
          }
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_acceptance(project_id,contract_id,acceptance_type,applied_on,acceptance_scope,acceptance_basis,status,created_by,updated_by) VALUES(?,?,?,?,?,?,'DRAFT',?,?)`,
            [
              input.projectId,
              input.contractId ?? null,
              input.acceptanceType,
              input.appliedOn,
              input.acceptanceScope,
              input.acceptanceBasis,
              user.id,
              user.id,
            ],
          );
          return { id: String(result.insertId), status: "DRAFT" };
        }
        case "project.acceptance.result": {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT project_id projectId,status FROM prj_acceptance WHERE id=? FOR UPDATE`,
            [input.acceptanceId],
          );
          if (!rows[0])
            throw new AppError("ACCEPTANCE_NOT_FOUND", "验收申请不存在", 404);
          await requireProjectWriteAccess(connection, rows[0].projectId, user);
          if (rows[0].status !== "PENDING_ACCEPTANCE")
            throw new AppError(
              "ACCEPTANCE_RESULT_NOT_ALLOWED",
              "只有待验收申请可以登记结果",
              409,
            );
          const status = input.result === "FAILED" ? "FAILED" : "COMPLETED";
          await connection.execute(
            `UPDATE prj_acceptance SET accepted_on=?,acceptance_organization=?,result=?,remaining_issues=?,rectification_due_on=?,status=?,updated_by=?,version=version+1 WHERE id=?`,
            [
              input.acceptedOn,
              input.acceptanceOrganization,
              input.result,
              input.remainingIssues ?? null,
              input.rectificationDueOn ?? null,
              status,
              user.id,
              input.acceptanceId,
            ],
          );
          await connection.execute(
            `UPDATE prj_project SET status=?,updated_by=?,version=version+1 WHERE id=? AND status NOT IN('CLOSED','TERMINATED','CANCELLED')`,
            [
              status === "COMPLETED" ? "ACCEPTED" : "PENDING_ACCEPTANCE",
              user.id,
              rows[0].projectId,
            ],
          );
          await connection.execute(
            `INSERT INTO sys_status_history(object_type,object_id,from_status,to_status,action,reason,operated_by) VALUES('PROJECT_ACCEPTANCE',?,?,?,'RECORD_RESULT',?,?)`,
            [
              input.acceptanceId,
              "PENDING_ACCEPTANCE",
              status,
              input.result,
              user.id,
            ],
          );
          return { id: input.acceptanceId, status, result: input.result };
        }
        case "project.change.create": {
          await requireProjectWriteAccess(connection, input.projectId, user);
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
              user.employeeId,
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
