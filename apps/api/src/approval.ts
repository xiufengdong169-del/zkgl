import type { ApprovalInstanceStatus, ApprovalTaskStatus } from '@zkgl/shared'

import { AppError } from './errors.js'

export interface ApprovalTemplateNode {
  order: number
  name: string
  positionCode: string
  minimumAmount: number | null
  maximumAmount: number | null
  cc: boolean
}

export interface ApprovalTemplate {
  id: string
  code: string
  businessType: string
  version: number
  nodes: ApprovalTemplateNode[]
}

export interface ApprovalSnapshot {
  templateId: string
  templateCode: string
  templateVersion: number
  approvalNodes: ApprovalTemplateNode[]
  ccNodes: ApprovalTemplateNode[]
}

export interface ApprovalTaskState {
  id: string
  nodeOrder: number
  positionCode: string
  assigneeId: string
  status: ApprovalTaskStatus
}

export interface ApprovalInstanceState {
  id: string
  businessType: string
  businessId: string
  applicantId: string
  amount: number | null
  status: ApprovalInstanceStatus
  currentNodeOrder: number | null
  snapshot: ApprovalSnapshot
  tasks: ApprovalTaskState[]
  ccRecipientIds: string[]
  completedActionKeys: string[]
}

export type PositionResolver = (positionCode: string) => string[]

function amountMatches(node: ApprovalTemplateNode, amount: number | null): boolean {
  if (node.minimumAmount !== null && (amount === null || amount < node.minimumAmount)) return false
  if (node.maximumAmount !== null && (amount === null || amount > node.maximumAmount)) return false
  return true
}

export function createApprovalSnapshot(template: ApprovalTemplate, amount: number | null): ApprovalSnapshot {
  const applicable = template.nodes.filter((node) => amountMatches(node, amount))
  const clone = (nodes: ApprovalTemplateNode[]) => nodes
    .map((node) => ({ ...node }))
    .sort((left, right) => left.order - right.order)
  return {
    templateId: template.id,
    templateCode: template.code,
    templateVersion: template.version,
    approvalNodes: clone(applicable.filter((node) => !node.cc)),
    ccNodes: clone(applicable.filter((node) => node.cc))
  }
}

function tasksForNode(instanceId: string, node: ApprovalTemplateNode, resolve: PositionResolver): ApprovalTaskState[] {
  const assignees = [...new Set(resolve(node.positionCode))]
  if (assignees.length === 0) {
    throw new AppError('APPROVER_NOT_CONFIGURED', `岗位 ${node.positionCode} 未配置有效任职人员`, 409)
  }
  return assignees.map((assigneeId) => ({
    id: `${instanceId}:${node.order}:${assigneeId}`,
    nodeOrder: node.order,
    positionCode: node.positionCode,
    assigneeId,
    status: 'PENDING'
  }))
}

export function startApproval(
  input: { id: string; businessType: string; businessId: string; applicantId: string; amount: number | null },
  template: ApprovalTemplate,
  resolve: PositionResolver
): ApprovalInstanceState {
  const snapshot = createApprovalSnapshot(template, input.amount)
  const first = snapshot.approvalNodes[0]
  if (!first) throw new AppError('APPROVAL_NODES_EMPTY', '审批模板没有适用的审批节点', 409)
  const ccRecipientIds = [...new Set(snapshot.ccNodes.flatMap((node) => resolve(node.positionCode)))]
  for (const node of snapshot.ccNodes) {
    if (!ccRecipientIds.some((recipient) => resolve(node.positionCode).includes(recipient))) {
      throw new AppError('CC_RECIPIENT_NOT_CONFIGURED', `抄送岗位 ${node.positionCode} 未配置有效任职人员`, 409)
    }
  }
  return {
    ...input,
    status: 'PENDING',
    currentNodeOrder: first.order,
    snapshot,
    tasks: tasksForNode(input.id, first, resolve),
    ccRecipientIds,
    completedActionKeys: []
  }
}

export function approveCurrentNode(
  state: ApprovalInstanceState,
  operatorId: string,
  actionKey: string,
  resolve: PositionResolver
): ApprovalInstanceState {
  if (state.completedActionKeys.includes(actionKey)) return state
  if (state.status !== 'PENDING' || state.currentNodeOrder === null) {
    throw new AppError('APPROVAL_NOT_PENDING', '审批实例当前不可审批', 409)
  }
  const ownTask = state.tasks.find((task) =>
    task.nodeOrder === state.currentNodeOrder && task.assigneeId === operatorId && task.status === 'PENDING'
  )
  if (!ownTask) throw new AppError('APPROVAL_TASK_NOT_FOUND', '当前用户没有该节点的有效待办', 403)

  const tasks = state.tasks.map((task): ApprovalTaskState =>
    task.nodeOrder === state.currentNodeOrder && task.status === 'PENDING'
      ? { ...task, status: task.assigneeId === operatorId ? 'APPROVED' : 'CANCELLED' }
      : task
  )
  const currentIndex = state.snapshot.approvalNodes.findIndex((node) => node.order === state.currentNodeOrder)
  const nextNode = state.snapshot.approvalNodes[currentIndex + 1]
  if (!nextNode) {
    return { ...state, status: 'APPROVED', currentNodeOrder: null, tasks, completedActionKeys: [...state.completedActionKeys, actionKey] }
  }
  return {
    ...state,
    currentNodeOrder: nextNode.order,
    tasks: [...tasks, ...tasksForNode(state.id, nextNode, resolve)],
    completedActionKeys: [...state.completedActionKeys, actionKey]
  }
}

export function terminateApproval(
  state: ApprovalInstanceState,
  action: 'RETURN' | 'REJECT' | 'WITHDRAW',
  operatorId: string,
  actionKey: string
): ApprovalInstanceState {
  if (state.completedActionKeys.includes(actionKey)) return state
  if (state.status !== 'PENDING') throw new AppError('APPROVAL_NOT_PENDING', '审批实例已结束', 409)
  if (action === 'WITHDRAW' && operatorId !== state.applicantId) {
    throw new AppError('WITHDRAW_NOT_APPLICANT', '仅申请人可撤回', 403)
  }
  if (action !== 'WITHDRAW') {
    const canAct = state.tasks.some((task) =>
      task.nodeOrder === state.currentNodeOrder && task.assigneeId === operatorId && task.status === 'PENDING'
    )
    if (!canAct) throw new AppError('APPROVAL_TASK_NOT_FOUND', '当前用户没有该节点的有效待办', 403)
  }
  const status: ApprovalInstanceStatus = action === 'RETURN' ? 'RETURNED' : action === 'REJECT' ? 'REJECTED' : 'WITHDRAWN'
  return {
    ...state,
    status,
    currentNodeOrder: null,
    tasks: state.tasks.map((task) => task.status === 'PENDING' ? { ...task, status: 'CANCELLED' } : task),
    completedActionKeys: [...state.completedActionKeys, actionKey]
  }
}
