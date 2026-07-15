<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";

interface Department {
  id: string;
  code: string;
  name: string;
  status: string;
}
interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  departmentName: string;
  positionName?: string;
  accountStatus: string;
}
interface Role {
  id: string;
  code: string;
  name: string;
  status: string;
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
  employeeName: string;
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
const department = ref({ code: "", name: "" });
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
  employeeType: "EMPLOYEE",
  departmentId: "",
  positionName: "",
  mobile: "",
  email: "",
  joinedOn: "",
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
    await callApi("admin.department.create", department.value);
    department.value = { code: "", name: "" };
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
      employeeType: "EMPLOYEE",
      departmentId: "",
      positionName: "",
      mobile: "",
      email: "",
      joinedOn: "",
    };
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
      <form class="entity-form" @submit.prevent="createDepartment">
        <h2 class="wide">新增部门</h2>
        <label
          >部门编码<input
            v-model="department.code"
            required
            minlength="2" /></label
        ><label
          >部门名称<input
            v-model="department.name"
            required
            minlength="2" /></label
        ><button :disabled="saving">保存部门</button>
      </form>
      <form class="entity-form" @submit.prevent="createEmployee">
        <h2 class="wide">新增人员</h2>
        <label>人员编码<input v-model="employee.employeeCode" required /></label
        ><label>姓名<input v-model="employee.name" required /></label
        ><label
          >类型<select v-model="employee.employeeType">
            <option value="EMPLOYEE">员工</option>
            <option value="PARTNER">合作人</option>
            <option value="EXTERNAL">外部人员</option>
          </select></label
        ><label
          >部门<select v-model="employee.departmentId" required>
            <option value="" disabled>请选择</option>
            <option v-for="item in departments" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select></label
        ><label>岗位<input v-model="employee.positionName" /></label
        ><label>手机<input v-model="employee.mobile" /></label
        ><label>邮箱<input v-model="employee.email" type="email" /></label
        ><label>入职日<input v-model="employee.joinedOn" type="date" /></label
        ><button :disabled="saving">保存人员</button>
      </form>
      <form class="entity-form" @submit.prevent="createAccount">
        <h2 class="wide">关联登录账号</h2>
        <label
          >人员<select v-model="account.employeeId" required>
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
          >登录账号<input
            v-model="account.username"
            required
            minlength="3"
            maxlength="64" /></label
        ><label
          >云开发 UID<input
            v-model="account.cloudbaseUid"
            required
            minlength="6"
            maxlength="128" /></label
        ><label
          >初始角色<select v-model="account.roleIds" multiple required>
            <option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select></label
        ><button :disabled="saving">保存账号映射</button>
        <p class="wide muted">
          密码仅由云开发身份服务管理，本系统不接收或保存密码。
        </p>
      </form>
      <form class="entity-form" @submit.prevent="createPositionAssignment">
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
        ><label
          ><input
            v-model="assignmentForm.isDelegate"
            type="checkbox"
          />代理任职</label
        ><button :disabled="saving">保存任职</button>
      </form>
      <section class="data-list">
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
              {{ assignment.startsOn }} 至 {{ assignment.endsOn || "长期" }} ·
              {{ assignment.isDelegate ? "代理" : "正式" }} ·
              {{ assignment.status }}
            </p>
          </div>
          <button @click="togglePositionAssignment(assignment)">
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
      <section class="data-list">
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
      <section class="data-list">
        <h2>角色权限与数据范围</h2>
        <p class="muted">
          数据范围每行一条：ALL:、SELF:、DEPARTMENT:部门ID、PROJECT:项目ID。敏感字段每行一条：字段编码:FULL|MASKED:true|false。
        </p>
        <article v-for="role in roles" :key="role.id" class="data-row">
          <div>
            <strong>{{ role.name }} · {{ role.code }}</strong>
            <p>{{ role.status }}</p>
          </div>
          <label>
            权限
            <select
              multiple
              :value="rolePermissionIds(role.id)"
              :disabled="saving"
              @change="setRolePermissions(role, $event)"
            >
              <option
                v-for="permission in permissions"
                :key="permission.id"
                :value="permission.id"
              >
                {{ permission.name }} · {{ permission.code }}
              </option>
            </select>
          </label>
          <form @submit.prevent="saveRoleDataScopes(role, $event)">
            <label>
              数据范围
              <textarea
                name="scopes"
                rows="4"
                :value="formatRoleDataScopes(role.id)"
              ></textarea>
            </label>
            <button :disabled="saving">保存数据范围</button>
          </form>
          <form @submit.prevent="saveSensitiveGrants(role, $event)">
            <label>
              敏感字段
              <textarea
                name="grants"
                rows="4"
                :value="formatSensitiveGrants(role.id)"
              ></textarea>
            </label>
            <button :disabled="saving">保存敏感字段</button>
          </form>
        </article>
      </section>
    </template>

    <section v-else-if="activeTab === 'numbers'" class="data-panel">
      <h2>业务编号规则</h2>
      <table>
        <thead>
          <tr>
            <th>业务</th>
            <th>前缀</th>
            <th>年份</th>
            <th>流水位数</th>
            <th>下一个流水号</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in numberRules" :key="rule.id">
            <td>{{ rule.ruleCode }}</td>
            <td><input v-model="rule.prefix" maxlength="32" /></td>
            <td>{{ rule.currentYear }}</td>
            <td>
              <input
                v-model.number="rule.serialLength"
                type="number"
                min="2"
                max="12"
              />
            </td>
            <td>{{ rule.nextSerial }}</td>
            <td>
              <select v-model="rule.status">
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select>
            </td>
            <td>
              <button :disabled="saving" @click="saveNumberRule(rule)">
                保存
              </button>
            </td>
          </tr>
        </tbody>
      </table>
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
      <h2>审批模板</h2>
      <p>审批模板按业务类型预置，节点数量用于核对配置完整性。</p>
      <table>
        <thead>
          <tr>
            <th>模板编码</th>
            <th>名称</th>
            <th>业务类型</th>
            <th>版本</th>
            <th>有效节点</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="template in approvalTemplates" :key="template.id">
            <td>{{ template.templateCode }}</td>
            <td>{{ template.name }}</td>
            <td>{{ template.businessType }}</td>
            <td>V{{ template.version }}</td>
            <td>{{ template.nodeCount }}</td>
            <td>{{ template.status }}</td>
          </tr>
        </tbody>
      </table>
      <h3>审批节点</h3>
      <table>
        <thead>
          <tr>
            <th>模板</th>
            <th>顺序</th>
            <th>节点名称</th>
            <th>审批岗位</th>
            <th>最低金额</th>
            <th>最高金额</th>
            <th>抄送</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in approvalNodes" :key="node.id">
            <td>
              {{
                approvalTemplates.find(
                  (template) => template.id === node.templateId,
                )?.templateCode
              }}
            </td>
            <td>{{ node.nodeOrder }}</td>
            <td><input v-model="node.nodeName" /></td>
            <td>
              <select v-model="node.positionCode">
                <option
                  v-for="position in positions"
                  :key="position.code"
                  :value="position.code"
                >
                  {{ position.name }}
                </option>
              </select>
            </td>
            <td>
              <input
                v-model.number="node.minimumAmount"
                type="number"
                min="0"
                step="0.01"
              />
            </td>
            <td>
              <input
                v-model.number="node.maximumAmount"
                type="number"
                min="0"
                step="0.01"
              />
            </td>
            <td><input v-model="node.isCc" type="checkbox" /></td>
            <td>
              <select v-model="node.status">
                <option value="ENABLED">启用</option>
                <option value="DISABLED">停用</option>
              </select>
            </td>
            <td>
              <button :disabled="saving" @click="saveApprovalNode(node)">
                保存
              </button>
            </td>
          </tr>
        </tbody>
      </table>
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
              <option value="FAILURE">失败</option>
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
