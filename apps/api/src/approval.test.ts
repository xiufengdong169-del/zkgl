import { describe, expect, it } from 'vitest'

import {
  approveCurrentNode,
  createApprovalSnapshot,
  startApproval,
  terminateApproval,
  type ApprovalTemplate
} from './approval.js'

const template: ApprovalTemplate = {
  id: 't1', code: 'PROJECT_PAYMENT', businessType: 'PROJECT_PAYMENT', version: 3,
  nodes: [
    { order: 1, name: '项目负责人', positionCode: 'PROJECT_MANAGER', minimumAmount: null, maximumAmount: null, cc: false },
    { order: 2, name: '财务复核', positionCode: 'FINANCE_REVIEWER', minimumAmount: null, maximumAmount: null, cc: false },
    { order: 3, name: '公司负责人', positionCode: 'COMPANY_PRINCIPAL', minimumAmount: 100000, maximumAmount: null, cc: false },
    { order: 90, name: '经营抄送', positionCode: 'OPERATIONS_MANAGER', minimumAmount: 50000, maximumAmount: null, cc: true }
  ]
}
const resolve = (position: string) => ({
  PROJECT_MANAGER: ['u1', 'u2'], FINANCE_REVIEWER: ['u3'], COMPANY_PRINCIPAL: ['u4'], OPERATIONS_MANAGER: ['u5']
}[position] ?? [])

describe('approval engine', () => {
  it('按金额阈值选择节点并冻结配置快照', () => {
    const snapshot = createApprovalSnapshot(template, 120000)
    expect(snapshot.approvalNodes.map((node) => node.positionCode)).toEqual([
      'PROJECT_MANAGER', 'FINANCE_REVIEWER', 'COMPANY_PRINCIPAL'
    ])
    template.nodes[0]!.positionCode = 'CHANGED_AFTER_SUBMISSION'
    expect(snapshot.approvalNodes[0]!.positionCode).toBe('PROJECT_MANAGER')
  })

  it('低于阈值时不进入公司负责人节点', () => {
    expect(createApprovalSnapshot(template, 1000).approvalNodes.map((node) => node.positionCode))
      .not.toContain('COMPANY_PRINCIPAL')
  })

  it('岗位多人时任一人通过并取消同节点其余待办', () => {
    template.nodes[0]!.positionCode = 'PROJECT_MANAGER'
    const state = startApproval({ id: 'i1', businessType: 'X', businessId: 'b1', applicantId: 'app', amount: 120000 }, template, resolve)
    expect(state.ccRecipientIds).toEqual(['u5'])
    const approved = approveCurrentNode(state, 'u1', 'action-1', resolve)
    expect(approved.currentNodeOrder).toBe(2)
    expect(approved.tasks.find((task) => task.assigneeId === 'u2')?.status).toBe('CANCELLED')
    expect(approveCurrentNode(approved, 'u1', 'action-1', resolve)).toBe(approved)
  })

  it('仅申请人可以撤回', () => {
    const state = startApproval({ id: 'i2', businessType: 'X', businessId: 'b2', applicantId: 'app', amount: 1000 }, template, resolve)
    expect(() => terminateApproval(state, 'WITHDRAW', 'other', 'a2')).toThrow('仅申请人可撤回')
    expect(terminateApproval(state, 'WITHDRAW', 'app', 'a3').status).toBe('WITHDRAWN')
  })

  it('非当前节点审批人不能退回或驳回', () => {
    const state = startApproval({ id: 'i3', businessType: 'X', businessId: 'b3', applicantId: 'app', amount: 1000 }, template, resolve)
    expect(() => terminateApproval(state, 'REJECT', 'other', 'a4')).toThrow('没有该节点的有效待办')
    expect(terminateApproval(state, 'RETURN', 'u1', 'a5').status).toBe('RETURNED')
  })
})
