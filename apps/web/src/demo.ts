import type { SessionUser } from '@zkgl/shared'

export const demoMode = String(import.meta.env.VITE_DEMO_MODE || '').toLowerCase() === 'true'

const allPermissions = [
  'crm.counterparty.read', 'lead.read', 'project.read', 'approval.task.read',
  'bid.application.read', 'contract.read', 'project.delivery.read', 'finance.read',
  'settlement.read', 'file.read', 'report.financial.read', 'system.admin'
]

export const demoUser: SessionUser = {
  id: 'demo-admin',
  cloudbaseUid: 'demo-cloudbase-admin',
  employeeId: 'emp-demo-admin',
  departmentId: 'dept-demo',
  enabled: true,
  roleCodes: ['SYSTEM_ADMIN', 'COMPANY_MANAGER'],
  permissionCodes: allPermissions,
  sensitiveFieldAccess: {},
  dataScopes: [{ type: 'ALL' }]
}

const projects = [
  { id: 'p-001', code: 'XM-2026-001', projectName: '广州智慧园区全过程咨询', status: 'IN_PROGRESS', projectManagerId: 'emp-demo-admin', managerName: '演示经理' },
  { id: 'p-002', code: 'XM-2026-002', projectName: '市政更新工程造价管控', status: 'PENDING_ACCEPTANCE', projectManagerId: 'emp-demo-admin', managerName: '演示经理' },
  { id: 'p-003', code: 'XM-2026-003', projectName: '产业园投标与合同履约项目', status: 'PREPARING', projectManagerId: 'emp-demo-admin', managerName: '演示经理' }
]

const customers = [
  { id: 'c-001', code: 'KH-001', name: '广州城建投资有限公司', shortName: '广州城投', type: 'OWNER', cooperationStatus: 'ACTIVE' },
  { id: 'c-002', code: 'KH-002', name: '南沙产业园开发集团', shortName: '南沙园区', type: 'OWNER', cooperationStatus: 'ACTIVE' }
]

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
  if (action === 'crm.counterparty.list') return list(customers)
  if (action === 'lead.list') return list([
    { id: 'l-001', code: 'XS-001', projectName: '白云片区全过程咨询机会', customerId: 'c-001', ownerId: 'emp-demo-admin', successProbability: 70, status: 'FOLLOWING', nextFollowUpAt: '2026-08-15' }
  ])
  if (action === 'contract.list') return list([
    { id: 'ct-001', code: 'HT-2026-001', name: '广州智慧园区咨询合同', projectId: 'p-001', counterpartyId: 'c-001', amount: '3200000.00', status: 'PERFORMING' }
  ])
  if (action === 'report.exportTasks') return list([
    { id: 'ex-1', taskCode: 'EXP-001', exportType: 'PROJECT', estimatedRows: 128, status: 'COMPLETED', failureReason: null, fileId: 'demo-file-1', createdAt: '2026-08-10 09:30', completedAt: '2026-08-10 09:31', expiresAt: '2026-08-17', isExpired: false, logicalName: '项目台账演示.xlsx', sizeBytes: 20480 }
  ])
  if (action.endsWith('.summary') || action === 'finance.summary') return { projectCount: projects.length, totalAmount: '3200000.00', pendingAmount: '680000.00' } as T
  if (action.includes('.detail')) return { id: 'demo-detail', code: 'DEMO', name: '演示详情', project: projects[0], customer: customers[0], items: [] } as T
  if (action === 'file.download') return { url: 'https://example.com/demo-download' } as T
  if (action === 'report.project.export') return { mode: 'BACKGROUND', taskCode: 'EXP-DEMO', estimatedRows: 128, message: '演示导出任务已创建' } as T
  if (action.includes('.options') || action.includes('employee.options')) return list([{ id: 'emp-demo-admin', name: '演示经理' }])
  if (action.includes('.list') || action.includes('operations') || action.includes('reports')) return list([])
  return ({ ok: true, id: 'demo-created' } as unknown) as T
}
