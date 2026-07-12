import { describe, expect, it } from 'vitest'
import { projectStartInput, transitionRisk, transitionStage, validateStartEligibility } from './delivery.js'

describe('project delivery', () => {
  it('AC-10 无合同不能正常启动', () => expect(() => validateStartEligibility('NORMAL', false, false)).toThrow('有效合同'))
  it('提前启动审批后允许实施并生成补签提醒', () => expect(validateStartEligibility('EARLY', false, true)).toEqual({ reminderRequired: true }))
  it('提前启动必须填写依据、原因和预计签约日期', () => {
    expect(projectStartInput.safeParse({ projectId: 'p1', startType: 'EARLY', startedOn: '2026-07-13', projectManagerId: 'e1', objectives: '目标', scopeDescription: '范围', communicationMechanism: '周会', deliverables: '成果' }).success).toBe(false)
  })
  it('阶段必须确认后完成', () => {
    expect(() => transitionStage('IN_PROGRESS', 'CONFIRM')).toThrow()
    expect(transitionStage('PENDING_CONFIRMATION', 'CONFIRM')).toBe('COMPLETED')
  })
  it('关闭风险可重新打开', () => expect(transitionRisk('CLOSED', 'REOPEN')).toBe('REOPENED'))
})
