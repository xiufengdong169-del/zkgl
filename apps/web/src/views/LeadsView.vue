<script setup lang="ts">
import type { LeadSummary } from "@zkgl/shared";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { callApi } from "../api";
import { approvalCodeText } from "../approval-display";
import { useAuthStore } from "../stores/auth";

interface CustomerOption {
  id: string;
  name: string;
}

interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  positionName?: string;
}

interface DictionaryOption {
  typeCode: string;
  itemCode: string;
  label: string;
  valueText: string;
  sortOrder: number;
}

interface LeadDetail extends LeadSummary {
  customerName: string;
  customerLeadDepartment: string;
  customerContactName: string;
  projectAddress: string;
  sourceCode: string;
  sourceDescription?: string | null;
  discoveredOn: string;
  estimatedAmount: number | null;
  estimatedStartOn?: string | null;
  projectType: string;
  projectBackground?: string | null;
  requirementSummary: string;
  competition?: string | null;
  nextFollowUpAt: string | null;
  approvalInstanceId?: string | null;
  version?: number;
}

interface FollowUp {
  id: string;
  followedUpAt: string;
  method: string;
  communication: string;
  customerFeedback: string | null;
  successProbability: number;
  nextAction: string;
  nextFollowUpAt: string | null;
}

interface PendingApproval {
  taskId: string;
  instanceId: string;
  instanceCode: string;
  nodeOrder: number;
  positionCode: string;
  positionName: string;
  approverName: string;
  assignedAt: string;
}

interface LinkedProjectApplication {
  id: string;
  code: string;
  projectName: string;
  status: string;
  createdAt: string;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const items = ref<LeadSummary[]>([]);
const customers = ref<CustomerOption[]>([]);
const employees = ref<EmployeeOption[]>([]);
const defaultBiddingMethodOptions: DictionaryOption[] = [
  {
    typeCode: "PROJECT_BIDDING_METHOD",
    itemCode: "PUBLIC",
    label: "公开投标",
    valueText: "PUBLIC",
    sortOrder: 10,
  },
  {
    typeCode: "PROJECT_BIDDING_METHOD",
    itemCode: "NEGOTIATION",
    label: "商务洽谈",
    valueText: "NEGOTIATION",
    sortOrder: 20,
  },
  {
    typeCode: "PROJECT_BIDDING_METHOD",
    itemCode: "NONE",
    label: "无需投标",
    valueText: "NONE",
    sortOrder: 30,
  },
];
const biddingMethodOptions = ref<DictionaryOption[]>(
  defaultBiddingMethodOptions,
);
const selected = ref<LeadDetail | null>(null);
const followUps = ref<FollowUp[]>([]);
const pendingApprovals = ref<PendingApproval[]>([]);
const projectApplications = ref<LinkedProjectApplication[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const showEdit = ref(false);
const showFollowUp = ref(false);
const showConvertForm = ref(false);
const leadPageSize = 6;
const leadPage = ref(1);
const showConvertedLeads = ref(false);

const form = ref({
  projectName: "",
  customerId: "",
  customerLeadDepartment: "",
  customerContactName: "",
  projectAddress: "",
  sourceCode: "CUSTOMER_VISIT",
  discoveredOn: new Date().toISOString().slice(0, 10),
  estimatedAmount: null as number | null,
  estimatedStartOn: null as string | null,
  projectType: "CONSULTING",
  requirementSummary: "",
  successProbability: 50,
  nextFollowUpAt: null as string | null,
});

const followUpForm = ref({
  followedUpAt: new Date().toISOString().slice(0, 16),
  method: "PHONE",
  communication: "",
  customerFeedback: "",
  opportunityChange: "",
  successProbability: 50,
  nextAction: "",
  nextFollowUpAt: null as string | null,
});

const editForm = ref({
  leadId: "",
  projectName: "",
  customerId: "",
  customerLeadDepartment: "",
  customerContactName: "",
  projectAddress: "",
  sourceCode: "CUSTOMER_VISIT",
  discoveredOn: new Date().toISOString().slice(0, 10),
  estimatedAmount: null as number | null,
  estimatedStartOn: null as string | null,
  projectType: "CONSULTING",
  requirementSummary: "",
  successProbability: 50,
  nextFollowUpAt: null as string | null,
});

const convertForm = ref({
  projectName: "",
  customerLeadDepartment: "",
  customerContactName: "",
  projectAddress: "",
  proposedManagerId: auth.user?.employeeId || "",
  investmentAmount: 0,
  estimatedRevenue: 0,
  estimatedCost: 0,
  estimatedStartOn: new Date().toISOString().slice(0, 10),
  estimatedEndOn: new Date(Date.now() + 90 * 86400000)
    .toISOString()
    .slice(0, 10),
  serviceScope: "",
  necessity: "",
  biddingMethod: "PUBLIC",
  riskDescription: "",
});

const statusColumns = [
  { label: "草稿", code: "DRAFT" },
  { label: "待登记", code: "PENDING_REGISTRATION" },
  { label: "跟进中", code: "FOLLOWING" },
];

const grouped = computed(() =>
  Object.fromEntries(
    statusColumns.map((column) => [
      column.code,
      items.value.filter((item) => item.status === column.code),
    ]),
  ),
);
const convertedLeads = computed(() =>
  items.value.filter((item) => item.status === "CONVERTED"),
);
const activeLeads = computed(() =>
  items.value.filter((item) => item.status !== "CONVERTED"),
);
const displayedLeads = computed(() =>
  showConvertedLeads.value ? convertedLeads.value : activeLeads.value,
);
const leadPageCount = computed(() =>
  Math.max(1, Math.ceil(displayedLeads.value.length / leadPageSize)),
);
const pagedLeads = computed(() =>
  displayedLeads.value.slice(
    (leadPage.value - 1) * leadPageSize,
    leadPage.value * leadPageSize,
  ),
);

const currentPendingApproval = computed(
  () => pendingApprovals.value[0] || null,
);

const hasProjectApplication = computed(
  () => projectApplications.value.length > 0,
);
const permissionCodes = computed(() => auth.user?.permissionCodes ?? []);
const canCreateLead = computed(() =>
  permissionCodes.value.includes("lead.create"),
);
const canCreateFollowUp = computed(() =>
  permissionCodes.value.includes("lead.followUp.create"),
);
const canCreateProjectApplication = computed(() =>
  permissionCodes.value.includes("project.application.create"),
);
const canReadProjectApplication = computed(() =>
  permissionCodes.value.includes("project.application.read"),
);
const canReadProject = computed(() =>
  permissionCodes.value.includes("project.read"),
);
const canSubmitApproval = computed(() =>
  permissionCodes.value.includes("approval.instance.submit"),
);
const canWithdrawApproval = computed(() => {
  const permissionCodes = auth.user?.permissionCodes ?? [];
  return permissionCodes.includes("approval.instance.withdraw");
});

function routeLeadId() {
  const value = route.query.leadId;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function routeReturnMode() {
  const value = route.query.returnMode;
  return Array.isArray(value) ? value[0] || "PENDING" : value || "PENDING";
}

function fromApprovalInbox() {
  const value = route.query.returnTo;
  const source = Array.isArray(value) ? value[0] : value;
  return source === "approvals";
}

async function closeSelectedLeadDetail() {
  showEdit.value = false;
  showFollowUp.value = false;
  showConvertForm.value = false;
  if (fromApprovalInbox()) {
    await router.push({
      path: "/approvals",
      query: { mode: routeReturnMode() },
    });
    return;
  }
  selected.value = null;
}

function leadStatusText(value?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    PENDING_REGISTRATION: "待登记",
    FOLLOWING: "跟进中",
    CONVERTED: "已转项目",
    RETURNED: "已退回",
    REJECTED: "已拒绝",
    INVALID: "已失效",
  };
  return (value && labels[value]) || value || "-";
}

function leadStatusHint(value?: string | null) {
  const hints: Record<string, string> = {
    DRAFT: "草稿可以修改、删除，也可以提交登记审批。",
    PENDING_REGISTRATION:
      "待登记表示登记审批已提交，正在等待审批人处理。需要修改时，先撤回审批，回到草稿后再修改。",
    RETURNED: "审批退回后可以修改线索，再重新提交登记审批。",
    REJECTED: "审批已拒绝，该线索可删除。",
    FOLLOWING:
      "审批通过后进入跟进中。此阶段可以继续新增跟进；如果尚未生成立项申请，也可以发起立项。",
    CONVERTED: "立项申请审批通过后，线索自动转为正式项目。",
    INVALID: "线索已关闭或失效，可删除。",
  };
  return (value && hints[value]) || "";
}

function followUpMethodText(value?: string | null) {
  const labels: Record<string, string> = {
    PHONE: "电话",
    ONSITE: "上门",
    VIDEO: "视频",
    WECHAT: "微信",
    EMAIL: "邮件",
    OTHER: "其他",
  };
  return (value && labels[value]) || value || "-";
}

function projectTypeText(value?: string | null) {
  const labels: Record<string, string> = {
    CONSULTING: "信息化咨询",
    SUPERVISION: "信息化监理",
    OTHER: "其他",
  };
  return (value && labels[value]) || value || "-";
}

function applicationStatusText(value?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    APPROVAL_PENDING: "审批中",
    RETURNED: "已退回",
    REJECTED: "已驳回",
    WITHDRAWN: "已撤回",
    APPROVED: "已通过",
  };
  return (value && labels[value]) || value || "-";
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function resetConvertForm(lead: LeadDetail) {
  const estimatedRevenue = Number(lead.estimatedAmount ?? 0);
  const estimatedStartOn =
    toDateInput(lead.estimatedStartOn) || new Date().toISOString().slice(0, 10);
  const estimatedEndOn = new Date(
    new Date(estimatedStartOn).getTime() + 90 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  convertForm.value = {
    projectName: lead.projectName,
    customerLeadDepartment: lead.customerLeadDepartment || "",
    customerContactName: lead.customerContactName || "",
    projectAddress: lead.projectAddress || "",
    proposedManagerId: auth.user?.employeeId || "",
    investmentAmount: estimatedRevenue,
    estimatedRevenue,
    estimatedCost: 0,
    estimatedStartOn,
    estimatedEndOn,
    serviceScope: lead.requirementSummary || lead.projectName,
    necessity: `来源于线索 ${lead.code}，客户已进入跟进阶段，建议发起立项。`,
    biddingMethod: "PUBLIC",
    riskDescription: "",
  };
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [leads, customerResult, employeeResult, projectOptions] =
      await Promise.all([
      callApi<{ items: LeadSummary[] }>("lead.list", {
        page: 1,
        pageSize: 50,
      }),
      callApi<{ items: CustomerOption[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
      canCreateProjectApplication.value
        ? callApi<{ items: EmployeeOption[] }>("project.employee.options", {})
        : Promise.resolve({ items: [] as EmployeeOption[] }),
      canCreateProjectApplication.value
        ? callApi<{ items: DictionaryOption[] }>("dictionary.projectOptions", {})
        : Promise.resolve({ items: [] as DictionaryOption[] }),
    ]);
    items.value = leads.items;
    customers.value = customerResult.items;
    employees.value = employeeResult.items;
    const biddingMethods = projectOptions.items.filter(
      (item) => item.typeCode === "PROJECT_BIDDING_METHOD",
    );
    biddingMethodOptions.value = biddingMethods.length
      ? biddingMethods
      : defaultBiddingMethodOptions;
    leadPage.value = Math.min(leadPage.value, leadPageCount.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function toggleConvertedLeads() {
  showConvertedLeads.value = !showConvertedLeads.value;
  leadPage.value = 1;
}

async function openDetail(id: string) {
  error.value = null;
  try {
    const result = await callApi<{
      lead: LeadDetail;
      followUps: FollowUp[];
      pendingApprovals?: PendingApproval[];
      projectApplications?: LinkedProjectApplication[];
    }>("lead.detail", { leadId: id });
    selected.value = result.lead;
    followUps.value = result.followUps;
    pendingApprovals.value = result.pendingApprovals || [];
    projectApplications.value = result.projectApplications || [];
    followUpForm.value.successProbability = result.lead.successProbability;
    showEdit.value = false;
    showConvertForm.value = false;
    await nextTick();
    document
      .querySelector(".lead-detail-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "详情加载失败";
  }
}

async function loadPage() {
  await load();
  const leadId = routeLeadId();
  if (leadId) await openDetail(leadId);
}

function startEditLead() {
  if (!selected.value) return;
  editForm.value = {
    leadId: selected.value.id,
    projectName: selected.value.projectName,
    customerId: selected.value.customerId,
    customerLeadDepartment: selected.value.customerLeadDepartment || "",
    customerContactName: selected.value.customerContactName || "",
    projectAddress: selected.value.projectAddress || "",
    sourceCode:
      selected.value.sourceCode === "VISIT"
        ? "CUSTOMER_VISIT"
        : selected.value.sourceCode || "CUSTOMER_VISIT",
    discoveredOn: toDateInput(selected.value.discoveredOn),
    estimatedAmount:
      selected.value.estimatedAmount == null
        ? null
        : Number(selected.value.estimatedAmount),
    estimatedStartOn: toDateInput(selected.value.estimatedStartOn) || null,
    projectType: selected.value.projectType || "CONSULTING",
    requirementSummary: selected.value.requirementSummary,
    successProbability: selected.value.successProbability,
    nextFollowUpAt: toDateTimeInput(selected.value.nextFollowUpAt) || null,
  };
  showEdit.value = true;
  showConvertForm.value = false;
  showFollowUp.value = false;
}

async function startConvertToProjectApplication() {
  if (!selected.value) return;
  resetConvertForm(selected.value);
  showConvertForm.value = !showConvertForm.value;
  showFollowUp.value = false;
  showEdit.value = false;
  await nextTick();
  document
    .querySelector(".lead-convert-form")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateLead() {
  if (!auth.user || !selected.value) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("lead.update", {
      ...editForm.value,
      sourceDescription: null,
      projectBackground: null,
      competition: null,
      estimatedStartOn: editForm.value.estimatedStartOn || null,
      nextFollowUpAt: editForm.value.nextFollowUpAt
        ? new Date(editForm.value.nextFollowUpAt).toISOString()
        : null,
    });
    showEdit.value = false;
    notice.value = "线索已保存。";
    await load();
    await openDetail(editForm.value.leadId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存线索失败";
  } finally {
    saving.value = false;
  }
}

async function deleteLead(lead: LeadDetail) {
  if (
    !window.confirm(
      `确认删除这条${leadStatusText(lead.status)}线索？删除后列表中不再显示。`,
    )
  )
    return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("lead.delete", { leadId: lead.id });
    selected.value = null;
    pendingApprovals.value = [];
    projectApplications.value = [];
    showEdit.value = false;
    showConvertForm.value = false;
    notice.value = "线索已删除。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "删除线索失败";
  } finally {
    saving.value = false;
  }
}

async function createLead() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("lead.create", {
      ...form.value,
      collaboratorIds: [],
      sourceDescription: null,
      projectBackground: null,
      competition: null,
      sourceVisitId: null,
      estimatedStartOn: form.value.estimatedStartOn || null,
      nextFollowUpAt: form.value.nextFollowUpAt
        ? new Date(form.value.nextFollowUpAt).toISOString()
        : null,
    });
    showForm.value = false;
    notice.value = "线索已保存。下一步可提交登记审批。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function submitApproval(lead: LeadDetail) {
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "LEAD",
      businessId: lead.id,
      title: `线索登记：${lead.projectName}`,
      amount: nullableNumber(lead.estimatedAmount),
    });
    notice.value = "登记审批已提交。审批入口：审批与待办 → 待我审批。";
    await load();
    await openDetail(lead.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  } finally {
    saving.value = false;
  }
}

async function withdrawApproval(lead: LeadDetail) {
  if (!lead.approvalInstanceId) {
    error.value = "未找到登记审批记录，请刷新后重试";
    return;
  }
  if (
    !window.confirm(
      "确认撤回登记审批？撤回后线索会回到草稿，可修改后重新提交。",
    )
  )
    return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("approval.instance.withdraw", {
      instanceId: lead.approvalInstanceId,
      actionKey: crypto.randomUUID(),
      comment: "申请人撤回登记审批",
    });
    notice.value = "登记审批已撤回。";
    await load();
    await openDetail(lead.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "撤回审批失败";
  } finally {
    saving.value = false;
  }
}

async function addFollowUp() {
  if (!selected.value) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("lead.followUp.create", {
      ...followUpForm.value,
      leadId: selected.value.id,
      participantIds: [],
      followedUpAt: new Date(followUpForm.value.followedUpAt).toISOString(),
      customerFeedback: followUpForm.value.customerFeedback || null,
      opportunityChange: followUpForm.value.opportunityChange || null,
      nextFollowUpAt: followUpForm.value.nextFollowUpAt
        ? new Date(followUpForm.value.nextFollowUpAt).toISOString()
        : null,
    });
    showFollowUp.value = false;
    followUpForm.value.communication = "";
    followUpForm.value.nextAction = "";
    notice.value = "跟进记录已保存。";
    await load();
    await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存跟进失败";
  } finally {
    saving.value = false;
  }
}

async function createProjectApplicationFromLead() {
  if (!selected.value || !auth.user) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("project.application.create", {
      projectName: convertForm.value.projectName.trim(),
      customerId: selected.value.customerId,
      sourceLeadId: selected.value.id,
      customerLeadDepartment: convertForm.value.customerLeadDepartment,
      customerContactName: convertForm.value.customerContactName,
      projectAddress: convertForm.value.projectAddress,
      projectType: selected.value.projectType,
      background: selected.value.requirementSummary || null,
      serviceScope: convertForm.value.serviceScope,
      investmentAmount: Number(convertForm.value.investmentAmount),
      estimatedRevenue: Number(convertForm.value.estimatedRevenue),
      estimatedCost: Number(convertForm.value.estimatedCost),
      estimatedStartOn: convertForm.value.estimatedStartOn,
      estimatedEndOn: convertForm.value.estimatedEndOn,
      proposedManagerId: convertForm.value.proposedManagerId,
      memberSuggestions: [],
      biddingMethod: convertForm.value.biddingMethod,
      riskDescription: convertForm.value.riskDescription || null,
      necessity: convertForm.value.necessity,
    });
    showConvertForm.value = false;
    notice.value =
      "立项申请已生成。下一步：进入“项目管理 → 立项申请”，提交立项审批；审批通过后线索自动变为“已转项目”。";
    await load();
    await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "生成立项申请失败";
  } finally {
    saving.value = false;
  }
}

async function closeLead(lead: LeadDetail) {
  const reason = window.prompt("请输入关闭原因")?.trim();
  if (!reason) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    await callApi("lead.close", { leadId: lead.id, reason });
    selected.value = null;
    showConvertForm.value = false;
    notice.value = "线索已关闭，可在全部线索中查看为“已失效”。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "关闭失败";
  } finally {
    saving.value = false;
  }
}

onMounted(loadPage);

watch(
  () => route.query.leadId,
  async () => {
    const leadId = routeLeadId();
    if (leadId) await openDetail(leadId);
  },
);
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">MARKET PIPELINE</p>
        <h1>项目线索</h1>
      </div>
      <button
        v-if="canCreateLead && !selected"
        class="primary-action"
        @click="showForm = !showForm"
      >
        {{ showForm ? "取消" : "新增线索" }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>

    <form v-if="showForm" class="entity-form" @submit.prevent="createLead">
      <label>
        项目名称<span class="required-mark">*</span>
        <input v-model="form.projectName" required minlength="2" />
      </label>
      <label>
        客户<span class="required-mark">*</span>
        <select v-model="form.customerId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="customer in customers"
            :key="customer.id"
            :value="customer.id"
          >
            {{ customer.name }}
          </option>
        </select>
      </label>
      <label>
        客户项目牵头部门<span class="required-mark">*</span>
        <input v-model="form.customerLeadDepartment" required maxlength="128" />
      </label>
      <label>
        客户对接联系人<span class="required-mark">*</span>
        <input v-model="form.customerContactName" required maxlength="128" />
      </label>
      <label>
        项目地址<span class="required-mark">*</span>
        <input v-model="form.projectAddress" required maxlength="512" />
      </label>
      <label>
        来源
        <select v-model="form.sourceCode">
          <option value="CUSTOMER_VISIT">客户拜访</option>
          <option value="REFERRAL">转介绍</option>
          <option value="PUBLIC">公开信息</option>
          <option value="OTHER">其他</option>
        </select>
      </label>
      <label>
        发现日期
        <input v-model="form.discoveredOn" type="date" required />
      </label>
      <label>
        预计金额（万元）<span class="required-mark">*</span>
        <input
          v-model.number="form.estimatedAmount"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </label>
      <label>
        预计启动
        <input v-model="form.estimatedStartOn" type="date" />
      </label>
      <label>
        项目类型<span class="required-mark">*</span>
        <select v-model="form.projectType" required>
          <option value="CONSULTING">信息化咨询</option>
          <option value="SUPERVISION">信息化监理</option>
          <option value="OTHER">其他</option>
        </select>
      </label>
      <label>
        成功概率（%）
        <input
          v-model.number="form.successProbability"
          type="number"
          min="0"
          max="100"
          required
        />
      </label>
      <label>
        下次跟进
        <input v-model="form.nextFollowUpAt" type="datetime-local" />
      </label>
      <label class="wide">
        需求概述
        <textarea
          v-model="form.requirementSummary"
          required
          minlength="2"
        ></textarea>
      </label>
      <button type="submit" :disabled="saving">
        {{ saving ? "保存中..." : "保存线索" }}
      </button>
    </form>

    <section v-if="!selected" class="pipeline">
      <article
        v-for="column in statusColumns"
        :key="column.code"
        class="pipeline-column"
      >
        <div>
          <h2>{{ column.label }}</h2>
          <span>{{ grouped[column.code]?.length || 0 }}</span>
        </div>
        <button
          v-for="lead in grouped[column.code]?.slice(0, 5)"
          :key="lead.id"
          type="button"
          @click="openDetail(lead.id)"
        >
          {{ lead.projectName }} · {{ lead.successProbability }}%
        </button>
        <p v-if="(grouped[column.code]?.length || 0) > 5">
          还有 {{ (grouped[column.code]?.length || 0) - 5 }} 条，请在下方列表分页查看
        </p>
        <p v-if="!grouped[column.code]?.length">暂无记录</p>
        <small>{{ leadStatusText(column.code) }}</small>
      </article>
    </section>

    <section v-if="!selected" class="data-panel">
      <section v-if="convertedLeads.length" class="archive-strip">
        <div>
          <strong>已转项目线索 {{ convertedLeads.length }} 条</strong>
          <p>这类线索已生成正式项目，默认归档，不占用当前跟进列表。</p>
        </div>
        <button type="button" class="secondary-button" @click="toggleConvertedLeads">
          {{ showConvertedLeads ? "返回当前线索" : "查看已转项目线索" }}
        </button>
      </section>
      <div class="section-title">
        <h2>{{ showConvertedLeads ? "已转项目线索" : "当前线索" }}</h2>
        <span class="muted">
          共 {{ displayedLeads.length }} 条，每页 {{ leadPageSize }} 条
        </span>
      </div>
      <p v-if="loading">正在加载...</p>
      <table v-else-if="pagedLeads.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>项目名称</th>
            <th>成功概率</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in pagedLeads"
            :key="item.id"
            class="clickable"
            @click="openDetail(item.id)"
          >
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.successProbability }}%</td>
            <td>{{ leadStatusText(item.status) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>{{ showConvertedLeads ? "暂无已转项目线索" : "暂无当前线索" }}</p>
      <div v-if="leadPageCount > 1" class="pager">
        <button
          type="button"
          :disabled="leadPage <= 1"
          @click="leadPage -= 1"
        >
          上一页
        </button>
        <span>第 {{ leadPage }} / {{ leadPageCount }} 页</span>
        <button
          type="button"
          :disabled="leadPage >= leadPageCount"
          @click="leadPage += 1"
        >
          下一页
        </button>
      </div>
    </section>

    <section v-if="selected" class="data-panel lead-detail-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ selected.code }}</p>
          <h2>{{ selected.projectName }}</h2>
        </div>
        <button
          class="secondary-button"
          type="button"
          @click="closeSelectedLeadDetail"
        >
          {{ fromApprovalInbox() ? "返回审批与待办" : "关闭详情" }}
        </button>
      </header>

      <p>
        客户：{{ selected.customerName }}　项目类型：{{
          projectTypeText(selected.projectType)
        }}　成功概率：{{ selected.successProbability }}%　状态：{{
          leadStatusText(selected.status)
        }}
      </p>
      <p>
        客户项目牵头部门：{{ selected.customerLeadDepartment }}　客户对接联系人：{{
          selected.customerContactName
        }}　项目地址：{{ selected.projectAddress }}
      </p>
      <p class="status-hint">
        {{
          selected.status === "FOLLOWING" && hasProjectApplication
            ? "该线索已生成立项申请，不能重复申请；立项审批没有全部通过前，线索仍停留在“跟进中”，可以继续新增跟进。"
            : leadStatusHint(selected.status)
        }}
      </p>
      <p>{{ selected.requirementSummary }}</p>

      <div
        v-if="selected.status === 'PENDING_REGISTRATION'"
        class="approval-guide"
      >
        <h3>当前登记审批</h3>
        <p v-if="currentPendingApproval">
          审批单：{{
            approvalCodeText(currentPendingApproval.instanceCode, "LEAD")
          }}　当前节点：第 {{ currentPendingApproval.nodeOrder }} 关　审批岗位：{{
            currentPendingApproval.positionName
          }}　审批人员：{{
            currentPendingApproval.approverName
          }}
        </p>
        <p v-else>审批已提交，正在等待审批人处理。</p>
        <div class="approval-actions">
          <RouterLink class="button-link secondary" to="/approvals">
            去审批待办
          </RouterLink>
          <RouterLink class="button-link secondary" to="/admin">
            配置审批人
          </RouterLink>
        </div>
        <small>
          配置路径：系统管理 → 组织与权限 → 审批岗位任职；审批路径：审批与待办 →
          待我审批。
        </small>
      </div>

      <section v-if="projectApplications.length" class="approval-guide">
        <h3>关联立项申请</h3>
        <article
          v-for="application in projectApplications"
          :key="application.id"
          class="data-row compact"
        >
          <div>
            <strong>项目名称：{{ application.projectName }}</strong>
            <p>
              {{ application.code }} ·
              {{ applicationStatusText(application.status) }}
            </p>
          </div>
          <RouterLink
            v-if="canReadProjectApplication && canReadProject"
            class="button-link secondary"
            :to="{ path: '/projects', query: { applicationId: application.id } }"
          >
            查看立项申请
          </RouterLink>
        </article>
        <small>
          该线索已生成立项申请，不能重复申请。审批没有全部通过前，线索仍停留在“跟进中”，可以继续新增跟进；立项审批全部通过后，会自动变为“已转项目”。
        </small>
      </section>

      <div class="approval-actions">
        <button
          v-if="
            ['DRAFT', 'RETURNED'].includes(selected.status) && canSubmitApproval
          "
          class="secondary"
          type="button"
          :disabled="saving"
          @click="startEditLead"
        >
          修改线索
        </button>
        <button
          v-if="['DRAFT', 'RETURNED'].includes(selected.status)"
          type="button"
          :disabled="saving"
          @click="submitApproval(selected)"
        >
          提交登记审批
        </button>
        <button
          v-if="
            ['DRAFT', 'RETURNED', 'REJECTED', 'INVALID'].includes(
              selected.status,
            )
          "
          class="danger"
          type="button"
          :disabled="saving"
          @click="deleteLead(selected)"
        >
          删除线索
        </button>
        <button
          v-if="
            selected.status === 'PENDING_REGISTRATION' && canWithdrawApproval
          "
          class="secondary"
          type="button"
          :disabled="saving"
          @click="withdrawApproval(selected)"
        >
          撤回登记审批
        </button>
        <button
          v-if="selected.status === 'FOLLOWING' && canCreateFollowUp"
          class="secondary"
          type="button"
          :disabled="saving"
          @click="showFollowUp = !showFollowUp"
        >
          {{ showFollowUp ? "取消跟进" : "新增跟进" }}
        </button>
        <button
          v-if="
            selected.status === 'FOLLOWING' &&
            !hasProjectApplication &&
            canCreateProjectApplication
          "
          class="secondary"
          type="button"
          :disabled="saving"
          @click="startConvertToProjectApplication"
        >
          {{ showConvertForm ? "取消立项申请" : "生成立项申请" }}
        </button>
        <button
          v-if="['DRAFT', 'RETURNED', 'FOLLOWING'].includes(selected.status)"
          type="button"
          :disabled="saving"
          @click="closeLead(selected)"
        >
          关闭线索
        </button>
      </div>

      <form v-if="showEdit" class="entity-form" @submit.prevent="updateLead">
        <h3 class="wide">修改线索</h3>
        <label>
          项目名称<span class="required-mark">*</span>
          <input v-model="editForm.projectName" required minlength="2" />
        </label>
        <label>
          客户<span class="required-mark">*</span>
          <select v-model="editForm.customerId" required>
            <option value="" disabled>请选择</option>
            <option
              v-for="customer in customers"
              :key="customer.id"
              :value="customer.id"
            >
              {{ customer.name }}
            </option>
          </select>
        </label>
        <label>
          客户项目牵头部门<span class="required-mark">*</span>
          <input
            v-model="editForm.customerLeadDepartment"
            required
            maxlength="128"
          />
        </label>
        <label>
          客户对接联系人<span class="required-mark">*</span>
          <input
            v-model="editForm.customerContactName"
            required
            maxlength="128"
          />
        </label>
        <label>
          项目地址<span class="required-mark">*</span>
          <input v-model="editForm.projectAddress" required maxlength="512" />
        </label>
        <label>
          来源
          <select v-model="editForm.sourceCode">
            <option value="CUSTOMER_VISIT">客户拜访</option>
            <option value="REFERRAL">转介绍</option>
            <option value="PUBLIC">公开信息</option>
            <option value="OTHER">其他</option>
          </select>
        </label>
        <label>
          发现日期
          <input v-model="editForm.discoveredOn" type="date" required />
        </label>
        <label>
          预计金额（万元）<span class="required-mark">*</span>
          <input
            v-model.number="editForm.estimatedAmount"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          预计启动
          <input v-model="editForm.estimatedStartOn" type="date" />
        </label>
        <label>
          项目类型<span class="required-mark">*</span>
          <select v-model="editForm.projectType" required>
            <option value="CONSULTING">信息化咨询</option>
            <option value="SUPERVISION">信息化监理</option>
            <option value="OTHER">其他</option>
          </select>
        </label>
        <label>
          成功概率（%）
          <input
            v-model.number="editForm.successProbability"
            type="number"
            min="0"
            max="100"
            required
          />
        </label>
        <label>
          下次跟进
          <input v-model="editForm.nextFollowUpAt" type="datetime-local" />
        </label>
        <label class="wide">
          需求概述
          <textarea
            v-model="editForm.requirementSummary"
            required
            minlength="2"
          ></textarea>
        </label>
        <button type="submit" :disabled="saving">保存修改</button>
        <button type="button" @click="showEdit = false">取消</button>
      </form>

      <form
        v-if="showConvertForm"
        class="entity-form lead-convert-form"
        @submit.prevent="createProjectApplicationFromLead"
      >
        <h3 class="wide">生成立项申请</h3>
        <p class="wide status-hint">
          保存后到“项目管理 →
          立项申请”提交立项审批；这里的项目名称可以按正式立项名称调整，来源线索仍会保留便于追溯。
        </p>
        <label class="wide">
          项目名称<span class="required-mark">*</span>
          <input
            v-model="convertForm.projectName"
            required
            minlength="2"
            maxlength="255"
          />
        </label>
        <label>
          客户项目牵头部门<span class="required-mark">*</span>
          <input
            v-model="convertForm.customerLeadDepartment"
            required
            maxlength="128"
          />
        </label>
        <label>
          客户对接联系人<span class="required-mark">*</span>
          <input
            v-model="convertForm.customerContactName"
            required
            maxlength="128"
          />
        </label>
        <label>
          项目地址<span class="required-mark">*</span>
          <input v-model="convertForm.projectAddress" required maxlength="512" />
        </label>
        <label>
          拟任项目负责人<span class="required-mark">*</span>
          <select v-model="convertForm.proposedManagerId" required>
            <option value="" disabled>请选择</option>
            <option
              v-for="person in employees"
              :key="person.id"
              :value="person.id"
            >
              {{ person.name }}{{ person.positionName ? ` · ${person.positionName}` : "" }}
            </option>
          </select>
        </label>
        <label>
          项目投资规模（万元）<span class="required-mark">*</span>
          <input
            v-model.number="convertForm.investmentAmount"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          预计收入（万元）<span class="required-mark">*</span>
          <input
            v-model.number="convertForm.estimatedRevenue"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          预计成本（万元）
          <input
            v-model.number="convertForm.estimatedCost"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          预计开始<span class="required-mark">*</span>
          <input v-model="convertForm.estimatedStartOn" type="date" required />
        </label>
        <label>
          预计结束
          <input v-model="convertForm.estimatedEndOn" type="date" required />
        </label>
        <label>
          投标方式<span class="required-mark">*</span>
          <select v-model="convertForm.biddingMethod" required>
            <option
              v-for="item in biddingMethodOptions"
              :key="item.itemCode"
              :value="item.valueText"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="wide">
          服务范围
          <textarea
            v-model="convertForm.serviceScope"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide">
          立项必要性
          <textarea
            v-model="convertForm.necessity"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide">
          风险说明
          <textarea v-model="convertForm.riskDescription"></textarea>
        </label>
        <button type="submit" :disabled="saving">
          {{ saving ? "保存中..." : "生成立项申请" }}
        </button>
        <button type="button" @click="showConvertForm = false">取消</button>
      </form>

      <form
        v-if="showFollowUp"
        class="entity-form"
        @submit.prevent="addFollowUp"
      >
        <label>
          跟进时间
          <input
            v-model="followUpForm.followedUpAt"
            type="datetime-local"
            required
          />
        </label>
        <label>
          方式
          <select v-model="followUpForm.method">
            <option value="PHONE">电话</option>
            <option value="ONSITE">上门</option>
            <option value="VIDEO">视频</option>
            <option value="WECHAT">微信</option>
            <option value="EMAIL">邮件</option>
            <option value="OTHER">其他</option>
          </select>
        </label>
        <label>
          成功概率（%）
          <input
            v-model.number="followUpForm.successProbability"
            type="number"
            min="0"
            max="100"
            required
          />
        </label>
        <label class="wide">
          沟通内容
          <textarea
            v-model="followUpForm.communication"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide">
          客户反馈
          <textarea v-model="followUpForm.customerFeedback"></textarea>
        </label>
        <label class="wide">
          下一步行动
          <textarea
            v-model="followUpForm.nextAction"
            required
            minlength="2"
          ></textarea>
        </label>
        <label>
          下次跟进
          <input v-model="followUpForm.nextFollowUpAt" type="datetime-local" />
        </label>
        <button :disabled="saving">
          {{ saving ? "保存中..." : "保存跟进" }}
        </button>
      </form>

      <h3>跟进记录</h3>
      <article v-for="followUp in followUps" :key="followUp.id">
        <strong>
          {{ new Date(followUp.followedUpAt).toLocaleString() }} ·
          {{ followUpMethodText(followUp.method) }}
        </strong>
        <p>{{ followUp.communication }}</p>
        <small>
          成功概率 {{ followUp.successProbability }}% · 下一步：{{
            followUp.nextAction
          }}
        </small>
      </article>
      <p v-if="!followUps.length">暂无跟进记录</p>
    </section>
  </main>
</template>
