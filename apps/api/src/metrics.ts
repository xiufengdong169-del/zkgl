import { AppError } from './errors.js'

export interface ProjectMetricsInput {
  estimatedRevenueExTax: number
  estimatedCost: number
  confirmedIncomeContractExTax: number
  confirmedCost: number
  actualReceipts: number
  actualOperatingPayments: number
  depositPaid: number
  depositReturned: number
}

export function calculateProjectMetrics(input: ProjectMetricsInput) {
  return {
    expectedProfit: input.estimatedRevenueExTax - input.estimatedCost,
    contractOperatingProfit: input.confirmedIncomeContractExTax - input.confirmedCost,
    cashContribution: input.actualReceipts - input.actualOperatingPayments,
    capitalOccupied: Math.max(0, input.depositPaid - input.depositReturned),
    disclaimer: '内部项目经营口径，不属于会计利润'
  }
}

export interface PageRequest { page?: number; pageSize?: number }
export function normalizePage(input: PageRequest) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 20
  if (!Number.isInteger(page) || page < 1) throw new AppError('INVALID_PAGE', '页码必须为正整数')
  if (![20, 50].includes(pageSize)) throw new AppError('INVALID_PAGE_SIZE', '每页仅允许 20 或 50 条')
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function chooseExportMode(rowCount: number, synchronousLimit = 1000) {
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new AppError('INVALID_EXPORT_COUNT', '导出数量非法')
  return rowCount >= synchronousLimit ? 'BACKGROUND' as const : 'SYNCHRONOUS' as const
}
