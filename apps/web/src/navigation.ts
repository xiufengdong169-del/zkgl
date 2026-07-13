export interface NavigationItem {
  to: string;
  label: string;
  permission?: string;
}

export const navigationItems: NavigationItem[] = [
  { to: "/", label: "工作台" },
  { to: "/customers", label: "客户管理", permission: "crm.counterparty.read" },
  { to: "/leads", label: "市场线索", permission: "lead.read" },
  { to: "/projects", label: "项目管理", permission: "project.read" },
  { to: "/bids", label: "投标管理", permission: "bid.application.read" },
  { to: "/contracts", label: "合同管理", permission: "contract.read" },
  { to: "/delivery", label: "项目实施", permission: "project.delivery.read" },
  { to: "/finance", label: "收支管理", permission: "finance.read" },
  { to: "/settlements", label: "结算保证金", permission: "settlement.read" },
  { to: "/files", label: "项目文件", permission: "file.read" },
  { to: "/approvals", label: "审批待办", permission: "approval.task.read" },
  { to: "/reports", label: "统计报表", permission: "report.financial.read" },
  { to: "/admin", label: "系统管理", permission: "system.admin" },
];

export function hasPermission(
  permissionCodes: readonly string[],
  permission?: string,
): boolean {
  return permission == null || permissionCodes.includes(permission);
}

export function visibleNavigation(
  permissionCodes: readonly string[],
): NavigationItem[] {
  return navigationItems.filter((item) =>
    hasPermission(permissionCodes, item.permission),
  );
}
