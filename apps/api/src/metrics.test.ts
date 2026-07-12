import { describe, expect, it } from 'vitest'
import { calculateProjectMetrics, chooseExportMode, normalizePage } from './metrics.js'

describe('metrics and query controls', () => {
  it('固定三套利润与贡献口径且保证金只影响占用', () => {
    const result=calculateProjectMetrics({estimatedRevenueExTax:100,estimatedCost:60,confirmedIncomeContractExTax:120,confirmedCost:70,actualReceipts:90,actualOperatingPayments:40,depositPaid:10,depositReturned:3})
    expect(result).toMatchObject({expectedProfit:40,contractOperatingProfit:50,cashContribution:50,capitalOccupied:7})
    expect(result.disclaimer).toContain('不属于会计利润')
  })
  it('列表强制使用20或50条分页', () => {
    expect(normalizePage({})).toEqual({page:1,pageSize:20,offset:0})
    expect(() => normalizePage({page:1,pageSize:100})).toThrow()
  })
  it('1000条及以上导出转后台任务', () => {
    expect(chooseExportMode(999)).toBe('SYNCHRONOUS'); expect(chooseExportMode(1000)).toBe('BACKGROUND')
  })
})
