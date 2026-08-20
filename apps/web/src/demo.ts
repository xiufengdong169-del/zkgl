import type { SessionUser } from '@zkgl/shared'

export const demoMode = String(import.meta.env.VITE_DEMO_MODE || '').toLowerCase() === 'true'

const allPermissions = [
  'approval.instance.submit',
  'approval.instance.withdraw',
  'approval.task.process',
  'approval.task.read',
  'bid.application.create',
  'bid.application.read',
  'contract.change.create',
  'contract.create',
  'contract.milestone.create',
  'contract.read',
  'crm.contact.create',
  'crm.counterparty.create',
  'crm.counterparty.read',
  'crm.visit.create',
  'daily.purchase.create',
  'deposit.create',
  'deposit.event.create',
  'file.download',
  'file.read',
  'file.sensitive.read',
  'file.upload',
  'finance.read',
  'invoice.application.create',
  'lead.create',
  'lead.followUp.create',
  'lead.read',
  'message.read',
  'partner.plan.create',
  'partner.settlement.create',
  'payment.application.create',
  'payment.detail.create',
  'project.acceptance.create',
  'project.application.create',
  'project.application.read',
  'project.change.create',
  'project.close.create',
  'project.close.openItem.complete',
  'project.deliverable.confirm',
  'project.deliverable.create',
  'project.delivery.read',
  'project.export',
  'project.progress.create',
  'project.read',
  'project.risk.create',
  'project.stage.create',
  'project.start.create',
  'receipt.create',
  'receipt.invoice.allocate',
  'reimbursement.create',
  'report.financial.read',
  'sales.invoice.create',
  'settlement.read',
  'system.admin'
]

export const demoUser: SessionUser = {
  id: 'demo-admin',
  cloudbaseUid: 'demo-cloudbase-admin',
  employeeId: 'emp-demo-admin',
  departmentId: 'dept-demo',
  enabled: true,
  roleCodes: ['ADMIN'],
  permissionCodes: allPermissions,
  sensitiveFieldAccess: {},
  dataScopes: [{ type: 'ALL' }]
}

const projects = [
  { id: 'p-001', code: 'ZK-2026-001', projectName: '广州智慧园区全过程咨询', status: 'IN_PROGRESS', projectManagerId: 'emp-demo-admin', managerName: '演示经理' },
  { id: 'p-002', code: 'ZK-2026-002', projectName: '市政更新工程造价管控', status: 'PENDING_ACCEPTANCE', projectManagerId: 'emp-demo-admin', managerName: '演示经理' },
  { id: 'p-003', code: 'ZK-2026-003', projectName: '产业园投标与合同履约项目', status: 'PREPARING', projectManagerId: 'emp-demo-admin', managerName: '演示经理' }
]

const customers = [
  { id: 'c-001', code: 'DW-2026-001', name: '广州城建投资有限公司', shortName: '广州城投', type: 'OWNER', cooperationStatus: 'ACTIVE' },
  { id: 'c-002', code: 'DW-2026-002', name: '南沙产业园开发集团', shortName: '南沙园区', type: 'OWNER', cooperationStatus: 'ACTIVE' }
]

const employees = [
  { id: 'emp-demo-admin', employeeCode: 'YG-001', name: '演示经理', positionName: '项目经理' },
  { id: 'emp-demo-finance', employeeCode: 'YG-002', name: '演示财务', positionName: '财务资金' }
]

const contracts = [
  {
    id: 'ct-001',
    code: 'HT-2026-001',
    name: '广州智慧园区咨询合同',
    contractName: '广州智慧园区咨询合同',
    projectId: 'p-001',
    counterpartyId: 'c-001',
    partyBName: '广州城建投资有限公司',
    amount: '3200000.00',
    taxInclusiveAmount: '3200000.00',
    paymentAppliedAmount: '680000.00',
    amountStatus: 'CONFIRMED',
    status: 'PERFORMING'
  }
]

const bidApplications = [
  {
    id: 'bid-001',
    projectId: 'p-003',
    code: 'TB-2026-001',
    projectName: '产业园投标与合同履约项目',
    deadlineAt: '2026-08-20 17:00',
    status: 'IN_PROGRESS'
  }
]

const financeOperations = {
  payments: [
    {
      id: 'pay-001',
      code: 'FK-2026-001',
      projectId: 'p-001',
      recipientName: '广州城建投资有限公司',
      requestedAmount: '180000.00',
      receivingAccount: '************1234',
      paidAmount: '80000.00',
      status: 'APPROVED'
    }
  ],
  plans: [
    {
      id: 'plan-001',
      code: 'HZ-2026-001',
      projectId: 'p-001',
      partnerName: '南沙产业园开发集团',
      status: 'ENABLED',
      currentVersion: 1,
      versionId: 'planv-001',
      settlementMethod: 'RATIO',
      ratio: 0.18,
      fixedAmount: null,
      calculationBasis: 'ACTUAL_RECEIPTS',
      effectiveFrom: '2026-08-01',
      versionStatus: 'ENABLED'
    }
  ],
  settlements: [
    {
      id: 'set-001',
      code: 'JS-2026-001',
      projectId: 'p-001',
      netAmount: '126000.00',
      status: 'APPROVED',
      partnerName: '南沙产业园开发集团',
      paymentStatus: 'PENDING_PAYMENT',
      invoiceRequirement: '增值税普通发票',
      hasPaymentApplication: 0
    }
  ],
  deposits: [
    {
      id: 'dep-001',
      code: 'BZJ-2026-001',
      projectId: 'p-003',
      direction: 'PAY',
      counterpartyName: '广州城建投资有限公司',
      amount: '50000.00',
      account: '************5678',
      occupiedAmount: '50000.00',
      lossAmount: '0.00',
      status: 'PAID',
      hasPaymentApplication: 1
    }
  ],
  depositEvents: [
    {
      id: 'depe-001',
      depositId: 'dep-001',
      depositCode: 'BZJ-2026-001',
      eventType: 'RETURN',
      amount: '50000.00',
      occurredOn: '2026-08-18',
      status: 'PENDING'
    }
  ]
}

export async function demoCallApi<T>(action: string, payload?: unknown): Promise<T> {
  const list = <TItem>(items: TItem[]) => ({ items }) as T
  if (action === 'session.get') return demoUser as T
  if (action === 'report.dashboard') return {
    expectedProfit: '1,286,000.00',
    contractOperatingProfit: '936,500.00',
    cashContribution: '782,300.00',
    projectCount: projects.length,
    disclaimer: '演示数据：用于查看界面和流程，不代表真实经营口径'
  } as T
  if (action === 'message.list') return list([
    { id: 'm-1', title: '先开工项目待签约提醒', content: '广州智慧园区项目预计签约日临近', businessType: 'PROJECT_START', businessId: 'p-001', createdAt: '2026-08-10 09:00', readAt: null },
    { id: 'm-2', title: '保证金退回跟踪', content: '产业园投标保证金进入退回窗口', businessType: 'DEPOSIT', businessId: 'p-003', createdAt: '2026-08-10 10:20', readAt: null }
  ])
  if (action === 'approval.inbox.list') return list([
    { id: 'a-1', instanceCode: 'SP-2026-001', title: '合同变更审批：广州智慧园区', businessType: 'CONTRACT_CHANGE', occurredAt: '2026-08-10 08:40' },
    { id: 'a-2', instanceCode: 'SP-2026-002', title: '项目提前启动审批', businessType: 'PROJECT_START', occurredAt: '2026-08-10 09:15' }
  ])
  if (action === 'project.list') return list(projects)
  if (action === 'project.application.list') return list([
    { id: 'pa-001', code: 'LA-2026-001', projectName: '广州智慧园区全过程咨询', estimatedProfit: '860000.00', status: 'APPROVAL_PENDING', version: 1, createdBy: 'emp-demo-admin' }
  ])
  if (action === 'project.application.detail') return {
    application: {
      id: 'pa-001',
      code: 'LA-2026-001',
      projectName: '广州智慧园区全过程咨询',
      customerId: 'c-001',
      projectType: 'CONSULTING',
      background: '演示立项背景',
      serviceScope: '全过程咨询、造价管控与履约协同',
      estimatedRevenue: 3200000,
      estimatedCost: 2340000,
      estimatedStartOn: '2026-08-01',
      estimatedEndOn: '2027-01-31',
      proposedManagerId: 'emp-demo-admin',
      biddingMethod: 'PUBLIC',
      riskDescription: '合同签订周期需持续跟踪',
      necessity: '展示立项、审批、项目生成闭环',
      status: 'APPROVAL_PENDING',
      version: 1
    }
  } as T
  if (action === 'project.detail') return {
    project: projects[0],
    members: [{ employeeName: '演示经理', roleInProject: '项目负责人' }],
    contracts,
    stages: [{ stageName: '实施准备', completionPercentage: 65, status: 'IN_PROGRESS' }],
    risks: [{ title: '补签材料待完善', severity: 'MEDIUM', status: 'OPEN' }],
    timeline: [{ eventType: 'PROJECT_START', title: '项目启动审批通过', eventAt: '2026-08-02', status: 'APPROVED' }],
    approvalRecords: [{ id: 'ap-001', instanceCode: 'SP-2026-001', businessType: 'PROJECT_START', title: '项目提前启动审批', status: 'APPROVED', submittedAt: '2026-08-01', completedAt: '2026-08-02', applicantName: '演示经理' }],
    auditLogs: [{ id: 'log-001', requestId: 'demo-request-001', action: 'project.detail', resourceType: 'PROJECT', resourceId: 'p-001', outcome: 'SUCCESS', occurredAt: '2026-08-10 10:00', username: 'demo-admin' }],
    money: { contractAmount: '3200000.00', invoicedAmount: '960000.00', receivedAmount: '780000.00', paidAmount: '80000.00' },
    financialVisible: true
  } as T
  if (action === 'crm.counterparty.list') return list(customers)
  if (action === 'lead.list') return list([
    { id: 'l-001', code: 'XS-2026-001', projectName: '白云片区全过程咨询机会', customerId: 'c-001', ownerId: 'emp-demo-admin', successProbability: 70, status: 'FOLLOWING', nextFollowUpAt: '2026-08-15' }
  ])
  if (action === 'contract.list') return list(contracts)
  if (action === 'contract.summary') return { incomeAmount: '3200000.00', expenseAmount: '680000.00', expiringCount: 1 } as T
  if (action === 'bid.application.list') return list(bidApplications)
  if (action === 'bid.detail') return {
    tasks: [{ id: 'bt-001', taskType: 'TECHNICAL', taskName: '技术标编制', assigneeId: 'emp-demo-admin', dueAt: '2026-08-18', deliveryRequirement: '完成技术标初稿', completionDescription: null, status: 'IN_PROGRESS' }],
    checks: [{ id: 'bc-001', checkItem: '资格文件', checkStandard: '证照与业绩材料齐全', responsibleId: 'emp-demo-admin', result: 'PASS', issueDescription: null, rectifierId: null, rectificationDueAt: null, recheckResult: null }],
    partners: [{ id: 'bp-001', partnerName: '南沙产业园开发集团', finalCustomerName: '广州城建投资有限公司', cooperationType: 'JOINT_BID', ourQuotation: 1280000, result: null, description: '联合投标演示数据' }]
  } as T
  if (action === 'delivery.records') return {
    deliverables: [{ id: 'del-001', deliverableName: '月度咨询报告', deliverableVersion: 'V1.0', submittedOn: '2026-08-10', status: 'SUBMITTED', projectName: '广州智慧园区全过程咨询' }],
    acceptances: [{ id: 'acc-001', acceptanceType: 'STAGE', acceptedOn: '2026-08-12', result: 'PASSED', status: 'APPROVED', projectName: '广州智慧园区全过程咨询' }],
    stages: [{ id: 'stg-001', projectId: 'p-001', stageName: '实施准备', completionPercentage: 65, status: 'IN_PROGRESS', projectName: '广州智慧园区全过程咨询' }],
    risks: [{ id: 'risk-001', projectId: 'p-001', title: '补签材料待完善', severity: 'MEDIUM', status: 'OPEN', projectName: '广州智慧园区全过程咨询' }],
    changes: [{ id: 'chg-001', projectId: 'p-001', changeType: 'SCHEDULE', scheduleImpactDays: 7, amountImpact: '0.00', status: 'APPROVAL_PENDING', projectName: '广州智慧园区全过程咨询' }]
  } as T
  if (action === 'delivery.summary') return { stageCount: 1, averageProgress: 65, openRiskCount: 1, confirmedDeliverableCount: 1 } as T
  if (action === 'finance.summary') return { invoicedAmount: '960000.00', receivedAmount: '780000.00', paidAmount: '80000.00' } as T
  if (action === 'finance.documents') return {
    applications: [{ id: 'ia-001', code: 'KP-2026-001', projectId: 'p-001', contractId: 'ct-001', requestedAmount: '960000.00', status: 'APPROVED' }],
    receipts: [{ id: 'rc-001', code: 'SK-2026-001', projectId: 'p-001', contractId: 'ct-001', amount: '780000.00', allocatedAmount: '760000.00', receiptType: 'NORMAL' }],
    invoices: [{ id: 'si-001', invoiceNumber: '044001900111', projectId: 'p-001', contractId: 'ct-001', amount: '960000.00', allocatedAmount: '760000.00' }]
  } as T
  if (action === 'finance.operations') return financeOperations as T
  if (action === 'finance.expenseApplications') return {
    reimbursements: [{ id: 'rb-001', projectId: 'p-001', code: 'BX-2026-001', reason: '项目现场差旅', paymentRecipient: '演示经理', receivingAccount: '************9012', totalAmount: '3600.00', approvalStatus: 'APPROVED', paymentStatus: 'UNPAID', hasPaymentApplication: 0 }],
    purchases: [{ id: 'dp-001', code: 'CG-2026-001', purchaseType: 'OFFICE', itemDescription: '项目驻场资料打印', quantity: '1.0000', budgetAmount: '2600.00', expectedOn: '2026-08-15', status: 'APPROVED', contractRelated: 0, projectId: 'p-001', supplierName: '广州城建投资有限公司', receivingAccount: '************3456', hasPaymentApplication: 0 }]
  } as T
  if (action === 'settlement.summary') return { planCount: 1, settledAmount: '126000.00', occupiedDeposit: '50000.00', pendingCloseCount: 1 } as T
  if (action === 'project.close.list') return {
    items: [{ id: 'close-001', code: 'JX-2026-001', projectName: '市政更新工程造价管控', appliedOn: '2026-08-09', closeType: 'WITH_OPEN_ITEMS', contractAmount: '1800000.00', receivedAmount: '1500000.00', confirmedCost: '960000.00', status: 'APPROVAL_PENDING' }],
    openItems: [{ id: 'oi-001', closeCode: 'JX-2026-001', projectName: '市政更新工程造价管控', itemType: 'RECEIVABLE', description: '尾款待回收', responsibleId: 'emp-demo-admin', dueOn: '2026-08-30', completedOn: null, status: 'OPEN' }]
  } as T
  if (action === 'file.list') return list([{ id: 'file-001', logicalName: '项目启动会纪要.pdf', originalName: '项目启动会纪要.pdf', classification: 'INTERNAL', sizeBytes: 245760, uploadedAt: '2026-08-10 11:00', currentVersion: 1 }])
  if (action === 'file.version.history') return list([{ id: 'fv-001', versionNumber: 1, originalName: '项目启动会纪要.pdf', sizeBytes: 245760, sha256: 'demo-sha256', uploadedAt: '2026-08-10 11:00' }])
  if (action === 'report.analytics') return {
    leadStatus: [{ status: 'FOLLOWING', count: 1, amount: 1800000 }],
    bidStatus: [{ status: 'IN_PROGRESS', count: 1 }],
    projectStatus: [{ status: 'IN_PROGRESS', count: 1, averageProgress: 65 }],
    profits: [{ projectId: 'p-001', projectCode: 'ZK-2026-001', projectName: '广州智慧园区全过程咨询', expectedProfit: 860000, operatingProfit: 620000, cashContribution: 540000 }],
    collection: { contractAmount: 3200000, receivedAmount: 780000 },
    disclaimer: '演示数据：经营口径用于界面验收，不代表会计利润'
  } as T
  if (action === 'report.receivables') return list([{ id: 'rec-001', contractCode: 'HT-2026-001', contractName: '广州智慧园区咨询合同', projectName: '广州智慧园区全过程咨询', dueOn: '2026-09-30', contractAmount: 3200000, receivedAmount: 780000, outstandingAmount: 2420000, overdue: 0 }])
  if (action === 'report.exportTasks') return list([
    { id: 'ex-1', taskCode: 'DC-2026-001', exportType: 'PROJECT', estimatedRows: 128, status: 'COMPLETED', failureReason: null, fileId: 'demo-file-1', createdAt: '2026-08-10 09:30', completedAt: '2026-08-10 09:31', expiresAt: '2026-08-17', isExpired: false, logicalName: '项目台账演示.xlsx', sizeBytes: 20480 }
  ])
  if (action.endsWith('.summary') || action === 'finance.summary') return { projectCount: projects.length, totalAmount: '3200000.00', pendingAmount: '680000.00' } as T
  if (action.includes('.detail')) return { id: 'demo-detail', code: 'DEMO', name: '演示详情', project: projects[0], customer: customers[0], items: [] } as T
  if (action === 'file.download') return { url: 'https://example.com/demo-download' } as T
  if (action === 'report.project.export') return { mode: 'BACKGROUND', taskCode: 'DC-DEMO', estimatedRows: 128, message: '演示导出任务已创建' } as T
  if (action.includes('.options') || action.includes('employee.options')) return list(employees)
  if (action.includes('.list') || action.includes('operations') || action.includes('reports')) return list([])
  return ({ ok: true, id: 'demo-created' } as unknown) as T
}
