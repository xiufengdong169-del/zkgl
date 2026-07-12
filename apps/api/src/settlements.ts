import type { SettlementBasis } from '@zkgl/shared'
import { AppError } from './errors.js'

export function roundHalfUpFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) throw new AppError('INVALID_ROUNDING_INPUT', '舍入参数非法')
  return (numerator * 2n + denominator) / (denominator * 2n)
}

export interface SettlementCalculation {
  basis: SettlementBasis
  basisCents: bigint
  ratioPpm: bigint | null
  fixedCents: bigint | null
  historicalSettledCents: bigint
  deductionCents: bigint
  lowerLimitCents: bigint | null
  upperLimitCents: bigint | null
}
export function calculateSettlement(input: SettlementCalculation) {
  let theoretical = input.basis === 'FIXED'
    ? (input.fixedCents ?? 0n)
    : roundHalfUpFraction(input.basisCents * (input.ratioPpm ?? 0n), 1_000_000n)
  if (input.lowerLimitCents !== null && theoretical < input.lowerLimitCents) theoretical = input.lowerLimitCents
  if (input.upperLimitCents !== null && theoretical > input.upperLimitCents) theoretical = input.upperLimitCents
  const available = theoretical - input.historicalSettledCents
  const net = available - input.deductionCents
  if (available < 0n || net < 0n) throw new AppError('SETTLEMENT_LIMIT_EXCEEDED', '历史结算或扣减超过理论累计可结算额', 409)
  return { theoreticalCents: theoretical, availableCents: available, netSettlementCents: net }
}

export function validateRatioTotal(existingRatioPpm: bigint, newRatioPpm: bigint): void {
  if (existingRatioPpm + newRatioPpm > 1_000_000n) throw new AppError('PARTNER_RATIO_EXCEEDED', '同一项目同一基数的合作比例合计不得超过 100%', 409)
}

export function freezeSettlementSnapshot<T extends object>(input: T): Readonly<T> {
  return Object.freeze(structuredClone(input))
}

export function depositMetrics(input: { paidCents: bigint; returnedCents: bigint; forfeitedCents: bigint; lossApproved: boolean }) {
  const occupied = input.paidCents - input.returnedCents - input.forfeitedCents
  if (occupied < 0n) throw new AppError('DEPOSIT_BALANCE_INVALID', '保证金退回或没收金额超过实缴金额', 409)
  return { occupiedCents: occupied, confirmedCostCents: input.lossApproved ? input.forfeitedCents : 0n }
}

export interface CloseCheck { acceptancePassed: boolean; archivePassed: boolean; outstandingReceivable: boolean; unreturnedDeposit: boolean; openIssues: boolean }
export interface OpenItem { type: string; description: string; responsibleId: string; dueOn: string }
export function validateProjectClose(check: CloseCheck, type: 'NORMAL' | 'WITH_OPEN_ITEMS', items: OpenItem[], approverRole?: string): void {
  if (!check.acceptancePassed || !check.archivePassed) throw new AppError('CLOSE_PREREQUISITE_FAILED', '验收或文件归档检查未通过', 409)
  const hasOpen = check.outstandingReceivable || check.unreturnedDeposit || check.openIssues
  if (hasOpen && type === 'NORMAL') throw new AppError('OPEN_ITEMS_EXIST', '存在遗留事项，不能普通结项', 409)
  if (hasOpen && (items.length === 0 || items.some((item) => !item.description || !item.responsibleId || !item.dueOn))) throw new AppError('OPEN_ITEMS_INCOMPLETE', '必须完整填写遗留事项责任人和期限', 409)
  if (hasOpen && approverRole !== 'COMPANY_PRINCIPAL') throw new AppError('SPECIAL_CLOSE_APPROVER_REQUIRED', '带遗留事项结项仅公司负责人可特批', 403)
}
