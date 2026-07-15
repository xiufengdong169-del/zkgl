import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

interface ReminderSettings {
  contractExpiryDays: number;
  bidDeadlineDays: number;
}

const defaultReminderSettings: ReminderSettings = {
  contractExpiryDays: 30,
  bidDeadlineDays: 7,
};

function parseReminderDays(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3650) return fallback;
  return parsed;
}

async function loadReminderSettings(
  connection: Pick<PoolConnection, "execute">,
): Promise<ReminderSettings> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT param_key paramKey,param_value paramValue FROM sys_parameter WHERE param_key IN ('reminder.contract_expiry_days','reminder.bid_deadline_days') AND status='ENABLED' AND is_deleted=0`,
  );
  const values = new Map(
    rows.map((row) => [String(row.paramKey), row.paramValue]),
  );
  return {
    contractExpiryDays: parseReminderDays(
      values.get("reminder.contract_expiry_days"),
      defaultReminderSettings.contractExpiryDays,
    ),
    bidDeadlineDays: parseReminderDays(
      values.get("reminder.bid_deadline_days"),
      defaultReminderSettings.bidDeadlineDays,
    ),
  };
}

export function buildReminderStatements(
  settings: ReminderSettings = defaultReminderSettings,
) {
  const contractExpiryDays = parseReminderDays(
      settings.contractExpiryDays,
      defaultReminderSettings.contractExpiryDays,
    ),
    bidDeadlineDays = parseReminderDays(
      settings.bidDeadlineDays,
      defaultReminderSettings.bidDeadlineDays,
    );
  return [
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT c.owner_id,'CONTRACT_EXPIRY',CONCAT('合同即将到期：',c.contract_name),CONCAT('到期日：',c.expires_on),'CONTRACT',c.id FROM con_contract c WHERE c.is_deleted=0 AND c.status IN('PENDING_SIGNATURE','PERFORMING') AND c.expires_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL ${contractExpiryDays} DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=c.owner_id AND m.message_type='CONTRACT_EXPIRY' AND m.business_id=c.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT b.business_owner_id,'BID_DEADLINE',CONCAT('投标即将截止：',b.bid_code),CONCAT('截止时间：',b.deadline_at),'BID_APPLICATION',b.id FROM bid_application b WHERE b.is_deleted=0 AND b.status NOT IN('WON','LOST','FAILED','ABANDONED') AND b.deadline_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL ${bidDeadlineDays} DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=b.business_owner_id AND m.message_type='BID_DEADLINE' AND m.business_id=b.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 2 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT p.project_manager_id,'DEPOSIT_OVERDUE',CONCAT('保证金退回逾期：',g.deposit_code),CONCAT('应退日：',g.due_return_on),'DEPOSIT',g.id FROM fin_deposit g JOIN prj_project p ON p.id=g.project_id WHERE g.due_return_on<CURDATE() AND g.occupied_amount>0 AND g.status NOT IN('RETURNED','VOID') AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=p.project_manager_id AND m.message_type='DEPOSIT_OVERDUE' AND m.business_id=g.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT p.project_manager_id,'DEPOSIT_PAYMENT_OVERDUE',CONCAT('保证金付款逾期：',g.deposit_code),CONCAT('应付日：',g.due_payment_on),'DEPOSIT',g.id FROM fin_deposit g JOIN prj_project p ON p.id=g.project_id WHERE g.status='PENDING_PAYMENT' AND g.due_payment_on<CURDATE() AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=p.project_manager_id AND m.message_type='DEPOSIT_PAYMENT_OVERDUE' AND m.business_id=g.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT s.project_manager_id,'EARLY_START_CONTRACT_MISSING',CONCAT('先开工项目待签约：',p.project_name),CONCAT('预计签约日：',s.expected_signing_on),'PROJECT_START',s.id FROM prj_start s JOIN prj_project p ON p.id=s.project_id WHERE s.start_type='EARLY' AND s.status='APPROVED' AND s.contract_reminder_active=1 AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=s.project_manager_id AND m.message_type='EARLY_START_CONTRACT_MISSING' AND m.business_id=s.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT i.responsible_id,'CLOSE_OPEN_ITEM_OVERDUE',CONCAT('结项未清事项逾期：',p.project_name),CONCAT('要求完成日：',i.due_on,'；',i.description),'PROJECT_CLOSE_ITEM',i.id FROM prj_close_open_item i JOIN prj_close_application c ON c.id=i.close_application_id JOIN prj_project p ON p.id=c.project_id WHERE i.status='OPEN' AND i.due_on<CURDATE() AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=i.responsible_id AND m.message_type='CLOSE_OPEN_ITEM_OVERDUE' AND m.business_id=i.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 3 DAY))`,
    `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT r.owner_id,'RISK_DUE',CONCAT('问题风险待处理：',r.title),CONCAT('计划解决日：',r.planned_resolution_on),'RISK',r.id FROM prj_risk_issue r WHERE r.is_deleted=0 AND r.status<>'CLOSED' AND r.planned_resolution_on<=DATE_ADD(CURDATE(),INTERVAL 3 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=r.owner_id AND m.message_type='RISK_DUE' AND m.business_id=r.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 3 DAY))`,
  ] as const;
}

export const reminderStatements = buildReminderStatements();

export async function refreshReminders(
  connection: Pick<PoolConnection, "execute">,
): Promise<{ created: number }> {
  const statements = buildReminderStatements(await loadReminderSettings(connection));
  let created = 0;
  for (const sql of statements) {
    const [result] = await connection.execute<ResultSetHeader>(sql);
    created += result.affectedRows;
  }
  return { created };
}
