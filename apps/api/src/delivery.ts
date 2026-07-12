import type { ProjectStartType, RiskStatus, StageStatus } from '@zkgl/shared'
import { z } from 'zod'
import { AppError } from './errors.js'

export const projectStartInput = z.object({
  projectId: z.string().min(1), startType: z.enum(['NORMAL', 'EARLY']), startedOn: z.iso.date(), projectManagerId: z.string().min(1),
  objectives: z.string().trim().min(2), scopeDescription: z.string().trim().min(2), communicationMechanism: z.string().trim().min(2),
  deliverables: z.string().trim().min(2), risks: z.string().trim().nullable().optional(), currentContractStatus: z.string().nullable().optional(),
  earlyStartReason: z.string().trim().nullable().optional(), startBasis: z.string().trim().nullable().optional(),
  estimatedContractAmount: z.number().nonnegative().nullable().optional(), expectedSigningOn: z.iso.date().nullable().optional()
}).superRefine((value, context) => {
  if (value.startType === 'EARLY') {
    for (const [key, data] of [['earlyStartReason', value.earlyStartReason], ['startBasis', value.startBasis], ['expectedSigningOn', value.expectedSigningOn]] as const) {
      if (!data) context.addIssue({ code: 'custom', path: [key], message: '提前启动必须填写该项' })
    }
  }
})

export function validateStartEligibility(type: ProjectStartType, hasEffectiveContract: boolean, approvalPassed: boolean): { reminderRequired: boolean } {
  if (type === 'NORMAL' && !hasEffectiveContract) throw new AppError('EFFECTIVE_CONTRACT_REQUIRED', '正常启动必须存在有效合同', 409)
  if (type === 'EARLY' && !approvalPassed) throw new AppError('EARLY_START_APPROVAL_REQUIRED', '提前启动必须审批通过', 409)
  return { reminderRequired: type === 'EARLY' && !hasEffectiveContract }
}

type StageAction = 'START' | 'SUBMIT_CONFIRMATION' | 'CONFIRM' | 'DELAY' | 'SUSPEND' | 'RESUME' | 'CANCEL'
const stageTransitions: Record<StageStatus, Partial<Record<StageAction, StageStatus>>> = {
  NOT_STARTED: { START: 'IN_PROGRESS', CANCEL: 'CANCELLED' }, IN_PROGRESS: { SUBMIT_CONFIRMATION: 'PENDING_CONFIRMATION', DELAY: 'DELAYED', SUSPEND: 'SUSPENDED', CANCEL: 'CANCELLED' },
  PENDING_CONFIRMATION: { CONFIRM: 'COMPLETED', DELAY: 'DELAYED' }, DELAYED: { START: 'IN_PROGRESS', SUSPEND: 'SUSPENDED', CANCEL: 'CANCELLED' },
  SUSPENDED: { RESUME: 'IN_PROGRESS', CANCEL: 'CANCELLED' }, COMPLETED: {}, CANCELLED: {}
}
export function transitionStage(status: StageStatus, action: StageAction): StageStatus {
  const next = stageTransitions[status][action]
  if (!next) throw new AppError('INVALID_STAGE_TRANSITION', `阶段状态 ${status} 不允许执行 ${action}`, 409)
  return next
}

type RiskAction = 'START' | 'SUBMIT_VERIFY' | 'CLOSE' | 'REOPEN'
const riskTransitions: Record<RiskStatus, Partial<Record<RiskAction, RiskStatus>>> = {
  PENDING: { START: 'IN_PROGRESS' }, IN_PROGRESS: { SUBMIT_VERIFY: 'PENDING_VERIFICATION' },
  PENDING_VERIFICATION: { CLOSE: 'CLOSED', REOPEN: 'REOPENED' }, CLOSED: { REOPEN: 'REOPENED' }, REOPENED: { START: 'IN_PROGRESS' }
}
export function transitionRisk(status: RiskStatus, action: RiskAction): RiskStatus {
  const next = riskTransitions[status][action]
  if (!next) throw new AppError('INVALID_RISK_TRANSITION', `风险状态 ${status} 不允许执行 ${action}`, 409)
  return next
}
