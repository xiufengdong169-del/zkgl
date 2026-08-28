const technicalWorkflowCodePattern =
  /^WF-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const businessTypeLabels: Record<string, string> = {
  LEAD: "线索登记",
  PROJECT: "项目",
  BID_APPLICATION: "投标申请",
  CONTRACT: "合同审批",
  CONTRACT_CHANGE: "合同变更",
  DAILY_PURCHASE: "日常采购",
  DEPOSIT: "保证金",
  DEPOSIT_LOSS: "保证金没收损失",
  EXPENSE_REIMBURSEMENT: "费用报销",
  INVOICE_APPLICATION: "开票申请",
  PARTNER_SETTLEMENT: "合作方结算",
  PROJECT_ACCEPTANCE: "项目验收",
  PROJECT_APPLICATION: "项目立项",
  PROJECT_CHANGE: "项目变更",
  PROJECT_CLOSE: "项目结项",
  PROJECT_PAYMENT: "项目付款",
  PROJECT_START: "项目启动",
};

export function businessTypeText(value?: string | null) {
  return (value && businessTypeLabels[value]) || value || "-";
}

export function approvalCodeText(
  code?: string | null,
  businessType?: string | null,
) {
  if (!code) return "审批单";
  if (!technicalWorkflowCodePattern.test(code)) return code;
  const prefix = businessTypeText(businessType);
  if (!prefix || prefix === "-") return "审批单";
  return prefix.endsWith("审批") ? prefix : `${prefix}审批`;
}
