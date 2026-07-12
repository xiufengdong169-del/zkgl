import { z } from 'zod'
import { AppError } from './errors.js'

export interface AllocationInput { receiptAmount: number; receiptAllocated: number; invoiceAmount: number; invoiceAllocated: number; allocationAmount: number; receiptType: 'ADVANCE' | 'NORMAL' | 'OTHER' }

export const invoiceApplicationInput = z.object({
  projectId:z.string().min(1),contractId:z.string().min(1),requestedAmount:z.number().positive(),
  invoiceType:z.enum(['VAT_SPECIAL','VAT_NORMAL','OTHER']),taxRate:z.number().min(0).max(1),
  invoiceContent:z.string().trim().min(1),buyerInformation:z.string().trim().min(1),plannedInvoiceOn:z.iso.date(),
  collectionCondition:z.string().trim().nullable().optional(),applicantId:z.string().min(1)
})

export const receiptInput = z.object({
  projectId:z.string().min(1),contractId:z.string().min(1),customerId:z.string().min(1),receivedOn:z.iso.date(),amount:z.number().positive(),
  receivingAccount:z.string().trim().min(1).max(128),payerName:z.string().trim().min(1),payerAccount:z.string().trim().max(128).nullable().optional(),
  receiptType:z.enum(['ADVANCE','NORMAL','OTHER']),voucherNumber:z.string().trim().max(128).nullable().optional(),operatorId:z.string().min(1)
})

export const paymentApplicationInput = z.object({
  projectId:z.string().min(1),sourceType:z.enum(['EXPENSE_CONTRACT','REIMBURSEMENT','PARTNER_SETTLEMENT','DEPOSIT','PURCHASE']),sourceId:z.string().min(1),
  recipientName:z.string().trim().min(1),paymentType:z.string().trim().min(1).max(64),requestedAmount:z.number().positive(),plannedOn:z.iso.date(),
  paymentBasis:z.string().trim().min(1),receivingAccount:z.string().trim().min(1).max(128),invoiceRequired:z.boolean(),operatorId:z.string().min(1)
})
export function validateReceiptInvoiceAllocation(input: AllocationInput): void {
  if (input.receiptType === 'ADVANCE') throw new AppError('ADVANCE_RECEIPT_NOT_ALLOCATABLE', '预收款暂不允许核销发票', 409)
  if (input.allocationAmount <= 0) throw new AppError('ALLOCATION_AMOUNT_INVALID', '核销金额必须大于零')
  if (input.allocationAmount > input.receiptAmount - input.receiptAllocated) throw new AppError('RECEIPT_BALANCE_EXCEEDED', '核销金额超过收款未分配余额', 409)
  if (input.allocationAmount > input.invoiceAmount - input.invoiceAllocated) throw new AppError('INVOICE_BALANCE_EXCEEDED', '核销金额超过发票未核销余额', 409)
}

export function validateInvoiceCapacity(contractAmount: number, effectiveInvoicedAmount: number, requestedAmount: number): number {
  const available = contractAmount - effectiveInvoicedAmount
  if (requestedAmount <= 0 || requestedAmount > available) throw new AppError('INVOICE_CAPACITY_EXCEEDED', '申请开票金额超过合同可开票余额', 409)
  return available
}

export const reimbursementInput = z.object({
  claimantId: z.string().min(1), departmentId: z.string().min(1), projectId: z.string().nullable().optional(),
  reason: z.string().trim().min(2), paymentRecipient: z.string().trim().min(1), receivingAccount: z.string().trim().min(1),
  details: z.array(z.object({ expenseType: z.string().min(1), incurredOn: z.iso.date(), amount: z.number().positive(), description: z.string().min(1), hasInvoice: z.boolean(), invoiceNumber: z.string().nullable().optional(), invoicingParty: z.string().nullable().optional() })).min(1)
})

export const dailyPurchaseInput = z.object({
  applicantId:z.string().min(1),departmentId:z.string().min(1),purchaseType:z.string().trim().min(1).max(64),
  supplierId:z.string().nullable().optional(),itemDescription:z.string().trim().min(1),quantity:z.number().positive(),
  budgetAmount:z.number().nonnegative(),purpose:z.string().trim().min(1),expectedOn:z.iso.date(),paymentMethod:z.string().trim().min(1).max(64),
  contractRelated:z.boolean().default(false),contractId:z.string().nullable().optional()
}).superRefine((value,ctx)=>{if(value.contractRelated&&!value.contractId)ctx.addIssue({code:'custom',path:['contractId'],message:'关联合同时必须选择合同'})})
export function reimbursementTotal(details: Array<{ amount: number }>): number {
  return Math.round(details.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
}

export interface CostMetricsInput { approvedReimbursement: number; approvedPartnerSettlement: number; confirmedExpensePerformance: number; confirmedDepositLoss: number; actualOperatingPayments: number }
export function calculateCostMetrics(input: CostMetricsInput) {
  return {
    confirmedCost: input.approvedReimbursement + input.approvedPartnerSettlement + input.confirmedExpensePerformance + input.confirmedDepositLoss,
    paidAmount: input.actualOperatingPayments,
    cashOutflow: input.actualOperatingPayments
  }
}
