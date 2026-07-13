import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

export const reminderStatements = [
  `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT c.owner_id,'CONTRACT_EXPIRY',CONCAT('合同即将到期：',c.contract_name),CONCAT('到期日：',c.expires_on),'CONTRACT',c.id FROM con_contract c WHERE c.is_deleted=0 AND c.status IN('PENDING_SIGNATURE','PERFORMING') AND c.expires_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=c.owner_id AND m.message_type='CONTRACT_EXPIRY' AND m.business_id=c.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
  `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT b.business_owner_id,'BID_DEADLINE',CONCAT('投标即将截止：',b.bid_code),CONCAT('截止时间：',b.deadline_at),'BID_APPLICATION',b.id FROM bid_application b WHERE b.is_deleted=0 AND b.status NOT IN('WON','LOST','FAILED','ABANDONED') AND b.deadline_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 7 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=b.business_owner_id AND m.message_type='BID_DEADLINE' AND m.business_id=b.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 2 DAY))`,
  `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT p.project_manager_id,'DEPOSIT_OVERDUE',CONCAT('保证金退回逾期：',g.deposit_code),CONCAT('应退日：',g.due_return_on),'DEPOSIT',g.id FROM fin_deposit g JOIN prj_project p ON p.id=g.project_id WHERE g.due_return_on<CURDATE() AND g.occupied_amount>0 AND g.status NOT IN('RETURNED','VOID') AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=p.project_manager_id AND m.message_type='DEPOSIT_OVERDUE' AND m.business_id=g.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY))`,
  `INSERT INTO sys_message(recipient_id,message_type,title,content,business_type,business_id) SELECT r.owner_id,'RISK_DUE',CONCAT('问题风险待处理：',r.title),CONCAT('计划解决日：',r.planned_resolution_on),'RISK',r.id FROM prj_risk_issue r WHERE r.is_deleted=0 AND r.status<>'CLOSED' AND r.planned_resolution_on<=DATE_ADD(CURDATE(),INTERVAL 3 DAY) AND NOT EXISTS(SELECT 1 FROM sys_message m WHERE m.recipient_id=r.owner_id AND m.message_type='RISK_DUE' AND m.business_id=r.id AND m.created_at>=DATE_SUB(NOW(),INTERVAL 3 DAY))`,
] as const;

export async function refreshReminders(
  connection: Pick<PoolConnection, "execute">,
): Promise<{ created: number }> {
  let created = 0;
  for (const sql of reminderStatements) {
    const [result] = await connection.execute<ResultSetHeader>(sql);
    created += result.affectedRows;
  }
  return { created };
}
