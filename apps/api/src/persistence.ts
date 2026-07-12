import type { SessionUser } from '@zkgl/shared'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

import { AppError } from './errors.js'
import { withTransaction } from './database.js'

interface NumberRow extends RowDataPacket { id: number; prefix: string; serial_length: number; next_serial: number; current_year: number; version: number }
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
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT CAST(id AS CHAR) id,counterparty_code code,name,short_name shortName,counterparty_type type,cooperation_status cooperationStatus
             FROM crm_counterparty WHERE is_deleted=0 AND status='ACTIVE' AND (?='' OR name LIKE ? ESCAPE '\\\\' OR counterparty_code LIKE ? ESCAPE '\\\\')
             ORDER BY id DESC LIMIT ? OFFSET ?`, [keyword,pattern,pattern,pageSize,(page-1)*pageSize]
          )
          return { items: rows, page, pageSize }
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
