<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { callApi } from "../api";

interface Department {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  status: string;
  version?: number;
}
interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  employeeType: string;
  departmentId: string;
  departmentName: string;
  positionName?: string;
  mobile?: string | null;
  email?: string | null;
  joinedOn?: string | null;
  leftOn?: string | null;
  supervisorId?: string | null;
  supervisorName?: string | null;
  accountStatus: "ENABLED" | "DISABLED";
  version?: number;
}
interface Role {
  id: string;
  code: string;
  name: string;
  status: string;
  version?: number;
  userCount?: number;
  permissionCount?: number;
}
interface Permission {
  id: string;
  code: string;
  name: string;
  permissionType: string;
}
interface RolePermission {
  roleId: string;
  permissionId: string;
}
type DataScopeType =
  | "ALL"
  | "SELF"
  | "OWNER"
  | "CREATOR"
  | "PARTICIPANT"
  | "DEPARTMENT"
  | "PROJECT";
interface RoleDataScope {
  id: string;
  roleId: string;
  scopeType: DataScopeType;
  scopeValue: string;
  status: string;
}
interface SensitiveGrant {
  id: string;
  roleId: string;
  fieldCode: string;
  accessLevel: "FULL" | "MASKED";
  explicitDeny: number | boolean;
  status: string;
}
interface User {
  id: string;
  username: string;
  cloudbaseUid: string;
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  mobile?: string | null;
  email?: string | null;
  status: "ENABLED" | "DISABLED";
  roleNames?: string;
  roleIds?: string;
}
interface NumberRule {
  id: string;
  ruleCode: string;
  prefix: string;
  yearPattern: string;
  serialLength: number;
  nextSerial: number;
  currentYear: number;
  status: "ENABLED" | "DISABLED";
  version: number;
}
interface SystemParameter {
  id: string;
  parameterKey: string;
  name: string;
  parameterValue: string;
  valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
  description: string | null;
  status: "ENABLED" | "DISABLED";
  version: number;
}
interface ApprovalTemplate {
  id: string;
  templateCode: string;
  name: string;
  businessType: string;
  version: number;
  status: string;
  nodeCount: number;
}
interface ApprovalNode {
  id: string;
  templateId: string;
  nodeOrder: number;
  nodeName: string;
  positionCode: string;
  minimumAmount: number | null;
  maximumAmount: number | null;
  isCc: number | boolean;
  status: "ENABLED" | "DISABLED";
  version: number;
}
interface Position {
  code: string;
  name: string;
}
interface PositionAssignment {
  id: string;
  positionCode: string;
  positionName: string;
  employeeId: string;
  employeeName: string;
  startsOn: string;
  endsOn: string | null;
  isDelegate: number;
  status: "ENABLED" | "DISABLED";
}
interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
}
interface ProjectGrant {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  employeeId: string;
  employeeName: string;
  startsOn: string;
  endsOn: string | null;
  reason: string | null;
  status: "ENABLED" | "DISABLED";
  grantedBy: string;
  createdAt: string;
}
interface DictionaryType {
  id: string;
  typeCode: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
}
interface DictionaryItem {
  id: string;
  typeId: string;
  itemCode: string;
  label: string;
  valueText: string;
  sortOrder: number;
  status: "ENABLED" | "DISABLED";
  version: number;
}
interface AuditLog {
  id: string;
  requestId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  ipAddress: string | null;
  occurredAt: string;
  username: string | null;
}

const departments = ref<Department[]>([]);
const employees = ref<Employee[]>([]);
const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const rolePermissions = ref<RolePermission[]>([]);
const roleDataScopes = ref<RoleDataScope[]>([]);
const sensitiveGrants = ref<SensitiveGrant[]>([]);
const users = ref<User[]>([]);
const numberRules = ref<NumberRule[]>([]);
const parameters = ref<SystemParameter[]>([]);
const approvalTemplates = ref<ApprovalTemplate[]>([]);
const approvalNodes = ref<ApprovalNode[]>([]);
const positions = ref<Position[]>([]);
const positionAssignments = ref<PositionAssignment[]>([]);
const projectOptions = ref<ProjectOption[]>([]);
const projectGrants = ref<ProjectGrant[]>([]);
const dictionaryTypes = ref<DictionaryType[]>([]);
const dictionaryItems = ref<DictionaryItem[]>([]);
const auditLogs = ref<AuditLog[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);
const activeTab = ref<
  | "organization"
  | "numbers"
  | "parameters"
  | "dictionary"
  | "approvals"
  | "audit"
>("organization");
const auditKeyword = ref("");
const auditOutcome = ref("");
const organizationPane = ref<"departments" | "roles">("departments");
const memberFilter = ref<"active" | "left" | "all">("active");
const departmentKeyword = ref("");
const memberKeyword = ref("");
const accountStatusFilter = ref<"" | "ENABLED" | "DISABLED">("");
const selectedDepartmentId = ref("");
const selectedRoleId = ref("");
const selectedApprovalTemplateId = ref("");
const editingDepartment = ref(false);
const editingEmployeeId = ref("");
const editingRoleId = ref("");
const showDepartmentForm = ref(false);
const showEmployeeForm = ref(false);
const showAccountForm = ref(false);
const showAccountRolePanel = ref(false);
const showAdvancedPermissionPanel = ref(false);
const showRoleForm = ref(false);
const numberRuleDisplay: Record<
  string,
  { name: string; remark: string }
> = {
  BID: {
    name: "投标申请",
    remark: "用于投标登记、投标任务和投标结果相关单据编号。",
  },
  CONTRACT: {
    name: "合同",
    remark: "用于收入合同、支出合同等合同主档编号。",
  },
  CONTRACT_CHANGE: {
    name: "合同变更",
    remark: "用于合同金额、期限、内容发生变更时的变更单编号。",
  },
  COUNTERPARTY: {
    name: "往来单位",
    remark: "用于客户、供应商、合作方等单位档案编号。",
  },
  DAILY_PURCHASE: {
    name: "日常采购",
    remark: "用于办公、项目零星采购等采购申请编号。",
  },
  DEPOSIT: {
    name: "保证金",
    remark: "用于投标保证金、履约保证金等保证金台账编号。",
  },
  EXPORT_TASK: {
    name: "导出任务",
    remark: "用于后台导出文件生成任务编号，便于追踪下载记录。",
  },
  INVOICE_APPLICATION: {
    name: "开票申请",
    remark: "用于项目或合同收款前的开票申请编号。",
  },
  LEAD: {
    name: "商机线索",
    remark: "用于市场线索、销售机会登记编号。",
  },
  PARTNER_PLAN: {
    name: "合作方案",
    remark: "用于外协、合作伙伴分成或结算方案编号。",
  },
  PARTNER_SETTLEMENT: {
    name: "合作结算",
    remark: "用于合作方结算单编号。",
  },
  PAYMENT: {
    name: "付款申请",
    remark: "用于项目成本、采购、保证金等付款申请编号。",
  },
  PROJECT: {
    name: "正式项目",
    remark: "用于立项通过后的项目主编号。",
  },
  PROJECT_APPLICATION: {
    name: "立项申请",
    remark: "用于项目立项申请单编号。",
  },
  PROJECT_CLOSE: {
    name: "项目结项",
    remark: "用于项目完工结项、特殊结项申请编号。",
  },
  RECEIPT: {
    name: "收款登记",
    remark: "用于项目回款、合同收款登记编号。",
  },
  REIMBURSEMENT: {
    name: "费用报销",
    remark: "用于项目费用、日常费用报销单编号。",
  },
  VISIT: {
    name: "客户拜访",
    remark: "用于客户拜访、跟进记录编号。",
  },
};
const approvalBusinessDisplay: Record<string, string> = {
  BID_APPLICATION: "投标申请",
  CONTRACT: "合同审批",
  CONTRACT_CHANGE: "合同变更",
  DAILY_PURCHASE: "日常采购",
  DEPOSIT: "保证金缴纳",
  DEPOSIT_LOSS: "保证金没收损失",
  EXPENSE_REIMBURSEMENT: "费用报销",
  INVOICE_APPLICATION: "开票申请",
  LEAD: "市场报备",
  PARTNER_SETTLEMENT: "合作方结算",
  PROJECT_ACCEPTANCE: "项目验收申请",
  PROJECT_APPLICATION: "项目立项",
  PROJECT_CHANGE: "项目变更",
  PROJECT_CLOSE: "项目结项",
  PROJECT_PAYMENT: "项目付款",
  PROJECT_START: "项目启动",
};
const simpleScopeTypes: DataScopeType[] = [
  "ALL",
  "SELF",
  "OWNER",
  "CREATOR",
  "PARTICIPANT",
];
const scopeTypeLabels: Record<DataScopeType, string> = {
  ALL: "全部数据",
  SELF: "仅本人",
  OWNER: "我负责的",
  CREATOR: "我创建的",
  PARTICIPANT: "我参与的",
  DEPARTMENT: "指定部门",
  PROJECT: "指定项目",
};
const permissionTypeLabels: Record<string, string> = {
  READ: "查看权限",
  WRITE: "操作权限",
  EXPORT: "导出权限",
  APPROVAL: "审批权限",
  SYSTEM: "系统权限",
};
const sensitiveFieldOptions = [
  { code: "bank_account", name: "银行账号" },
  { code: "profit", name: "利润/毛利" },
  { code: "partner_settlement", name: "合作分成/结算" },
];
const department = ref({
  code: "",
  name: "",
  parentId: "",
  managerEmployeeId: "",
});
const departmentEdit = ref({
  name: "",
  parentId: "",
  managerEmployeeId: "",
  status: "ENABLED" as "ENABLED" | "DISABLED",
});
const roleForm = ref({
  code: "",
  name: "",
  permissionIds: [] as string[],
});
const roleEdit = ref({
  name: "",
  status: "ENABLED" as "ENABLED" | "DISABLED",
});
const dictionaryTypeForm = ref({ typeCode: "", name: "", description: "" });
const assignmentForm = ref({
  positionCode: "",
  employeeId: "",
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: "",
  isDelegate: false,
});
const projectGrantForm = ref({
  projectId: "",
  employeeId: "",
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: "",
  reason: "",
});
const dictionaryItemForm = ref({
  typeId: "",
  itemCode: "",
  label: "",
  valueText: "",
  sortOrder: 0,
});
const employee = ref({
  employeeCode: "",
  name: "",
  employeeType: "INTERNAL",
  departmentId: "",
  positionName: "",
  mobile: "",
  email: "",
  joinedOn: "",
});
const employeeEdit = ref({
  name: "",
  employeeType: "INTERNAL",
  departmentId: "",
  positionName: "",
  mobile: "",
  email: "",
  joinedOn: "",
  leftOn: "",
  supervisorId: "",
  accountStatus: "ENABLED" as "ENABLED" | "DISABLED",
});
const account = ref({
  employeeId: "",
  username: "",
  cloudbaseUid: "",
  roleIds: [] as string[],
});

async function load() {
  error.value = null;
  try {
    const data = await callApi<{
      departments: Department[];
      employees: Employee[];
      roles: Role[];
      permissions: Permission[];
      rolePermissions: RolePermission[];
      roleDataScopes: RoleDataScope[];
      sensitiveGrants: SensitiveGrant[];
      users: User[];
      numberRules: NumberRule[];
      parameters: SystemParameter[];
      approvalTemplates: ApprovalTemplate[];
      approvalNodes: ApprovalNode[];
      positions: Position[];
      positionAssignments: PositionAssignment[];
      projectOptions: ProjectOption[];
      projectGrants: ProjectGrant[];
      dictionaryTypes: DictionaryType[];
      dictionaryItems: DictionaryItem[];
    }>("admin.overview", {});
    departments.value = data.departments;
    employees.value = data.employees;
    roles.value = data.roles;
    permissions.value = data.permissions;
    rolePermissions.value = data.rolePermissions;
    roleDataScopes.value = data.roleDataScopes;
    sensitiveGrants.value = data.sensitiveGrants;
    users.value = data.users;
    numberRules.value = data.numberRules;
    parameters.value = data.parameters;
    approvalTemplates.value = data.approvalTemplates;
    approvalNodes.value = data.approvalNodes;
    positions.value = data.positions;
    positionAssignments.value = data.positionAssignments;
    projectOptions.value = data.projectOptions;
    projectGrants.value = data.projectGrants;
    dictionaryTypes.value = data.dictionaryTypes;
    dictionaryItems.value = data.dictionaryItems;
    if (
      !selectedDepartmentId.value ||
      !departments.value.some((item) => item.id === selectedDepartmentId.value)
    ) {
      const departmentIdsWithMembers = new Set(
        employees.value.map((person) => person.departmentId),
      );
      selectedDepartmentId.value =
        departments.value.find((item) => item.name === "商务财务部")?.id ||
        departments.value.find((item) => departmentIdsWithMembers.has(item.id))?.id ||
        departments.value.find((item) => item.status === "ENABLED")?.id ||
        departments.value[0]?.id ||
        "";
    }
    if (
      !selectedRoleId.value ||
      !roles.value.some((item) => item.id === selectedRoleId.value)
    ) {
      selectedRoleId.value =
        roles.value.find((item) => item.code === "ADMIN")?.id ||
        roles.value[0]?.id ||
        "";
    }
    if (
      !selectedApprovalTemplateId.value ||
      !approvalTemplates.value.some(
        (item) => item.id === selectedApprovalTemplateId.value,
      )
    ) {
      selectedApprovalTemplateId.value =
        approvalTemplates.value.find((item) => item.status === "ENABLED")?.id ||
        approvalTemplates.value[0]?.id ||
        "";
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}

async function loadAudit() {
  error.value = null;
  try {
    const result = await callApi<{ items: AuditLog[] }>("admin.audit.list", {
      page: 1,
      pageSize: 50,
      keyword: auditKeyword.value || undefined,
      outcome: auditOutcome.value || undefined,
    });
    auditLogs.value = result.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "审计日志加载失败";
  }
}

async function createDepartment() {
  saving.value = true;
  try {
    await callApi("admin.department.create", {
      ...department.value,
      parentId: department.value.parentId || null,
      managerEmployeeId: department.value.managerEmployeeId || null,
    });
    department.value = {
      code: "",
      name: "",
      parentId: selectedDepartmentId.value || "",
      managerEmployeeId: "",
    };
    showDepartmentForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function createEmployee() {
  saving.value = true;
  try {
    const f = employee.value;
    await callApi("admin.employee.create", {
      ...f,
      positionName: f.positionName || null,
      mobile: f.mobile || null,
      email: f.email || null,
      joinedOn: f.joinedOn || null,
    });
    employee.value = {
      employeeCode: "",
      name: "",
      employeeType: "INTERNAL",
      departmentId: selectedDepartmentId.value || "",
      positionName: "",
      mobile: "",
      email: "",
      joinedOn: "",
    };
    showEmployeeForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function createAccount() {
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.user.create", account.value);
    account.value = {
      employeeId: "",
      username: "",
      cloudbaseUid: "",
      roleIds: [],
    };
    showAccountForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账号创建失败";
  } finally {
    saving.value = false;
  }
}

async function createPositionAssignment() {
  saving.value = true;
  try {
    await callApi("admin.positionAssignment.create", {
      ...assignmentForm.value,
      endsOn: assignmentForm.value.endsOn || null,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "岗位任职保存失败";
  } finally {
    saving.value = false;
  }
}
async function togglePositionAssignment(item: PositionAssignment) {
  try {
    await callApi("admin.positionAssignment.status", {
      assignmentId: item.id,
      status: item.status === "ENABLED" ? "DISABLED" : "ENABLED",
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "任职状态更新失败";
  }
}

async function createProjectGrant() {
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.projectGrant.create", {
      ...projectGrantForm.value,
      endsOn: projectGrantForm.value.endsOn || null,
      reason: projectGrantForm.value.reason || null,
    });
    projectGrantForm.value = {
      projectId: "",
      employeeId: "",
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: "",
      reason: "",
    };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "临时项目授权保存失败";
  } finally {
    saving.value = false;
  }
}

async function toggleProjectGrant(item: ProjectGrant) {
  error.value = null;
  try {
    await callApi("admin.projectGrant.status", {
      grantId: item.id,
      status: item.status === "ENABLED" ? "DISABLED" : "ENABLED",
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "临时项目授权状态更新失败";
  }
}

async function setRoles(user: User, event: Event) {
  const values = Array.from(
    (event.target as HTMLSelectElement).selectedOptions,
  ).map((option) => option.value);
  try {
    await callApi("admin.user.role.set", { userId: user.id, roleIds: values });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "授权失败";
  }
}

async function toggleUserStatus(item: User) {
  error.value = null;
  notice.value = null;
  try {
    const result = await callApi<{ cloudbaseSyncRequired: boolean }>(
      "admin.user.status",
      {
        userId: item.id,
        status: item.status === "ENABLED" ? "DISABLED" : "ENABLED",
      },
    );
    if (result.cloudbaseSyncRequired)
      notice.value = "内部账号状态已更新；请同步更新云开发身份账号状态。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账号状态更新失败";
  }
}

async function saveNumberRule(rule: NumberRule) {
  saving.value = true;
  try {
    await callApi("admin.numberRule.update", {
      ruleId: rule.id,
      prefix: rule.prefix,
      serialLength: Number(rule.serialLength),
      status: rule.status,
      version: rule.version,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "编号规则保存失败";
  } finally {
    saving.value = false;
  }
}
async function saveParameter(parameter: SystemParameter) {
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.parameter.update", {
      parameterId: parameter.id,
      name: parameter.name,
      parameterValue: parameter.parameterValue,
      description: parameter.description || null,
      status: parameter.status,
      version: parameter.version,
    });
    await load();
    notice.value = `${parameter.parameterKey} 已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "系统参数保存失败";
  } finally {
    saving.value = false;
  }
}
async function createDictionaryType() {
  saving.value = true;
  try {
    await callApi("admin.dictionary.type.create", {
      ...dictionaryTypeForm.value,
      description: dictionaryTypeForm.value.description || null,
    });
    dictionaryTypeForm.value = { typeCode: "", name: "", description: "" };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "字典类型保存失败";
  } finally {
    saving.value = false;
  }
}
async function createDictionaryItem() {
  saving.value = true;
  try {
    await callApi("admin.dictionary.item.create", dictionaryItemForm.value);
    dictionaryItemForm.value = {
      typeId: dictionaryItemForm.value.typeId,
      itemCode: "",
      label: "",
      valueText: "",
      sortOrder: 0,
    };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "字典项保存失败";
  } finally {
    saving.value = false;
  }
}
async function saveDictionaryItem(item: DictionaryItem) {
  saving.value = true;
  try {
    await callApi("admin.dictionary.item.update", {
      itemId: item.id,
      label: item.label,
      valueText: item.valueText,
      sortOrder: Number(item.sortOrder),
      status: item.status,
      version: item.version,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "字典项更新失败";
  } finally {
    saving.value = false;
  }
}
async function saveApprovalNode(node: ApprovalNode) {
  saving.value = true;
  try {
    await callApi("admin.approvalNode.update", {
      nodeId: node.id,
      nodeName: node.nodeName,
      positionCode: node.positionCode,
      minimumAmount:
        node.minimumAmount == null ? null : Number(node.minimumAmount),
      maximumAmount:
        node.maximumAmount == null ? null : Number(node.maximumAmount),
      isCc: Boolean(node.isCc),
      status: node.status,
      version: node.version,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "审批节点更新失败";
  } finally {
    saving.value = false;
  }
}

async function refreshReminders() {
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("reminder.refresh", {});
    notice.value = "提醒任务已立即执行，请到工作台消息或审计日志复核结果。";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提醒任务执行失败";
  } finally {
    saving.value = false;
  }
}

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function confirmAction(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}

function statusText(status: string) {
  return status === "ENABLED" ? "启用" : "停用";
}

function formatDateOnly(value?: string | null) {
  if (!value) return "长期";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function numberRuleMeta(ruleCode: string) {
  return (
    numberRuleDisplay[ruleCode] ?? {
      name: ruleCode,
      remark: "系统内部业务编号规则，暂未配置中文备注。",
    }
  );
}

function previewNextBusinessCode(rule: NumberRule) {
  const serial = String(rule.nextSerial).padStart(rule.serialLength, "0");
  return `${rule.prefix}-${rule.currentYear}-${serial}`;
}

function approvalBusinessText(code: string) {
  return approvalBusinessDisplay[code] || numberRuleMeta(code).name || code;
}

function positionText(code: string) {
  return positions.value.find((item) => item.code === code)?.name || code;
}

function amountRangeText(node: ApprovalNode) {
  const min = node.minimumAmount == null ? null : Number(node.minimumAmount);
  const max = node.maximumAmount == null ? null : Number(node.maximumAmount);
  if (min == null && max == null) return "金额不限";
  if (min != null && max != null) return `¥${min} 至 ¥${max}`;
  if (min != null) return `¥${min} 及以上`;
  return `¥${max} 及以下`;
}

function employeeTypeText(type: string) {
  return (
    {
      INTERNAL: "内部人员",
      EMPLOYEE: "员工",
      PARTNER: "合作人",
      EXTERNAL: "外部人员",
    }[type] || type
  );
}

const employeeOptions = computed(() =>
  employees.value.filter((item) => item.accountStatus === "ENABLED"),
);

const selectedDepartment = computed(
  () =>
    departments.value.find((item) => item.id === selectedDepartmentId.value) ||
    departments.value[0],
);

const selectedRole = computed(
  () =>
    roles.value.find((item) => item.id === selectedRoleId.value) ||
    roles.value[0],
);

const selectedApprovalTemplate = computed(
  () =>
    approvalTemplates.value.find(
      (item) => item.id === selectedApprovalTemplateId.value,
    ) || approvalTemplates.value[0],
);

const selectedApprovalNodes = computed(() =>
  approvalNodes.value
    .filter((node) => node.templateId === selectedApprovalTemplate.value?.id)
    .sort((a, b) => a.nodeOrder - b.nodeOrder),
);

const availableParentDepartments = computed(() =>
  departments.value.filter((item) => item.id !== selectedDepartmentId.value),
);

const departmentMemberCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const person of employees.value) {
    counts.set(person.departmentId, (counts.get(person.departmentId) ?? 0) + 1);
  }
  return counts;
});

const departmentTreeRows = computed(() => {
  const children = new Map<string, Department[]>();
  const departmentIds = new Set(departments.value.map((item) => item.id));
  for (const item of departments.value) {
    const parentId =
      item.parentId && departmentIds.has(item.parentId) ? item.parentId : "";
    const list = children.get(parentId) ?? [];
    list.push(item);
    children.set(parentId, list);
  }
  const rows: Array<Department & { level: number }> = [];
  const walk = (parentId: string, level: number) => {
    for (const child of children.get(parentId) ?? []) {
      rows.push({ ...child, level });
      walk(child.id, level + 1);
    }
  };
  walk("", 0);
  const keyword = departmentKeyword.value.trim().toLowerCase();
  if (!keyword) return rows;
  return rows.filter(
    (item) =>
      item.name.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword),
  );
});

const selectedDepartmentMembers = computed(() => {
  const keyword = memberKeyword.value.trim().toLowerCase();
  return employees.value.filter((person) => {
    const matchDepartment = selectedDepartmentId.value
      ? person.departmentId === selectedDepartmentId.value
      : true;
    const matchKeyword =
      !keyword ||
      person.name.toLowerCase().includes(keyword) ||
      person.employeeCode.toLowerCase().includes(keyword) ||
      String(person.mobile ?? "").toLowerCase().includes(keyword) ||
      String(person.email ?? "").toLowerCase().includes(keyword);
    const matchMemberStatus =
      memberFilter.value === "all" ||
      (memberFilter.value === "active" && person.accountStatus === "ENABLED") ||
      (memberFilter.value === "left" && person.accountStatus === "DISABLED");
    const matchAccountStatus =
      !accountStatusFilter.value ||
      person.accountStatus === accountStatusFilter.value;
    return (
      matchDepartment &&
      matchKeyword &&
      matchMemberStatus &&
      matchAccountStatus
    );
  });
});

const activeUsers = computed(() =>
  users.value.filter((item) => item.status === "ENABLED").length,
);

const permissionGroups = computed(() => {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions.value) {
    const list = groups.get(permission.permissionType) ?? [];
    list.push(permission);
    groups.set(permission.permissionType, list);
  }
  return [...groups.entries()].map(([type, items]) => ({ type, items }));
});

function permissionTypeText(type: string) {
  return permissionTypeLabels[type] || type;
}

function userForEmployee(employeeId: string) {
  return users.value.find((item) => item.employeeId === employeeId);
}

function roleNamesForUser(user?: User) {
  return user?.roleNames?.split("、").filter(Boolean) ?? [];
}

function selectRole(role: Role) {
  selectedRoleId.value = role.id;
  editingRoleId.value = "";
}

function exportSelectedDepartmentMembers() {
  const header = ["姓名", "人员编码", "部门", "岗位", "手机", "邮箱", "账号状态"];
  const rows = selectedDepartmentMembers.value.map((person) => [
    person.name,
    person.employeeCode,
    person.departmentName,
    person.positionName || "",
    person.mobile || "",
    person.email || "",
    statusText(person.accountStatus),
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedDepartment.value?.name || "成员"}-成员.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function startDepartmentEdit() {
  const item = selectedDepartment.value;
  if (!item) return;
  editingDepartment.value = true;
  departmentEdit.value = {
    name: item.name,
    parentId: item.parentId || "",
    managerEmployeeId: item.managerEmployeeId || "",
    status: item.status as "ENABLED" | "DISABLED",
  };
}

function prepareChildDepartment() {
  if (selectedDepartment.value) {
    department.value.parentId = selectedDepartment.value.id;
  }
  showDepartmentForm.value = true;
}

function prepareEmployeeCreate() {
  employee.value.departmentId = selectedDepartmentId.value;
  showEmployeeForm.value = true;
}

function prepareAccountCreate(person?: Employee) {
  account.value.employeeId = person?.id || "";
  showAccountForm.value = true;
}

async function saveDepartment() {
  const item = selectedDepartment.value;
  if (!item) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.department.update", {
      departmentId: item.id,
      ...departmentEdit.value,
      parentId: departmentEdit.value.parentId || null,
      managerEmployeeId: departmentEdit.value.managerEmployeeId || null,
    });
    editingDepartment.value = false;
    await load();
    notice.value = "部门信息已更新";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "部门更新失败";
  } finally {
    saving.value = false;
  }
}

async function deleteSelectedDepartment() {
  const item = selectedDepartment.value;
  if (!item || !confirmAction(`确认删除部门「${item.name}」？`)) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.department.delete", { departmentId: item.id });
    selectedDepartmentId.value = "";
    editingDepartment.value = false;
    await load();
    notice.value = "部门已删除";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "部门删除失败";
  } finally {
    saving.value = false;
  }
}

function startEditEmployee(person: Employee) {
  editingEmployeeId.value = person.id;
  employeeEdit.value = {
    name: person.name,
    employeeType: person.employeeType || "INTERNAL",
    departmentId: person.departmentId,
    positionName: person.positionName || "",
    mobile: person.mobile || "",
    email: person.email || "",
    joinedOn: dateInput(person.joinedOn),
    leftOn: dateInput(person.leftOn),
    supervisorId: person.supervisorId || "",
    accountStatus: person.accountStatus,
  };
}

async function saveEmployee(person: Employee) {
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.employee.update", {
      employeeId: person.id,
      ...employeeEdit.value,
      positionName: employeeEdit.value.positionName || null,
      mobile: employeeEdit.value.mobile || null,
      email: employeeEdit.value.email || null,
      joinedOn: employeeEdit.value.joinedOn || null,
      leftOn: employeeEdit.value.leftOn || null,
      supervisorId: employeeEdit.value.supervisorId || null,
    });
    editingEmployeeId.value = "";
    await load();
    notice.value = "人员信息已更新";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "人员更新失败";
  } finally {
    saving.value = false;
  }
}

async function toggleEmployeeStatus(person: Employee) {
  startEditEmployee(person);
  employeeEdit.value.accountStatus =
    person.accountStatus === "ENABLED" ? "DISABLED" : "ENABLED";
  if (employeeEdit.value.accountStatus === "DISABLED" && !employeeEdit.value.leftOn) {
    employeeEdit.value.leftOn = new Date().toISOString().slice(0, 10);
  }
  await saveEmployee(person);
}

async function deleteEmployee(person: Employee) {
  if (!confirmAction(`确认删除人员「${person.name}」？`)) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.employee.delete", { employeeId: person.id });
    await load();
    notice.value = "人员已删除";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "人员删除失败";
  } finally {
    saving.value = false;
  }
}

async function createRole() {
  saving.value = true;
  error.value = null;
  try {
    const result = await callApi<{ id: string }>("admin.role.create", roleForm.value);
    roleForm.value = { code: "", name: "", permissionIds: [] };
    selectedRoleId.value = result.id;
    showRoleForm.value = false;
    await load();
    notice.value = "角色已创建";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "角色创建失败";
  } finally {
    saving.value = false;
  }
}

function startEditRole(role: Role) {
  editingRoleId.value = role.id;
  roleEdit.value = {
    name: role.name,
    status: role.status as "ENABLED" | "DISABLED",
  };
}

async function saveRole(role: Role) {
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.update", {
      roleId: role.id,
      ...roleEdit.value,
    });
    editingRoleId.value = "";
    await load();
    notice.value = "角色已更新";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "角色更新失败";
  } finally {
    saving.value = false;
  }
}

async function deleteRole(role: Role) {
  if (!confirmAction(`确认删除角色「${role.name}」？`)) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.delete", { roleId: role.id });
    await load();
    notice.value = "角色已删除";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "角色删除失败";
  } finally {
    saving.value = false;
  }
}

const dataScopeTypes: DataScopeType[] = [
  "ALL",
  "SELF",
  "OWNER",
  "CREATOR",
  "PARTICIPANT",
  "DEPARTMENT",
  "PROJECT",
];

function rolePermissionIds(roleId: string) {
  return rolePermissions.value
    .filter((item) => item.roleId === roleId)
    .map((item) => item.permissionId);
}

function roleHasPermission(roleId: string, permissionId: string) {
  return rolePermissions.value.some(
    (item) => item.roleId === roleId && item.permissionId === permissionId,
  );
}

async function setRolePermissionChecked(
  role: Role,
  permissionId: string,
  event: Event,
) {
  const checked = (event.target as HTMLInputElement).checked;
  const permissionIds = new Set(rolePermissionIds(role.id));
  if (checked) permissionIds.add(permissionId);
  else permissionIds.delete(permissionId);
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.permission.set", {
      roleId: role.id,
      permissionIds: [...permissionIds],
    });
    await load();
    notice.value = `${role.name} 功能权限已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "角色权限保存失败";
    await load();
  } finally {
    saving.value = false;
  }
}

function activeRoleScopes(roleId: string) {
  return roleDataScopes.value.filter(
    (item) => item.roleId === roleId && item.status === "ENABLED",
  );
}

function roleHasScope(roleId: string, scopeType: DataScopeType, scopeValue = "") {
  return activeRoleScopes(roleId).some(
    (item) => item.scopeType === scopeType && item.scopeValue === scopeValue,
  );
}

async function setRoleScopeChecked(
  role: Role,
  scopeType: DataScopeType,
  scopeValue: string,
  event: Event,
) {
  const checked = (event.target as HTMLInputElement).checked;
  const scopes = new Map(
    activeRoleScopes(role.id).map((item) => [
      `${item.scopeType}:${item.scopeValue || ""}`,
      { scopeType: item.scopeType, scopeValue: item.scopeValue || "" },
    ]),
  );
  const key = `${scopeType}:${scopeValue}`;
  if (checked) scopes.set(key, { scopeType, scopeValue });
  else scopes.delete(key);
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.dataScope.set", {
      roleId: role.id,
      scopes: [...scopes.values()],
    });
    await load();
    notice.value = `${role.name} 数据范围已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "数据范围保存失败";
    await load();
  } finally {
    saving.value = false;
  }
}

function sensitiveFieldChoice(roleId: string, fieldCode: string) {
  const grant = sensitiveGrants.value.find(
    (item) =>
      item.roleId === roleId &&
      item.fieldCode === fieldCode &&
      item.status === "ENABLED",
  );
  if (!grant) return "NONE";
  if (grant.explicitDeny) return "DENY";
  return grant.accessLevel;
}

async function setSensitiveFieldChoice(
  role: Role,
  fieldCode: string,
  event: Event,
) {
  const choice = (event.target as HTMLSelectElement).value as
    | "NONE"
    | "MASKED"
    | "FULL"
    | "DENY";
  const grants = sensitiveGrants.value
    .filter(
      (item) =>
        item.roleId === role.id &&
        item.status === "ENABLED" &&
        item.fieldCode !== fieldCode,
    )
    .map((item) => ({
      fieldCode: item.fieldCode,
      accessLevel: item.accessLevel,
      explicitDeny: Boolean(item.explicitDeny),
    }));
  if (choice !== "NONE") {
    grants.push({
      fieldCode,
      accessLevel: choice === "DENY" ? "MASKED" : choice,
      explicitDeny: choice === "DENY",
    });
  }
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.sensitiveField.set", {
      roleId: role.id,
      grants,
    });
    await load();
    notice.value = `${role.name} 敏感字段授权已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "敏感字段授权保存失败";
    await load();
  } finally {
    saving.value = false;
  }
}

function formatRoleDataScopes(roleId: string) {
  return roleDataScopes.value
    .filter((item) => item.roleId === roleId && item.status === "ENABLED")
    .map((item) => `${item.scopeType}:${item.scopeValue || ""}`)
    .join("\n");
}

function formatSensitiveGrants(roleId: string) {
  return sensitiveGrants.value
    .filter((item) => item.roleId === roleId && item.status === "ENABLED")
    .map(
      (item) =>
        `${item.fieldCode}:${item.accessLevel}:${
          item.explicitDeny ? "true" : "false"
        }`,
    )
    .join("\n");
}

function parseRoleDataScopes(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawType = "", ...rest] = line.split(":");
      const scopeType = rawType.trim().toUpperCase() as DataScopeType;
      if (!dataScopeTypes.includes(scopeType))
        throw new Error(
          "数据范围格式应为 ALL:、DEPARTMENT:部门ID 或 PROJECT:项目ID",
        );
      return {
        scopeType,
        scopeValue: rest.join(":").trim(),
      };
    });
}

function parseSensitiveGrants(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fieldCode, access = "MASKED", deny = "false"] = line.split(":");
      const accessLevel = access.trim().toUpperCase();
      if (!fieldCode?.trim() || !["FULL", "MASKED"].includes(accessLevel))
        throw new Error("敏感字段格式应为 字段编码:FULL|MASKED:true|false");
      return {
        fieldCode: fieldCode.trim(),
        accessLevel: accessLevel as "FULL" | "MASKED",
        explicitDeny: ["1", "true", "yes", "deny"].includes(
          deny.trim().toLowerCase(),
        ),
      };
    });
}

async function setRolePermissions(role: Role, event: Event) {
  const permissionIds = Array.from(
    (event.target as HTMLSelectElement).selectedOptions,
  ).map((option) => option.value);
  saving.value = true;
  error.value = null;
  try {
    await callApi("admin.role.permission.set", {
      roleId: role.id,
      permissionIds,
    });
    await load();
    notice.value = `${role.name} 权限已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "角色权限保存失败";
  } finally {
    saving.value = false;
  }
}

async function saveRoleDataScopes(role: Role, event: Event) {
  saving.value = true;
  error.value = null;
  try {
    const form = new FormData(event.target as HTMLFormElement);
    await callApi("admin.role.dataScope.set", {
      roleId: role.id,
      scopes: parseRoleDataScopes(String(form.get("scopes") || "")),
    });
    await load();
    notice.value = `${role.name} 数据范围已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "数据范围保存失败";
  } finally {
    saving.value = false;
  }
}

async function saveSensitiveGrants(role: Role, event: Event) {
  saving.value = true;
  error.value = null;
  try {
    const form = new FormData(event.target as HTMLFormElement);
    await callApi("admin.role.sensitiveField.set", {
      roleId: role.id,
      grants: parseSensitiveGrants(String(form.get("grants") || "")),
    });
    await load();
    notice.value = `${role.name} 敏感字段授权已更新`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "敏感字段授权保存失败";
  } finally {
    saving.value = false;
  }
}

async function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab;
  if (tab === "audit") await loadAudit();
}

onMounted(load);
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SYSTEM ADMINISTRATION</p>
        <h1>系统管理</h1>
      </div>
      <button type="button" :disabled="saving" @click="refreshReminders">
        立即生成提醒
      </button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <section class="contract-panels">
      <article>
        <p>部门</p>
        <strong>{{ departments.length }}</strong>
      </article>
      <article>
        <p>人员</p>
        <strong>{{ employees.length }}</strong>
      </article>
      <article>
        <p>账号</p>
        <strong>{{ users.length }}</strong>
      </article>
      <article>
        <p>审批模板</p>
        <strong>{{ approvalTemplates.length }}</strong>
      </article>
    </section>
    <nav class="workflow-steps">
      <button @click="switchTab('organization')">组织与权限</button
      ><button @click="switchTab('numbers')">编号规则</button>
      <button @click="switchTab('parameters')">系统参数</button>
      <button @click="switchTab('dictionary')">数据字典</button>
      <button @click="switchTab('approvals')">审批配置</button
      ><button @click="switchTab('audit')">审计日志</button>
    </nav>

    <template v-if="activeTab === 'organization'">
      <section class="org-console">
        <aside class="org-sidebar">
          <div class="segment">
            <button
              :class="{ active: organizationPane === 'departments' }"
              type="button"
              @click="organizationPane = 'departments'"
            >
              部门
            </button>
            <button
              :class="{ active: organizationPane === 'roles' }"
              type="button"
              @click="organizationPane = 'roles'"
            >
              角色
            </button>
          </div>
          <template v-if="organizationPane === 'departments'">
            <div class="quick-filter">
              <button
                :class="{ active: memberFilter === 'active' }"
                type="button"
                @click="memberFilter = 'active'"
              >
                全部成员
              </button>
              <button
                :class="{ active: memberFilter === 'left' }"
                type="button"
                @click="memberFilter = 'left'"
              >
                离职成员
              </button>
            </div>
            <label class="search-box">
              <span>部门</span>
              <input v-model="departmentKeyword" placeholder="搜索部门" />
            </label>
            <nav class="department-tree">
              <button
                v-for="item in departmentTreeRows"
                :key="item.id"
                :class="{ selected: selectedDepartmentId === item.id }"
                :style="{ paddingLeft: `${14 + item.level * 22}px` }"
                type="button"
                @click="
                  selectedDepartmentId = item.id;
                  editingDepartment = false;
                  employee.departmentId = item.id;
                "
              >
                <span class="tree-icon">▦</span>
                <span>{{ item.name }}</span>
                <small>{{ departmentMemberCounts.get(item.id) || 0 }}</small>
              </button>
            </nav>
          </template>
          <template v-else>
            <button
              class="create-inline-button"
              type="button"
              @click="showRoleForm = !showRoleForm"
            >
              {{ showRoleForm ? "收起新增角色" : "新增角色" }}
            </button>
            <form v-if="showRoleForm" class="mini-form" @submit.prevent="createRole">
              <h3>新增角色</h3>
              <input
                v-model="roleForm.code"
                placeholder="角色编码，如 FINANCE_ASSISTANT"
                required
              />
              <input v-model="roleForm.name" placeholder="角色名称" required />
              <select v-model="roleForm.permissionIds" multiple>
                <option
                  v-for="permission in permissions"
                  :key="permission.id"
                  :value="permission.id"
                >
                  {{ permission.name }}
                </option>
              </select>
              <button :disabled="saving">创建角色</button>
            </form>
            <div class="role-list">
              <button
                v-for="role in roles"
                :key="role.id"
                :class="{ selected: selectedRoleId === role.id }"
                type="button"
                @click="selectRole(role)"
              >
                <span>{{ role.name }}</span>
                <small>{{ role.permissionCount || 0 }} 项权限</small>
              </button>
            </div>
          </template>
        </aside>

        <section v-if="organizationPane === 'departments'" class="org-main">
          <header class="org-toolbar">
            <div>
              <h2>{{ selectedDepartment?.name || "请选择部门" }}</h2>
              <p>
                主管：{{ selectedDepartment?.managerName || "未设置" }} ·
                状态：{{ statusText(selectedDepartment?.status || "") }}
              </p>
            </div>
            <div class="link-actions" v-if="selectedDepartment">
              <button type="button" @click="startDepartmentEdit">修改名称</button>
              <button type="button" @click="startDepartmentEdit">
                调整上级部门
              </button>
              <button type="button" @click="startDepartmentEdit">
                设置部门主管
              </button>
              <button type="button" @click="prepareChildDepartment">
                添加子部门
              </button>
              <button class="danger-link" type="button" @click="deleteSelectedDepartment">
                删除部门
              </button>
            </div>
          </header>

          <form
            v-if="editingDepartment && selectedDepartment"
            class="inline-editor"
            @submit.prevent="saveDepartment"
          >
            <label
              >部门名称<input v-model="departmentEdit.name" required
            /></label>
            <label
              >上级部门<select v-model="departmentEdit.parentId">
                <option value="">无上级</option>
                <option
                  v-for="item in availableParentDepartments"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }}
                </option>
              </select></label
            >
            <label
              >部门主管<select v-model="departmentEdit.managerEmployeeId">
                <option value="">未设置</option>
                <option
                  v-for="person in employeeOptions"
                  :key="person.id"
                  :value="person.id"
                >
                  {{ person.name }}
                </option>
              </select></label
            >
            <label
              >状态<select v-model="departmentEdit.status">
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select></label
            >
            <button :disabled="saving">保存部门</button>
            <button type="button" @click="editingDepartment = false">取消</button>
          </form>

          <form
            v-if="showDepartmentForm"
            class="compact-create"
            @submit.prevent="createDepartment"
          >
            <h3>新增部门</h3>
            <input v-model="department.code" placeholder="部门编码" required />
            <input v-model="department.name" placeholder="部门名称" required />
            <select v-model="department.parentId">
              <option value="">无上级部门</option>
              <option v-for="item in departments" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <select v-model="department.managerEmployeeId">
              <option value="">未设置主管</option>
              <option
                v-for="person in employeeOptions"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </option>
            </select>
            <button :disabled="saving">保存部门</button>
            <button type="button" @click="showDepartmentForm = false">取消</button>
          </form>

          <div class="member-toolbar">
            <button type="button" @click="prepareEmployeeCreate">
              邀请成员
            </button>
            <button type="button" @click="exportSelectedDepartmentMembers">导出</button>
            <input v-model="memberKeyword" placeholder="搜索成员" />
            <label
              >账号状态<select v-model="accountStatusFilter">
                <option value="">全部</option>
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select></label
            >
          </div>

          <table class="member-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>手机</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>账号状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="person in selectedDepartmentMembers" :key="person.id">
                <tr>
                  <td>
                    <strong>{{ person.name }}</strong>
                    <small>{{ person.employeeCode }} · {{ person.positionName || "未设置岗位" }}</small>
                  </td>
                  <td>{{ person.mobile || "-" }}</td>
                  <td>{{ person.email || "-" }}</td>
                  <td>
                    <span
                      v-for="roleName in roleNamesForUser(userForEmployee(person.id))"
                      :key="roleName"
                      class="role-chip"
                    >
                      {{ roleName }}
                    </span>
                    <span v-if="!roleNamesForUser(userForEmployee(person.id)).length" class="muted">
                      未授权
                    </span>
                  </td>
                  <td>{{ statusText(person.accountStatus) }}</td>
                  <td class="row-actions">
                    <button type="button" @click="startEditEmployee(person)">编辑</button>
                    <button type="button" @click="prepareAccountCreate(person)">
                      账号/角色
                    </button>
                    <button type="button" @click="toggleEmployeeStatus(person)">
                      {{ person.accountStatus === "ENABLED" ? "离职/停用" : "恢复" }}
                    </button>
                    <button type="button" class="danger-link" @click="deleteEmployee(person)">
                      删除
                    </button>
                  </td>
                </tr>
                <tr v-if="editingEmployeeId === person.id" class="editor-row">
                  <td colspan="6">
                    <form class="inline-editor" @submit.prevent="saveEmployee(person)">
                      <label>姓名<input v-model="employeeEdit.name" required /></label>
                      <label
                        >类型<select v-model="employeeEdit.employeeType">
                          <option value="INTERNAL">内部人员</option>
                          <option value="PARTNER">合作人</option>
                          <option value="EXTERNAL">外部人员</option>
                        </select></label
                      >
                      <label
                        >部门<select v-model="employeeEdit.departmentId" required>
                          <option
                            v-for="item in departments"
                            :key="item.id"
                            :value="item.id"
                          >
                            {{ item.name }}
                          </option>
                        </select></label
                      >
                      <label>岗位<input v-model="employeeEdit.positionName" /></label>
                      <label>手机<input v-model="employeeEdit.mobile" /></label>
                      <label>邮箱<input v-model="employeeEdit.email" type="email" /></label>
                      <label>入职日<input v-model="employeeEdit.joinedOn" type="date" /></label>
                      <label>离职日<input v-model="employeeEdit.leftOn" type="date" /></label>
                      <label
                        >直属主管<select v-model="employeeEdit.supervisorId">
                          <option value="">未设置</option>
                          <option
                            v-for="item in employeeOptions"
                            :key="item.id"
                            :value="item.id"
                          >
                            {{ item.name }}
                          </option>
                        </select></label
                      >
                      <label
                        >账号状态<select v-model="employeeEdit.accountStatus">
                          <option value="ENABLED">启用</option>
                          <option value="DISABLED">停用</option>
                        </select></label
                      >
                      <button :disabled="saving">保存人员</button>
                      <button type="button" @click="editingEmployeeId = ''">
                        取消
                      </button>
                    </form>
                  </td>
                </tr>
              </template>
              <tr v-if="!selectedDepartmentMembers.length">
                <td colspan="6">当前筛选下暂无成员</td>
              </tr>
            </tbody>
          </table>

          <div class="subtle-panel-toggle">
            <button type="button" @click="showAccountRolePanel = !showAccountRolePanel">
              {{ showAccountRolePanel ? "收起账号角色维护" : "展开账号角色维护" }}
            </button>
          </div>

          <form
            v-if="showEmployeeForm"
            class="compact-create"
            @submit.prevent="createEmployee"
          >
            <h3>新增人员</h3>
            <input v-model="employee.employeeCode" placeholder="人员编码" required />
            <input v-model="employee.name" placeholder="姓名" required />
            <select v-model="employee.employeeType">
              <option value="INTERNAL">内部人员</option>
              <option value="PARTNER">合作人</option>
              <option value="EXTERNAL">外部人员</option>
            </select>
            <select v-model="employee.departmentId" required>
              <option value="" disabled>请选择部门</option>
              <option v-for="item in departments" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <input v-model="employee.positionName" placeholder="岗位" />
            <input v-model="employee.mobile" placeholder="手机" />
            <input v-model="employee.email" placeholder="邮箱" type="email" />
            <input v-model="employee.joinedOn" type="date" />
            <button :disabled="saving">保存人员</button>
            <button type="button" @click="showEmployeeForm = false">取消</button>
          </form>

          <form
            v-if="showAccountForm"
            class="compact-create"
            @submit.prevent="createAccount"
          >
            <h3>关联登录账号</h3>
            <select v-model="account.employeeId" required>
              <option value="" disabled>请选择人员</option>
              <option
                v-for="person in employees"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}（{{ person.employeeCode }}）
              </option>
            </select>
            <input v-model="account.username" placeholder="登录账号" required />
            <input v-model="account.cloudbaseUid" placeholder="本地/身份 UID" required />
            <select v-model="account.roleIds" multiple required>
              <option v-for="role in roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
            <button :disabled="saving">保存账号映射</button>
            <button type="button" @click="showAccountForm = false">取消</button>
            <p class="muted">本系统不保存密码；后续部署到服务器后再接正式身份服务。</p>
          </form>
        </section>

        <section v-else class="org-main">
          <header class="org-toolbar">
            <div>
              <h2>角色、权限与数据范围</h2>
              <p>
                当前 {{ roles.length }} 个角色，启用账号 {{ activeUsers }} 个。
              </p>
            </div>
          </header>
          <article v-if="selectedRole" class="role-card">
            <header>
              <div>
                <strong>{{ selectedRole.name }} · {{ selectedRole.code }}</strong>
                <p>
                  {{ statusText(selectedRole.status) }} ·
                  {{ selectedRole.userCount || 0 }} 个账号 ·
                  {{ selectedRole.permissionCount || 0 }} 项权限
                </p>
              </div>
              <div class="row-actions">
                <button type="button" @click="startEditRole(selectedRole)">编辑</button>
                <button
                  type="button"
                  class="danger-link"
                  @click="deleteRole(selectedRole)"
                >
                  删除
                </button>
              </div>
            </header>
            <form
              v-if="editingRoleId === selectedRole.id"
              class="inline-editor"
              @submit.prevent="saveRole(selectedRole)"
            >
              <label>角色名称<input v-model="roleEdit.name" required /></label>
              <label
                >状态<select v-model="roleEdit.status">
                  <option value="ENABLED">启用</option>
                  <option value="DISABLED">停用</option>
                </select></label
              >
              <button :disabled="saving">保存角色</button>
              <button type="button" @click="editingRoleId = ''">取消</button>
            </form>
            <section class="permission-picker">
              <h3>功能权限</h3>
              <div
                v-for="group in permissionGroups"
                :key="group.type"
                class="permission-group"
              >
                <strong>{{ permissionTypeText(group.type) }}</strong>
                <div class="permission-checks">
                  <label
                    v-for="permission in group.items"
                    :key="permission.id"
                    class="check-tile"
                  >
                    <input
                      type="checkbox"
                      :checked="roleHasPermission(selectedRole.id, permission.id)"
                      :disabled="saving"
                      @change="
                        setRolePermissionChecked(selectedRole, permission.id, $event)
                      "
                    />
                    <span>{{ permission.name }}</span>
                    <small>{{ permission.code }}</small>
                  </label>
                </div>
              </div>
            </section>
            <div class="role-config-grid">
              <section class="scope-picker">
                <h3>数据范围</h3>
                <div class="scope-checks">
                  <label
                    v-for="scopeType in simpleScopeTypes"
                    :key="scopeType"
                    class="check-tile compact"
                  >
                    <input
                      type="checkbox"
                      :checked="roleHasScope(selectedRole.id, scopeType)"
                      :disabled="saving"
                      @change="
                        setRoleScopeChecked(selectedRole, scopeType, '', $event)
                      "
                    />
                    <span>{{ scopeTypeLabels[scopeType] }}</span>
                  </label>
                </div>
                <details class="scope-details">
                  <summary>指定部门范围</summary>
                  <div class="scope-checks">
                    <label
                      v-for="departmentItem in departments"
                      :key="departmentItem.id"
                      class="check-tile compact"
                    >
                      <input
                        type="checkbox"
                        :checked="
                          roleHasScope(
                            selectedRole.id,
                            'DEPARTMENT',
                            departmentItem.id,
                          )
                        "
                        :disabled="saving"
                        @change="
                          setRoleScopeChecked(
                            selectedRole,
                            'DEPARTMENT',
                            departmentItem.id,
                            $event,
                          )
                        "
                      />
                      <span>{{ departmentItem.name }}</span>
                    </label>
                  </div>
                </details>
                <details v-if="projectOptions.length" class="scope-details">
                  <summary>指定项目范围</summary>
                  <div class="scope-checks">
                    <label
                      v-for="project in projectOptions"
                      :key="project.id"
                      class="check-tile compact"
                    >
                      <input
                        type="checkbox"
                        :checked="roleHasScope(selectedRole.id, 'PROJECT', project.id)"
                        :disabled="saving"
                        @change="
                          setRoleScopeChecked(
                            selectedRole,
                            'PROJECT',
                            project.id,
                            $event,
                          )
                        "
                      />
                      <span>{{ project.projectName }}</span>
                      <small>{{ project.projectCode }}</small>
                    </label>
                  </div>
                </details>
              </section>
              <section class="sensitive-picker">
                <h3>敏感字段</h3>
                <label
                  v-for="field in sensitiveFieldOptions"
                  :key="field.code"
                  class="sensitive-row"
                >
                  <span>{{ field.name }}</span>
                  <select
                    :value="sensitiveFieldChoice(selectedRole.id, field.code)"
                    :disabled="saving"
                    @change="
                      setSensitiveFieldChoice(selectedRole, field.code, $event)
                    "
                  >
                    <option value="NONE">无权限</option>
                    <option value="MASKED">脱敏查看</option>
                    <option value="FULL">完整查看</option>
                    <option value="DENY">明确禁止</option>
                  </select>
                </label>
              </section>
            </div>
          </article>
          <section v-else class="empty-state">
            <span>!</span>
            <h2>暂无角色</h2>
            <p>请先在左侧新增角色，再配置权限。</p>
          </section>
        </section>
      </section>
      <section v-if="showAccountRolePanel" class="data-list account-role-panel">
        <h2>账号角色</h2>
        <article v-for="item in users" :key="item.id" class="data-row">
          <div>
            <strong>{{ item.employeeName }} · {{ item.username }}</strong>
            <p>{{ item.roleNames || "未授权" }} · {{ item.status }}</p>
            <small>UID：{{ item.cloudbaseUid }}</small>
          </div>
          <select
            multiple
            :value="item.roleIds?.split(',') || []"
            @change="setRoles(item, $event)"
          >
            <option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
          <button type="button" @click="toggleUserStatus(item)">
            {{ item.status === "ENABLED" ? "停用" : "启用" }}
          </button>
        </article>
      </section>
      <div class="advanced-toggle">
        <button
          type="button"
          @click="showAdvancedPermissionPanel = !showAdvancedPermissionPanel"
        >
          {{
            showAdvancedPermissionPanel
              ? "收起高级权限配置"
              : "展开高级权限配置"
          }}
        </button>
      </div>
      <template v-if="showAdvancedPermissionPanel">
        <form
          class="entity-form position-assignment-form"
          @submit.prevent="createPositionAssignment"
        >
          <h2 class="wide">审批岗位任职</h2>
          <label
            >审批岗位<select v-model="assignmentForm.positionCode" required>
              <option value="" disabled>请选择</option>
              <option
                v-for="position in positions"
                :key="position.code"
                :value="position.code"
              >
                {{ position.name }}
              </option>
            </select></label
          ><label
            >任职人员<select v-model="assignmentForm.employeeId" required>
              <option value="" disabled>请选择</option>
              <option
                v-for="person in employees"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </option>
            </select></label
          ><label
            >开始日期<input
              v-model="assignmentForm.startsOn"
              type="date"
              required /></label
          ><label
            >结束日期<input v-model="assignmentForm.endsOn" type="date" /></label
          ><label class="checkbox-line"
            ><input
              v-model="assignmentForm.isDelegate"
              type="checkbox"
            /><span>代理任职</span></label
          ><button :disabled="saving">保存任职</button>
        </form>
        <section class="data-list position-list">
          <h2>岗位任职记录</h2>
          <article
            v-for="assignment in positionAssignments"
            :key="assignment.id"
            class="data-row"
          >
            <div>
              <strong
                >{{ assignment.positionName }} ·
                {{ assignment.employeeName }}</strong
              >
              <p>
                {{ formatDateOnly(assignment.startsOn) }} 至
                {{ formatDateOnly(assignment.endsOn) }} ·
                {{ assignment.isDelegate ? "代理任职" : "正式任职" }} ·
                {{ statusText(assignment.status) }}
              </p>
            </div>
            <button
              class="small-status-button"
              type="button"
              @click="togglePositionAssignment(assignment)"
            >
              {{ assignment.status === "ENABLED" ? "停用" : "启用" }}
            </button>
          </article>
          <p v-if="!positionAssignments.length">暂无岗位任职</p>
        </section>
        <form class="entity-form" @submit.prevent="createProjectGrant">
          <h2 class="wide">临时项目授权</h2>
          <label
            >项目<select v-model="projectGrantForm.projectId" required>
              <option value="" disabled>请选择</option>
              <option
                v-for="project in projectOptions"
                :key="project.id"
                :value="project.id"
              >
                {{ project.projectName }}（{{ project.projectCode }}）
              </option>
            </select></label
          ><label
            >授权人员<select v-model="projectGrantForm.employeeId" required>
              <option value="" disabled>请选择</option>
              <option
                v-for="person in employees"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}（{{ person.employeeCode }}）
              </option>
            </select></label
          ><label
            >开始日期<input
              v-model="projectGrantForm.startsOn"
              type="date"
              required /></label
          ><label
            >结束日期<input v-model="projectGrantForm.endsOn" type="date" /></label
          ><label class="wide"
            >授权原因<input v-model="projectGrantForm.reason" maxlength="500" /></label
          ><button :disabled="saving">保存临时授权</button>
        </form>
        <section class="data-list">
          <h2>临时项目授权记录</h2>
          <article v-for="grant in projectGrants" :key="grant.id" class="data-row">
            <div>
              <strong>{{ grant.projectName }} · {{ grant.employeeName }}</strong>
              <p>
                {{ grant.startsOn }} 至 {{ grant.endsOn || "长期" }} ·
                {{ grant.status }} · 授权人 {{ grant.grantedBy }}
              </p>
              <small v-if="grant.reason">{{ grant.reason }}</small>
            </div>
            <button type="button" @click="toggleProjectGrant(grant)">
              {{ grant.status === "ENABLED" ? "停用" : "启用" }}
            </button>
          </article>
          <p v-if="!projectGrants.length">暂无临时项目授权</p>
        </section>
      </template>
    </template>

    <section v-else-if="activeTab === 'numbers'" class="data-panel">
      <h2>业务编号规则</h2>
      <p class="section-help">
        用来配置各类业务单据的自动编号。系统实际生成编号时会读取这里的前缀、年份和流水位数；“下一个流水号”不是写死值，
        每生成一张对应单据会自动加 1，跨年后会按新年份从 1 开始。
      </p>
      <div class="number-rule-table-wrap">
        <table class="number-rule-table">
          <thead>
            <tr>
              <th>业务</th>
              <th>前缀</th>
              <th>年份</th>
              <th>位数</th>
              <th>下一个流水号</th>
              <th>状态</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in numberRules" :key="rule.id">
              <td class="business-cell">
                <strong>{{ numberRuleMeta(rule.ruleCode).name }}</strong>
                <small>{{ rule.ruleCode }}</small>
              </td>
              <td><input v-model="rule.prefix" maxlength="32" /></td>
              <td class="year-cell">{{ rule.currentYear }}</td>
              <td>
                <input
                  v-model.number="rule.serialLength"
                  type="number"
                  min="2"
                  max="12"
                />
              </td>
              <td class="serial-cell">
                <strong>{{ rule.nextSerial }}</strong>
                <small>{{ previewNextBusinessCode(rule) }}</small>
              </td>
              <td>
                <select v-model="rule.status">
                  <option value="ENABLED">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </td>
              <td class="remark-cell">
                {{ numberRuleMeta(rule.ruleCode).remark }}
              </td>
              <td>
                <button :disabled="saving" @click="saveNumberRule(rule)">
                  保存
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else-if="activeTab === 'parameters'" class="data-panel">
      <h2>系统参数</h2>
      <p>维护公司名称、提醒提前量、导出保留期等运行参数；参数键与类型由初始化基线控制。</p>
      <table>
        <thead>
          <tr>
            <th>参数键</th>
            <th>名称</th>
            <th>类型</th>
            <th>参数值</th>
            <th>说明</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="parameter in parameters" :key="parameter.id">
            <td>{{ parameter.parameterKey }}</td>
            <td><input v-model="parameter.name" /></td>
            <td>{{ parameter.valueType }}</td>
            <td>
              <textarea
                v-if="parameter.valueType === 'JSON'"
                v-model="parameter.parameterValue"
                rows="3"
              ></textarea>
              <select
                v-else-if="parameter.valueType === 'BOOLEAN'"
                v-model="parameter.parameterValue"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
              <input
                v-else
                v-model="parameter.parameterValue"
                :type="parameter.valueType === 'NUMBER' ? 'number' : 'text'"
              />
            </td>
            <td><input v-model="parameter.description" /></td>
            <td>
              <select v-model="parameter.status">
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select>
            </td>
            <td>
              <button :disabled="saving" @click="saveParameter(parameter)">
                保存
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!parameters.length">暂无系统参数</p>
    </section>

    <section v-else-if="activeTab === 'dictionary'" class="data-panel">
      <h2>数据字典</h2>
      <form class="entity-form" @submit.prevent="createDictionaryType">
        <h3 class="wide">新增字典类型</h3>
        <label
          >类型编码<input
            v-model="dictionaryTypeForm.typeCode"
            required
            pattern="[A-Z][A-Z0-9_]*"
            placeholder="PROJECT_TYPE" /></label
        ><label
          >类型名称<input v-model="dictionaryTypeForm.name" required /></label
        ><label class="wide"
          >说明<input v-model="dictionaryTypeForm.description" /></label
        ><button :disabled="saving">保存类型</button>
      </form>
      <form class="entity-form" @submit.prevent="createDictionaryItem">
        <h3 class="wide">新增字典项</h3>
        <label
          >字典类型<select v-model="dictionaryItemForm.typeId" required>
            <option value="" disabled>请选择</option>
            <option
              v-for="type in dictionaryTypes"
              :key="type.id"
              :value="type.id"
            >
              {{ type.name }}（{{ type.typeCode }}）
            </option>
          </select></label
        ><label
          >项编码<input v-model="dictionaryItemForm.itemCode" required /></label
        ><label
          >显示名称<input v-model="dictionaryItemForm.label" required /></label
        ><label
          >实际值<input
            v-model="dictionaryItemForm.valueText"
            required /></label
        ><label
          >排序<input
            v-model.number="dictionaryItemForm.sortOrder"
            type="number" /></label
        ><button :disabled="saving">保存字典项</button>
      </form>
      <table v-if="dictionaryItems.length">
        <thead>
          <tr>
            <th>类型</th>
            <th>项编码</th>
            <th>显示名称</th>
            <th>实际值</th>
            <th>排序</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in dictionaryItems" :key="item.id">
            <td>
              {{
                dictionaryTypes.find((type) => type.id === item.typeId)
                  ?.typeCode
              }}
            </td>
            <td>{{ item.itemCode }}</td>
            <td><input v-model="item.label" /></td>
            <td><input v-model="item.valueText" /></td>
            <td><input v-model.number="item.sortOrder" type="number" /></td>
            <td>
              <select v-model="item.status">
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select>
            </td>
            <td>
              <button :disabled="saving" @click="saveDictionaryItem(item)">
                保存
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无字典项</p>
    </section>

    <section v-else-if="activeTab === 'approvals'" class="data-panel">
      <header class="approval-header">
        <div>
          <h2>审批流程配置</h2>
          <p>
            左侧选择业务流程，右侧按审批顺序展示节点。每个节点可维护审批岗位、适用金额范围、是否抄送和启停状态。
          </p>
        </div>
        <span>{{ approvalTemplates.length }} 个流程模板</span>
      </header>

      <div class="approval-config">
        <aside class="approval-template-list">
          <button
            v-for="template in approvalTemplates"
            :key="template.id"
            type="button"
            :class="{ selected: selectedApprovalTemplate?.id === template.id }"
            @click="selectedApprovalTemplateId = template.id"
          >
            <strong>{{ template.name }}</strong>
            <small>{{ approvalBusinessText(template.businessType) }}</small>
            <span>{{ template.nodeCount }} 个节点 · {{ statusText(template.status) }}</span>
          </button>
        </aside>

        <section v-if="selectedApprovalTemplate" class="approval-flow-panel">
          <div class="approval-flow-summary">
            <div>
              <p class="eyebrow">当前流程</p>
              <h3>{{ selectedApprovalTemplate.name }}</h3>
              <p>
                {{ approvalBusinessText(selectedApprovalTemplate.businessType) }}
                · 模板编码 {{ selectedApprovalTemplate.templateCode }}
                · V{{ selectedApprovalTemplate.version }}
                · {{ statusText(selectedApprovalTemplate.status) }}
              </p>
            </div>
            <strong>{{ selectedApprovalNodes.length }} 个审批节点</strong>
          </div>

          <div class="approval-flow-track">
            <article
              v-for="(node, index) in selectedApprovalNodes"
              :key="node.id"
              class="approval-node-card"
              :class="{ disabled: node.status !== 'ENABLED' }"
            >
              <div class="node-order">{{ index + 1 }}</div>
              <div class="node-body">
                <div class="node-title-row">
                  <div>
                    <strong>{{ node.nodeName }}</strong>
                    <p>{{ positionText(node.positionCode) }}</p>
                  </div>
                  <span>{{ Boolean(node.isCc) ? "抄送" : "审批" }}</span>
                </div>
                <p class="node-condition">{{ amountRangeText(node) }}</p>
                <div class="node-edit-grid">
                  <label>节点名称<input v-model="node.nodeName" /></label>
                  <label
                    >审批岗位<select v-model="node.positionCode">
                      <option
                        v-for="position in positions"
                        :key="position.code"
                        :value="position.code"
                      >
                        {{ position.name }}
                      </option>
                    </select></label
                  >
                  <label
                    >最低金额<input
                      v-model.number="node.minimumAmount"
                      type="number"
                      min="0"
                      step="0.01"
                  /></label>
                  <label
                    >最高金额<input
                      v-model.number="node.maximumAmount"
                      type="number"
                      min="0"
                      step="0.01"
                  /></label>
                  <label class="checkbox-line">
                    <input v-model="node.isCc" type="checkbox" />
                    <span>此节点为抄送</span>
                  </label>
                  <label
                    >状态<select v-model="node.status">
                      <option value="ENABLED">启用</option>
                      <option value="DISABLED">停用</option>
                    </select></label
                  >
                  <button :disabled="saving" @click="saveApprovalNode(node)">
                    保存节点
                  </button>
                </div>
              </div>
            </article>
            <p v-if="!selectedApprovalNodes.length" class="empty-state">
              当前流程暂无审批节点。
            </p>
          </div>
        </section>
      </div>
    </section>

    <section v-else class="data-panel">
      <header class="page-header">
        <div>
          <h2>审计日志</h2>
          <p>记录接口操作结果、操作者和请求标识。</p>
        </div>
        <form class="entity-form" @submit.prevent="loadAudit">
          <label
            >关键词<input
              v-model="auditKeyword"
              placeholder="操作、资源或请求编号" /></label
          ><label
            >结果<select v-model="auditOutcome">
              <option value="">全部</option>
              <option value="SUCCESS">成功</option>
              <option value="DENIED">拒绝</option>
              <option value="FAILED">失败</option>
            </select></label
          ><button>查询</button>
        </form>
      </header>
      <table v-if="auditLogs.length">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作者</th>
            <th>操作</th>
            <th>资源</th>
            <th>结果</th>
            <th>请求编号</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in auditLogs" :key="log.id">
            <td>{{ new Date(log.occurredAt).toLocaleString() }}</td>
            <td>{{ log.username || "匿名" }}</td>
            <td>{{ log.action }}</td>
            <td>{{ log.resourceType }} {{ log.resourceId || "" }}</td>
            <td>{{ log.outcome }}</td>
            <td>{{ log.requestId }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无审计记录</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 1400px;
}

.workflow-steps {
  grid-template-columns: repeat(6, minmax(110px, 1fr));
}

.workflow-steps button,
.org-console button,
.compact-create button,
.inline-editor button,
.mini-form button,
.role-card button {
  width: auto;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid #cfd8e6;
  background: #fff;
  color: #17324d;
}

.org-console button,
.org-console input,
.org-console select,
.org-console textarea {
  width: auto;
  margin-top: 0;
}

.org-console input,
.org-console select,
.org-console textarea {
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #cdd7e5;
  border-radius: 8px;
  background: #fff;
  color: #172033;
  font: inherit;
}

.workflow-steps button:hover,
.org-console button:hover,
.compact-create button:hover,
.inline-editor button:hover,
.mini-form button:hover,
.role-card button:hover {
  border-color: #00a99d;
  color: #008f86;
}

.org-console {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  min-height: 720px;
  margin-top: 24px;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 14px 38px rgba(21, 45, 78, 0.08);
}

.org-sidebar {
  padding: 24px 18px;
  border-right: 1px solid #e4ebf3;
  background: #fbfcfe;
}

.segment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: #edf1f6;
}

.segment button,
.quick-filter button {
  width: 100%;
  margin: 0;
  padding: 11px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-weight: 800;
}

.segment button.active,
.quick-filter button.active {
  background: #fff;
  color: #00a99d;
  box-shadow: 0 2px 8px rgba(29, 47, 73, 0.08);
}

.quick-filter {
  display: grid;
  gap: 8px;
  margin: 18px 0;
}

.search-box,
.mini-form,
.compact-create,
.inline-editor,
.role-card {
  display: grid;
  gap: 10px;
}

.search-box {
  margin-top: 0;
}

.search-box span {
  color: #667085;
}

.department-tree,
.role-list {
  display: grid;
  gap: 4px;
  margin-top: 16px;
}

.department-tree button,
.role-list button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding-top: 0;
  padding-bottom: 0;
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
}

.department-tree button.selected {
  background: #e7f8f6;
  color: #072f2d;
  font-weight: 900;
}

.role-list button {
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 10px 12px;
}

.role-list button.selected {
  background: #e7f8f6;
  color: #072f2d;
  font-weight: 900;
}

.create-inline-button {
  width: 100%;
  margin: 18px 0 0;
  padding: 10px 12px;
  color: #008f86;
  background: #fff;
}

.tree-icon,
.role-chip {
  color: #00a99d;
}

.department-tree small,
.role-list small {
  color: #8a95a7;
}

.org-main {
  min-width: 0;
  padding: 22px 28px 28px;
}

.org-toolbar,
.member-toolbar,
.role-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.org-toolbar {
  padding-bottom: 18px;
  border-bottom: 1px solid #edf1f5;
}

.org-toolbar h2,
.role-card h3,
.mini-form h3,
.compact-create h3 {
  margin: 0;
}

.org-toolbar p,
.role-card p,
.muted {
  margin: 4px 0 0;
  color: #748095;
}

.link-actions,
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.link-actions button,
.row-actions button {
  width: auto;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: #008f86;
}

.link-actions {
  justify-content: flex-end;
}

.danger-link {
  color: #d14343 !important;
}

.inline-editor,
.compact-create,
.role-card {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fbfdff;
}

.inline-editor,
.compact-create {
  grid-template-columns: repeat(4, minmax(130px, 1fr)) auto auto;
  align-items: end;
}

.inline-editor label,
.compact-create label {
  margin-top: 0;
}

.compact-create input,
.compact-create select,
.inline-editor input,
.inline-editor select {
  width: 100%;
}

.compact-create h3,
.compact-create p {
  grid-column: 1 / -1;
}

.mini-form {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
}

.mini-form input,
.mini-form select,
.mini-form button {
  width: 100%;
}

.mini-form select {
  min-height: 140px;
}

.member-toolbar {
  margin: 22px 0 14px;
}

.member-toolbar button {
  width: auto;
  margin: 0;
  padding: 9px 18px;
}

.member-toolbar input {
  max-width: 360px;
  margin-left: auto;
}

.member-toolbar label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.member-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.member-table th,
.member-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
  vertical-align: top;
}

.member-table th {
  color: #22304a;
  background: #f6f8fb;
}

.member-table td strong,
.member-table td small {
  display: block;
}

.section-help {
  max-width: 980px;
  margin: 6px 0 18px;
  color: #667085;
  line-height: 1.7;
}

.number-rule-table-wrap {
  overflow-x: auto;
  border: 1px solid #edf1f5;
  border-radius: 14px;
  background: #fff;
}

.number-rule-table {
  width: 100%;
  min-width: 980px;
  table-layout: fixed;
  border-collapse: collapse;
}

.number-rule-table th,
.number-rule-table td {
  padding: 12px 14px;
  vertical-align: middle;
}

.number-rule-table th {
  color: #53627a;
  font-size: 13px;
  font-weight: 800;
  background: #f8fafc;
}

.number-rule-table th:nth-child(1) {
  width: 150px;
}

.number-rule-table th:nth-child(2) {
  width: 120px;
}

.number-rule-table th:nth-child(3) {
  width: 82px;
}

.number-rule-table th:nth-child(4) {
  width: 82px;
}

.number-rule-table th:nth-child(5) {
  width: 150px;
}

.number-rule-table th:nth-child(6) {
  width: 92px;
}

.number-rule-table th:nth-child(8) {
  width: 86px;
}

.number-rule-table tr:not(:last-child) td {
  border-bottom: 1px solid #edf1f5;
}

.business-cell strong,
.serial-cell strong {
  display: block;
  color: #071d3a;
}

.business-cell small,
.serial-cell small {
  display: block;
  margin-top: 4px;
  color: #748095;
  font-size: 12px;
}

.year-cell {
  font-weight: 800;
  color: #17324d;
}

.remark-cell {
  color: #4c5d75;
  line-height: 1.55;
  white-space: normal;
  word-break: break-word;
}

.number-rule-table input {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 8px 10px;
}

.number-rule-table select {
  width: 74px;
  margin: 0;
  padding: 6px 8px;
}

.number-rule-table button {
  width: auto;
  min-width: 66px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 8px;
}

.approval-header,
.approval-flow-summary,
.node-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.approval-header {
  margin-bottom: 18px;
}

.approval-header h2,
.approval-flow-summary h3 {
  margin: 0;
}

.approval-header p,
.approval-flow-summary p,
.node-title-row p,
.node-condition {
  margin: 6px 0 0;
  color: #667085;
}

.approval-header > span,
.approval-flow-summary > strong {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-radius: 999px;
  background: #eef5fc;
  color: #245f9f;
  font-weight: 800;
}

.approval-config {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.approval-template-list {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fbfcfe;
}

.approval-template-list button {
  display: grid;
  gap: 4px;
  width: 100%;
  margin: 0;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #17324d;
  text-align: left;
}

.approval-template-list button.selected {
  border-color: #bfe9e5;
  background: #e7f8f6;
  box-shadow: 0 8px 18px rgba(0, 169, 157, 0.1);
}

.approval-template-list small,
.approval-template-list span {
  color: #748095;
}

.approval-flow-panel {
  min-width: 0;
  padding: 18px;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
}

.approval-flow-summary {
  padding-bottom: 16px;
  border-bottom: 1px solid #edf1f5;
}

.approval-flow-track {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.approval-node-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  position: relative;
}

.approval-node-card:not(:last-child)::after {
  content: "";
  position: absolute;
  left: 20px;
  top: 46px;
  bottom: -18px;
  width: 2px;
  background: #dfe6ef;
}

.approval-node-card.disabled {
  opacity: 0.62;
}

.node-order {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: #2b64a8;
  color: #fff;
  font-weight: 900;
}

.node-body {
  padding: 14px;
  border: 1px solid #e3eaf3;
  border-radius: 12px;
  background: #fbfdff;
}

.node-title-row {
  align-items: flex-start;
}

.node-title-row > span {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: #f0f7ff;
  color: #2878ff;
  font-size: 12px;
  font-weight: 900;
}

.node-condition {
  margin-top: 10px;
  font-weight: 800;
}

.node-edit-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr)) auto;
  gap: 10px;
  align-items: end;
  margin-top: 14px;
}

.node-edit-grid label {
  margin: 0;
}

.node-edit-grid input,
.node-edit-grid select {
  width: 100%;
  margin: 0;
  padding: 8px 10px;
}

.node-edit-grid .checkbox-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 39px;
  padding: 0 10px;
  border: 1px solid #dfe6ef;
  border-radius: 8px;
  background: #fff;
}

.node-edit-grid .checkbox-line input {
  width: 16px;
  height: 16px;
  padding: 0;
}

.node-edit-grid button {
  width: auto;
  min-width: 86px;
  margin: 0;
  padding: 9px 14px;
}

.empty-state {
  margin: 0;
  padding: 18px;
  border: 1px dashed #cdd7e5;
  border-radius: 12px;
  color: #748095;
  text-align: center;
}

.role-chip {
  display: inline-flex;
  margin: 0 6px 6px 0;
  padding: 5px 8px;
  border-radius: 8px;
  background: #f0f7ff;
  color: #2878ff;
  font-weight: 700;
}

.editor-row td {
  background: #fbfdff;
}

.role-card {
  gap: 16px;
}

.permission-picker,
.scope-picker,
.sensitive-picker {
  display: grid;
  gap: 12px;
}

.permission-picker h3,
.scope-picker h3,
.sensitive-picker h3 {
  margin: 0;
  font-size: 16px;
}

.permission-group {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e3eaf3;
  border-radius: 10px;
  background: #fff;
}

.permission-group > strong {
  color: #17324d;
}

.permission-checks,
.scope-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.check-tile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: 54px;
  margin: 0;
  padding: 9px 10px;
  border: 1px solid #dfe6ef;
  border-radius: 9px;
  background: #fbfdff;
  color: #172033;
  font-weight: 700;
}

.check-tile.compact {
  min-height: auto;
}

.check-tile input {
  width: auto;
  margin: 3px 0 0;
}

.check-tile small {
  grid-column: 2;
  color: #7a8798;
  font-weight: 500;
}

.scope-details {
  padding: 10px 12px;
  border: 1px dashed #cfd8e6;
  border-radius: 10px;
  background: #fff;
}

.scope-details summary {
  cursor: pointer;
  color: #008f86;
  font-weight: 800;
}

.scope-details .scope-checks {
  margin-top: 10px;
}

.sensitive-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) 160px;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #dfe6ef;
  border-radius: 9px;
  background: #fff;
}

.sensitive-row select {
  width: 100%;
}

.subtle-panel-toggle {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.subtle-panel-toggle button,
.advanced-toggle button {
  width: auto;
  margin: 0;
  padding: 8px 12px;
  color: #245f9f;
  background: #eef5fc;
}

.advanced-toggle {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.position-assignment-form {
  grid-template-columns: repeat(3, minmax(180px, 1fr)) minmax(130px, auto);
  align-items: end;
}

.position-assignment-form .checkbox-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid #dfe6ef;
  border-radius: 8px;
  background: #fff;
  font-weight: 700;
}

.position-assignment-form .checkbox-line input {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  box-shadow: none;
}

.position-assignment-form button {
  width: auto;
  margin: 0;
  padding: 11px 22px;
}

.position-list .data-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
}

.position-list .small-status-button {
  width: auto;
  min-width: 72px;
  margin: 0;
  padding: 8px 16px;
  border-radius: 8px;
  background: #eef5fc;
  color: #245f9f;
}

.position-list .small-status-button:hover {
  background: #dcecff;
}

.account-role-panel {
  margin-top: 14px;
}

.role-card > label,
.role-card select {
  width: 100%;
}

.role-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.role-config-grid form {
  display: grid;
  gap: 10px;
}

@media (max-width: 1100px) {
  .org-console {
    grid-template-columns: 1fr;
  }

  .approval-config,
  .node-edit-grid {
    grid-template-columns: 1fr;
  }

  .org-sidebar {
    border-right: 0;
    border-bottom: 1px solid #e4ebf3;
  }

  .inline-editor,
  .compact-create,
  .role-config-grid,
  .member-toolbar,
  .org-toolbar,
  .position-assignment-form,
  .position-list .data-row {
    grid-template-columns: 1fr;
    display: grid;
  }

  .position-assignment-form button,
  .position-list .small-status-button,
  .node-edit-grid button {
    width: 100%;
  }
}
</style>
