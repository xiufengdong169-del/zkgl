import type { SessionUser } from '@zkgl/shared'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

import { AppError } from './errors.js'
import { withTransaction } from './database.js'

interface NumberRow extends RowDataPacket { id: number; prefix: string; serial_length: number; next_serial: number; current_year: number; version: number }
interface ApprovalTaskRow extends RowDataPacket { task_id:string;instance_id:string;node_order:number;assignee_id:string;task_status:string;instance_status:string;current_node_order:number;applicant_id:string;configuration_snapshot:string|object }
async function allocateNumber(connection: PoolConnection, ruleCode: string): Promise<string> {
  const [rows] = await connection.execute<NumberRow[]>('SELECT * FROM sys_number_rule WHERE rule_code=? AND status=\'ENABLED\' FOR UPDATE', [ruleCode])
  const row = rows[0]
  if (!row) throw new AppError('NUMBER_RULE_NOT_FOUND', `编号规则不存在：${ruleCode}`, 500)
  const year = new Date().getFullYear()
  const serial = row.current_year === year ? row.next_serial : 1
  await connection.execute('UPDATE sys_number_rule SET current_year=?,next_serial=?,version=version+1 WHERE id=? AND version=?', [year, serial + 1, row.id, row.version])
  return `${row.prefix}-${year}-${String(serial).padStart(row.serial_length, '0')}`
}

export class MySqlActionExecutor {
  constructor(private readonly pool: Pool) {}

  async execute(action: string, value: unknown, user: SessionUser): Promise<unknown> {
    const input = value as Record<string, any>
    return withTransaction(this.pool, async (connection) => {
      switch (action) {
        case 'crm.counterparty.list': {
          const page=input.page as number, pageSize=input.pageSize as number, keyword=(input.keyword as string|undefined)??''
          const pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`
          const all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,counterparty_code code,name,short_name shortName,counterparty_type type,cooperation_status cooperationStatus
             FROM crm_counterparty WHERE is_deleted=0 AND status='ACTIVE' AND (?=1 OR owner_id=?)
              AND (?='' OR name LIKE ? ESCAPE '\\\\' OR counterparty_code LIKE ? ESCAPE '\\\\')
             ORDER BY id DESC LIMIT ? OFFSET ?`, [all?1:0,user.employeeId,keyword,pattern,pattern,pageSize,(page-1)*pageSize]
          )
          return { items: rows, page, pageSize }
        }
        case 'lead.list': {
          const page=input.page as number,pageSize=input.pageSize as number,keyword=(input.keyword as string|undefined)??'',pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`
          const all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,lead_code code,project_name projectName,CAST(customer_id AS CHAR) customerId,
                    CAST(owner_id AS CHAR) ownerId,success_probability successProbability,status,next_follow_up_at nextFollowUpAt
               FROM mkt_lead WHERE is_deleted=0 AND (?=1 OR owner_id=? OR created_by=?)
                AND (?='' OR project_name LIKE ? ESCAPE '\\\\' OR lead_code LIKE ? ESCAPE '\\\\')
               ORDER BY id DESC LIMIT ? OFFSET ?`,[all?1:0,user.id,user.id,keyword,pattern,pattern,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'project.application.list': {
          const page=input.page as number,pageSize=input.pageSize as number,keyword=(input.keyword as string|undefined)??'',pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`,all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,application_code code,project_name projectName,estimated_revenue estimatedRevenue,
                    estimated_cost estimatedCost,estimated_profit estimatedProfit,status
               FROM prj_project_application WHERE is_deleted=0 AND (?=1 OR applicant_id=? OR proposed_manager_id=?)
                AND (?='' OR project_name LIKE ? ESCAPE '\\\\' OR application_code LIKE ? ESCAPE '\\\\')
               ORDER BY id DESC LIMIT ? OFFSET ?`,[all?1:0,user.id,user.employeeId,keyword,pattern,pattern,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'project.list': {
          const page=input.page as number,pageSize=input.pageSize as number,keyword=(input.keyword as string|undefined)??'',pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`,all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT DISTINCT CAST(p.id AS CHAR) id,p.project_code code,p.project_name projectName,p.status,
                    CAST(p.project_manager_id AS CHAR) projectManagerId
               FROM prj_project p LEFT JOIN prj_project_member m ON m.project_id=p.id AND m.status='ACTIVE'
              WHERE p.is_deleted=0 AND (?=1 OR p.project_manager_id=? OR m.employee_id=?)
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR p.project_code LIKE ? ESCAPE '\\\\')
               ORDER BY p.id DESC LIMIT ? OFFSET ?`,[all?1:0,user.employeeId,user.employeeId,keyword,pattern,pattern,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'bid.application.list': {
          const page=input.page as number,pageSize=input.pageSize as number,keyword=(input.keyword as string|undefined)??'',pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`,all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT CAST(b.id AS CHAR) id,b.bid_code code,p.project_name projectName,b.deadline_at deadlineAt,b.status
               FROM bid_application b JOIN prj_project p ON p.id=b.project_id
              WHERE b.is_deleted=0 AND (?=1 OR b.business_owner_id=? OR b.technical_owner_id=? OR b.pricing_owner_id=?)
                AND (?='' OR p.project_name LIKE ? ESCAPE '\\\\' OR b.bid_code LIKE ? ESCAPE '\\\\')
               ORDER BY b.id DESC LIMIT ? OFFSET ?`,[all?1:0,user.employeeId,user.employeeId,user.employeeId,keyword,pattern,pattern,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'contract.list': {
          const page=input.page as number,pageSize=input.pageSize as number,keyword=(input.keyword as string|undefined)??'',pattern=`%${keyword.replace(/[\\%_]/g,'\\$&')}%`,all=user.dataScopes.some((scope)=>scope.type==='ALL')
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT CAST(c.id AS CHAR) id,c.contract_code code,c.contract_name contractName,c.contract_type contractType,
                    c.tax_exclusive_amount taxExclusiveAmount,c.amount_status amountStatus,c.status
               FROM con_contract c WHERE c.is_deleted=0 AND (?=1 OR c.owner_id=?)
                AND (?='' OR c.contract_name LIKE ? ESCAPE '\\\\' OR c.contract_code LIKE ? ESCAPE '\\\\')
               ORDER BY c.id DESC LIMIT ? OFFSET ?`,[all?1:0,user.employeeId,keyword,pattern,pattern,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'approval.task.list': {
          const page=input.page as number,pageSize=input.pageSize as number
          const [rows]=await connection.execute<RowDataPacket[]>(
            `SELECT CAST(t.id AS CHAR) id,CAST(i.id AS CHAR) instanceId,i.instance_code instanceCode,i.title,
                    i.business_type businessType,CAST(i.business_id AS CHAR) businessId,t.node_order nodeOrder,
                    t.position_code positionCode,t.assigned_at assignedAt
               FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id
              WHERE t.assignee_id=? AND t.status='PENDING' AND i.status='PENDING'
               ORDER BY t.assigned_at ASC LIMIT ? OFFSET ?`,[user.employeeId,pageSize,(page-1)*pageSize])
          return {items:rows,page,pageSize}
        }
        case 'approval.task.action': {
          const [existing]=await connection.execute<RowDataPacket[]>('SELECT id FROM wf_action_history WHERE action_key=? LIMIT 1',[input.actionKey])
          if(existing[0])return {idempotent:true}
          const [rows]=await connection.execute<ApprovalTaskRow[]>(
            `SELECT CAST(t.id AS CHAR) task_id,CAST(t.instance_id AS CHAR) instance_id,t.node_order,CAST(t.assignee_id AS CHAR) assignee_id,
                    t.status task_status,i.status instance_status,i.current_node_order,CAST(i.applicant_id AS CHAR) applicant_id,i.configuration_snapshot
               FROM wf_task t JOIN wf_instance i ON i.id=t.instance_id WHERE t.id=? FOR UPDATE`,[input.taskId])
          const task=rows[0]
          if(!task||task.assignee_id!==user.employeeId||task.task_status!=='PENDING'||task.instance_status!=='PENDING'||task.current_node_order!==task.node_order)throw new AppError('APPROVAL_TASK_NOT_ACTIVE','当前用户没有有效审批任务',403)
          await connection.execute(`INSERT INTO wf_action_history(action_key,instance_id,task_id,node_order,action,operator_id,comment) VALUES(?,?,?,?,?,?,?)`,[input.actionKey,task.instance_id,task.task_id,task.node_order,input.action,user.id,input.comment??null])
          if(input.action==='APPROVE'){
            await connection.execute(`UPDATE wf_task SET status=CASE WHEN id=? THEN 'APPROVED' ELSE 'CANCELLED' END,completed_at=NOW(3),completed_by=? WHERE instance_id=? AND node_order=? AND status='PENDING'`,[task.task_id,user.employeeId,task.instance_id,task.node_order])
            const [nextRows]=await connection.execute<RowDataPacket[]>(`SELECT MIN(node_order) next_order FROM wf_task WHERE instance_id=? AND node_order>? AND status='WAITING'`,[task.instance_id,task.node_order])
            const next=nextRows[0]?.next_order as number|null
            if(next==null)await connection.execute(`UPDATE wf_instance SET status='APPROVED',current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,[task.instance_id])
            else{await connection.execute(`UPDATE wf_task SET status='PENDING',assigned_at=NOW(3) WHERE instance_id=? AND node_order=? AND status='WAITING'`,[task.instance_id,next]);await connection.execute(`UPDATE wf_instance SET current_node_order=?,version=version+1 WHERE id=?`,[next,task.instance_id])}
          }else{
            const status=input.action==='RETURN'?'RETURNED':'REJECTED'
            await connection.execute(`UPDATE wf_task SET status='CANCELLED',completed_at=NOW(3) WHERE instance_id=? AND status IN ('PENDING','WAITING')`,[task.instance_id])
            await connection.execute(`UPDATE wf_instance SET status=?,current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,[status,task.instance_id])
          }
          return {idempotent:false,status:input.action}
        }
        case 'approval.instance.withdraw': {
          const [existing]=await connection.execute<RowDataPacket[]>('SELECT id FROM wf_action_history WHERE action_key=? LIMIT 1',[input.actionKey]);if(existing[0])return{idempotent:true}
          const [instances]=await connection.execute<RowDataPacket[]>(`SELECT CAST(id AS CHAR) id,CAST(applicant_id AS CHAR) applicantId,status FROM wf_instance WHERE id=? FOR UPDATE`,[input.instanceId]);const instance=instances[0]
          if(!instance||instance.applicantId!==user.id||instance.status!=='PENDING')throw new AppError('WITHDRAW_NOT_ALLOWED','仅申请人可撤回审批中的实例',403)
          await connection.execute(`INSERT INTO wf_action_history(action_key,instance_id,action,operator_id,comment) VALUES(?,?,?,?,?)`,[input.actionKey,input.instanceId,'WITHDRAW',user.id,input.comment??null])
          await connection.execute(`UPDATE wf_task SET status='CANCELLED',completed_at=NOW(3) WHERE instance_id=? AND status IN ('PENDING','WAITING')`,[input.instanceId]);await connection.execute(`UPDATE wf_instance SET status='WITHDRAWN',current_node_order=NULL,completed_at=NOW(3),version=version+1 WHERE id=?`,[input.instanceId])
          return{idempotent:false,status:'WITHDRAWN'}
        }
        case 'crm.counterparty.create': {
          const code = await allocateNumber(connection, 'COUNTERPARTY')
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO crm_counterparty(counterparty_code,name,short_name,credit_code,counterparty_type,industry,region,address,phone,website,owner_id,source_code,cooperation_status,remark,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [code,input.name,input.shortName??null,input.creditCode??null,input.type,input.industry??null,input.region??null,input.address??null,input.phone??null,input.website??null,input.ownerId,input.sourceCode??null,input.cooperationStatus,input.remark??null,user.id,user.id]
          )
          return { id: String(result.insertId), code }
        }
        case 'crm.contact.create': {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO crm_contact(counterparty_id,name,gender,department_name,position_name,mobile,phone,email,wechat,is_key_contact,relationship_level,decision_role,owner_id,remark,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [input.counterpartyId,input.name,input.gender??null,input.departmentName??null,input.positionName??null,input.mobile??null,input.phone??null,input.email??null,input.wechat??null,input.isKeyContact,input.relationshipLevel??null,input.decisionRole??null,input.ownerId,input.remark??null,user.id,user.id]
          )
          return { id: String(result.insertId) }
        }
        case 'lead.create': {
          const code = await allocateNumber(connection, 'LEAD')
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO mkt_lead(lead_code,project_name,customer_id,source_code,source_description,discovered_on,estimated_amount,estimated_start_on,project_type,project_background,requirement_summary,competition,success_probability,owner_id,next_follow_up_at,source_visit_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [code,input.projectName,input.customerId,input.sourceCode,input.sourceDescription??null,input.discoveredOn,input.estimatedAmount??null,input.estimatedStartOn??null,input.projectType,input.projectBackground??null,input.requirementSummary,input.competition??null,input.successProbability,input.ownerId,input.nextFollowUpAt??null,input.sourceVisitId??null,user.id,user.id]
          )
          return { id: String(result.insertId), code }
        }
        case 'project.application.create': {
          const code = await allocateNumber(connection, 'PROJECT_APPLICATION')
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO prj_project_application(application_code,project_name,customer_id,source_lead_id,project_type,background,service_scope,estimated_revenue,estimated_cost,estimated_start_on,estimated_end_on,proposed_manager_id,bidding_method,risk_description,necessity,applicant_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [code,input.projectName,input.customerId,input.sourceLeadId??null,input.projectType,input.background??null,input.serviceScope,input.estimatedRevenue,input.estimatedCost,input.estimatedStartOn,input.estimatedEndOn,input.proposedManagerId,input.biddingMethod??null,input.riskDescription??null,input.necessity,input.applicantId,user.id,user.id]
          )
          return { id: String(result.insertId), code }
        }
        case 'bid.application.create': {
          const code = await allocateNumber(connection, 'BID')
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bid_application(bid_code,project_id,tenderer_id,agency_id,tender_number,project_budget,bid_ceiling,registration_at,document_purchase_at,clarification_at,deadline_at,opening_at,bid_location,bid_method,deposit_amount,document_fee,business_owner_id,technical_owner_id,pricing_owner_id,application_reason,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [code,input.projectId,input.tendererId,input.agencyId??null,input.tenderNumber??null,input.projectBudget??null,input.bidCeiling??null,input.registrationAt??null,input.documentPurchaseAt??null,input.clarificationAt??null,input.deadlineAt,input.openingAt??null,input.bidLocation??null,input.bidMethod,input.depositAmount,input.documentFee,input.businessOwnerId,input.technicalOwnerId,input.pricingOwnerId,input.applicationReason,user.id,user.id]
          )
          return { id: String(result.insertId), code }
        }
        case 'contract.create': {
          const code = await allocateNumber(connection, 'CONTRACT')
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO con_contract(contract_code,contract_name,contract_type,project_id,party_a_id,party_b_id,signing_entity_id,tax_inclusive_amount,tax_exclusive_amount,tax_rate,tax_amount,amount_status,signed_on,effective_on,expires_on,service_content,payment_terms,invoice_terms,owner_id,parent_contract_id,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [code,input.contractName,input.contractType,input.projectId,input.partyAId,input.partyBId,input.signingEntityId,input.taxInclusiveAmount,input.taxExclusiveAmount,input.taxRate,input.taxAmount,input.amountStatus,input.signedOn??null,input.effectiveOn??null,input.expiresOn??null,input.serviceContent,input.paymentTerms,input.invoiceTerms??null,input.ownerId,input.parentContractId??null,user.id,user.id]
          )
          return { id: String(result.insertId), code }
        }
        default: throw new AppError('ACTION_PERSISTENCE_NOT_IMPLEMENTED', `动作尚未接入持久化：${action}`, 501)
      }
    })
  }
}
