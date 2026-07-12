import { describe, expect, it } from 'vitest'
import { calculateSettlement, depositMetrics, freezeSettlementSnapshot, roundHalfUpFraction, validateProjectClose, validateRatioTotal } from './settlements.js'

describe('partner settlement and close', () => {
  it('使用 ROUND_HALF_UP 精确到分', () => expect(roundHalfUpFraction(1005n, 10n)).toBe(101n))
  it('AC-04 按实际收款20%扣除历史结算计算本次上限', () => {
    const result=calculateSettlement({basis:'ACTUAL_RECEIPTS',basisCents:100_000_000n,ratioPpm:200_000n,fixedCents:null,historicalSettledCents:10_000_000n,deductionCents:0n,lowerLimitCents:null,upperLimitCents:null})
    expect(result.availableCents).toBe(10_000_000n)
  })
  it('合作比例合计不得超过100%', () => expect(() => validateRatioTotal(900_000n, 100_001n)).toThrow())
  it('AC-11 历史结算快照不受方案修改影响', () => {
    const source={ratioPpm:200_000,rule:{basis:'ACTUAL_RECEIPTS'}}; const snapshot=freezeSettlementSnapshot(source); source.ratioPpm=300_000
    expect(snapshot.ratioPpm).toBe(200_000)
  })
  it('AC-06 保证金支付退回不计成本', () => expect(depositMetrics({paidCents:500_000n,returnedCents:500_000n,forfeitedCents:0n,lossApproved:false})).toEqual({occupiedCents:0n,confirmedCostCents:0n}))
  it('AC-07 没收审批后才计成本', () => {
    expect(depositMetrics({paidCents:500_000n,returnedCents:0n,forfeitedCents:500_000n,lossApproved:false}).confirmedCostCents).toBe(0n)
    expect(depositMetrics({paidCents:500_000n,returnedCents:0n,forfeitedCents:500_000n,lossApproved:true}).confirmedCostCents).toBe(500_000n)
  })
  it('AC-15 遗留事项结项仅公司负责人特批', () => {
    const check={acceptancePassed:true,archivePassed:true,outstandingReceivable:true,unreturnedDeposit:true,openIssues:true}
    expect(() => validateProjectClose(check,'NORMAL',[])).toThrow()
    const items=[{type:'RECEIVABLE',description:'催收',responsibleId:'u1',dueOn:'2026-08-01'}]
    expect(() => validateProjectClose(check,'WITH_OPEN_ITEMS',items,'OPERATIONS_MANAGER')).toThrow()
    expect(() => validateProjectClose(check,'WITH_OPEN_ITEMS',items,'COMPANY_PRINCIPAL')).not.toThrow()
  })
})
