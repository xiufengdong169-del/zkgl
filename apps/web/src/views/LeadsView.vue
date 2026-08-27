<script setup lang="ts">
import type { LeadSummary } from "@zkgl/shared";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { callApi } from "../api";
import { approvalCodeText } from "../approval-display";
import { useAuthStore } from "../stores/auth";

interface CustomerOption {
  id: string;
  name: string;
}
interface LeadDetail extends LeadSummary {
  customerName: string;
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

const auth = useAuthStore();
const route = useRoute();
const items = ref<LeadSummary[]>([]);
const customers = ref<CustomerOption[]>([]);
const selected = ref<LeadDetail | null>(null);
const followUps = ref<FollowUp[]>([]);
const pendingApprovals = ref<PendingApproval[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const showEdit = ref(false);
const showFollowUp = ref(false);
const showConvertForm = ref(false);
const form = ref({
  projectName: "",
  customerId: "",
  sourceCode: "VISIT",
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
  sourceCode: "VISIT",
  discoveredOn: new Date().toISOString().slice(0, 10),
  estimatedAmount: null as number | null,
  estimatedStartOn: null as string | null,
  projectType: "CONSULTING",
  requirementSummary: "",
  successProbability: 50,
  nextFollowUpAt: null as string | null,
});
const convertForm = ref({
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
  { label: "已转项目", code: "CONVERTED" },
];
const grouped = computed(() =>
  Object.fromEntries(
    statusColumns.map((column) => [
      column.code,
      items.value.filter((item) => item.status === column.code),
    ]),
  ),
);
const currentPendingApproval = computed(
  () => pendingApprovals.value[0] || null,
);

function routeLeadId() {
  const value = route.query.leadId;
  return Array.isArray(value) ? value[0] || "" : value || "";
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
    REJECTED: "审批已拒绝，该线索不再继续登记。",
    FOLLOWING: "审批通过后进入跟进中，可以新增跟进记录。",
    CONVERTED: "该线索已转为项目。",
    INVALID: "该线索已关闭或失效。",
  };
  return (value && hints[value]) || "";
}

function followUpMethodText(value?: string | null) {
  const labels: Record<string, string> = {
    PHONE: "电话",
    ONSITE: "现场",
    VIDEO: "视频",
    WECHAT: "微信",
    EMAIL: "邮件",
    OTHER: "其他",
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
    const [leads, customerResult] = await Promise.all([
      callApi<{ items: LeadSummary[] }>("lead.list", {
        page: 1,
        pageSize: 50,
      }),
      callApi<{ items: CustomerOption[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
    ]);
    items.value = leads.items;
    customers.value = customerResult.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: string) {
  error.value = null;
  try {
    const result = await callApi<{
      lead: LeadDetail;
      followUps: FollowUp[];
      pendingApprovals?: PendingApproval[];
    }>("lead.detail", { leadId: id });
    selected.value = result.lead;
    followUps.value = result.followUps;
    pendingApprovals.value = result.pendingApprovals || [];
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
    sourceCode: selected.value.sourceCode || "VISIT",
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
}

function startConvertToProjectApplication() {
  if (!selected.value) return;
  resetConvertForm(selected.value);
  showConvertForm.value = !showConvertForm.value;
  showFollowUp.value = false;
}

async function updateLead() {
  if (!auth.user || !selected.value) return;
  saving.value = true;
  error.value = null;
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
    showEdit.value = false;
    showConvertForm.value = false;
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
      projectName: selected.value.projectName,
      customerId: selected.value.customerId,
      sourceLeadId: selected.value.id,
      projectType: selected.value.projectType,
      background: selected.value.requirementSummary || null,
      serviceScope: convertForm.value.serviceScope,
      estimatedRevenue: Number(convertForm.value.estimatedRevenue),
      estimatedCost: Number(convertForm.value.estimatedCost),
      estimatedStartOn: convertForm.value.estimatedStartOn,
      estimatedEndOn: convertForm.value.estimatedEndOn,
      proposedManagerId: auth.user.employeeId,
      memberSuggestions: [],
      biddingMethod: convertForm.value.biddingMethod,
      riskDescription: convertForm.value.riskDescription || null,
      necessity: convertForm.value.necessity,
    });
    showConvertForm.value = false;
    notice.value =
      "立项申请已生成。下一步：进入“项目管理”，找到该立项申请，提交立项审批；审批通过后线索自动变为“已转项目”。";
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
      <button class="primary-action" @click="showForm = !showForm">
        {{ showForm ? "取消" : "新增线索" }}
      </button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <form v-if="showForm" class="entity-form" @submit.prevent="createLead">
      <label
        >项目名称<input v-model="form.projectName" required minlength="2"
      /></label>
      <label
        >客户<select v-model="form.customerId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="customer in customers"
            :key="customer.id"
            :value="customer.id"
          >
            {{ customer.name }}
          </option>
        </select></label
      >
      <label
        >来源<select v-model="form.sourceCode">
          <option value="VISIT">客户拜访</option>
          <option value="REFERRAL">转介绍</option>
          <option value="PUBLIC">公开信息</option>
          <option value="OTHER">其他</option>
        </select></label
      >
      <label
        >发现日期<input v-model="form.discoveredOn" type="date" required
      /></label>
      <label
        >预计金额（万元）<input
          v-model.number="form.estimatedAmount"
          type="number"
          min="0"
          step="0.01"
      /></label>
      <label
        >预计启动<input v-model="form.estimatedStartOn" type="date"
      /></label>
      <label
        >项目类型<select v-model="form.projectType">
          <option value="CONSULTING">信息化咨询</option>
          <option value="SUPERVISION">信息化监理</option>
          <option value="OTHER">其他</option>
        </select></label
      >
      <label
        >成功概率（%）<input
          v-model.number="form.successProbability"
          type="number"
          min="0"
          max="100"
          required
      /></label>
      <label
        >下次跟进<input v-model="form.nextFollowUpAt" type="datetime-local"
      /></label>
      <label class="wide"
        >需求概述<textarea
          v-model="form.requirementSummary"
          required
          minlength="2"
        ></textarea>
      </label>
      <button type="submit" :disabled="saving">
        {{ saving ? "保存中…" : "保存线索" }}
      </button>
    </form>
    <section class="pipeline">
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
          v-for="lead in grouped[column.code]"
          :key="lead.id"
          type="button"
          @click="openDetail(lead.id)"
        >
          {{ lead.projectName }} · {{ lead.successProbability }}%
        </button>
        <p v-if="!grouped[column.code]?.length">暂无记录</p>
        <small>{{ leadStatusText(column.code) }}</small>
      </article>
    </section>
    <section class="data-panel">
      <h2>全部线索</h2>
      <p v-if="loading">正在加载…</p>
      <table v-else-if="items.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>项目名称</th>
            <th>成功概率</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="openDetail(item.id)">
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.successProbability }}%</td>
            <td>{{ leadStatusText(item.status) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无线索</p>
    </section>
    <section v-if="selected" class="data-panel lead-detail-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ selected.code }}</p>
          <h2>{{ selected.projectName }}</h2>
        </div>
        <button
          @click="
            selected = null;
            showEdit = false;
          "
        >
          关闭详情
        </button>
      </header>
      <p>
        客户：{{ selected.customerName }}　成功概率：{{
          selected.successProbability
        }}%　状态：{{ leadStatusText(selected.status) }}
      </p>
      <p class="status-hint">{{ leadStatusHint(selected.status) }}</p>
      <div
        v-if="selected.status === 'PENDING_REGISTRATION'"
        class="approval-guide"
      >
        <h3>当前登记审批</h3>
        <p v-if="currentPendingApproval">
          审批单：{{
            approvalCodeText(currentPendingApproval.instanceCode, "LEAD")
          }}　当前环节：{{ currentPendingApproval.nodeOrder }}.
          {{ currentPendingApproval.positionName }}　审批人：{{
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
          配置路径：系统管理 → 组织与权限 → 审批岗位任职；审批路径：审批待办 →
          待我审批。
        </small>
      </div>
      <p>{{ selected.requirementSummary }}</p>
      <div class="approval-actions">
        <button
          v-if="['DRAFT', 'RETURNED'].includes(selected.status)"
          class="secondary"
          type="button"
          :disabled="saving"
          @click="startEditLead"
        >
          修改线索
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
          v-if="selected.status === 'PENDING_REGISTRATION'"
          class="secondary"
          type="button"
          :disabled="saving"
          @click="withdrawApproval(selected)"
        >
          撤回登记审批
        </button>
        <button
          v-if="selected.status === 'FOLLOWING'"
          class="secondary"
          type="button"
          :disabled="saving"
          @click="showFollowUp = !showFollowUp"
        >
          {{ showFollowUp ? "取消跟进" : "新增跟进" }}
        </button>
        <button
          v-if="selected.status === 'FOLLOWING'"
          class="secondary"
          type="button"
          :disabled="saving"
          @click="startConvertToProjectApplication"
        >
          {{ showConvertForm ? "取消转项目" : "转立项申请" }}
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
        <label
          >项目名称<input v-model="editForm.projectName" required minlength="2"
        /></label>
        <label
          >客户<select v-model="editForm.customerId" required>
            <option value="" disabled>请选择</option>
            <option
              v-for="customer in customers"
              :key="customer.id"
              :value="customer.id"
            >
              {{ customer.name }}
            </option>
          </select></label
        >
        <label
          >来源<select v-model="editForm.sourceCode">
            <option value="VISIT">客户拜访</option>
            <option value="REFERRAL">转介绍</option>
            <option value="PUBLIC">公开信息</option>
            <option value="OTHER">其他</option>
          </select></label
        >
        <label
          >发现日期<input v-model="editForm.discoveredOn" type="date" required
        /></label>
        <label
          >预计金额（万元）<input
            v-model.number="editForm.estimatedAmount"
            type="number"
            min="0"
            step="0.01"
        /></label>
        <label
          >预计启动<input v-model="editForm.estimatedStartOn" type="date"
        /></label>
        <label
          >项目类型<select v-model="editForm.projectType">
            <option value="CONSULTING">信息化咨询</option>
            <option value="SUPERVISION">信息化监理</option>
            <option value="OTHER">其他</option>
          </select></label
        >
        <label
          >成功概率（%）<input
            v-model.number="editForm.successProbability"
            type="number"
            min="0"
            max="100"
            required
        /></label>
        <label
          >下次跟进<input
            v-model="editForm.nextFollowUpAt"
            type="datetime-local"
        /></label>
        <label class="wide"
          >需求概述<textarea
            v-model="editForm.requirementSummary"
            required
            minlength="2"
          ></textarea>
        </label>
        <button type="submit" :disabled="saving">保存修改</button>
        <button type="button" @click="showEdit = false">取消</button>
      </form>
      <button
        v-if="['DRAFT', 'RETURNED'].includes(selected.status)"
        :disabled="saving"
        @click="submitApproval(selected)"
      >
        提交登记审批
      </button>
      <form
        v-if="showConvertForm"
        class="entity-form"
        @submit.prevent="createProjectApplicationFromLead"
      >
        <h3 class="wide">转为立项申请</h3>
        <p class="wide status-hint">
          保存后请到“项目管理”提交立项审批；审批通过后，线索自动变为“已转项目”。
        </p>
        <label
          >预计收入（万元）<input
            v-model.number="convertForm.estimatedRevenue"
            type="number"
            min="0"
            step="0.01"
            required
        /></label>
        <label
          >预计成本（万元）<input
            v-model.number="convertForm.estimatedCost"
            type="number"
            min="0"
            step="0.01"
            required
        /></label>
        <label
          >预计开始<input
            v-model="convertForm.estimatedStartOn"
            type="date"
            required
        /></label>
        <label
          >预计结束<input
            v-model="convertForm.estimatedEndOn"
            type="date"
            required
        /></label>
        <label
          >投标方式<select v-model="convertForm.biddingMethod">
            <option value="PUBLIC">公开投标</option>
            <option value="NEGOTIATION">商务洽谈</option>
            <option value="NONE">无需投标</option>
          </select></label
        >
        <label class="wide"
          >服务范围<textarea
            v-model="convertForm.serviceScope"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide"
          >立项必要性<textarea
            v-model="convertForm.necessity"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide"
          >风险说明<textarea v-model="convertForm.riskDescription"></textarea>
        </label>
        <button type="submit" :disabled="saving">
          {{ saving ? "保存中…" : "生成立项申请" }}
        </button>
        <button type="button" @click="showConvertForm = false">取消</button>
      </form>
      <form
        v-if="showFollowUp"
        class="entity-form"
        @submit.prevent="addFollowUp"
      >
        <label
          >跟进时间<input
            v-model="followUpForm.followedUpAt"
            type="datetime-local"
            required
        /></label>
        <label
          >方式<select v-model="followUpForm.method">
            <option value="PHONE">电话</option>
            <option value="ONSITE">现场</option>
            <option value="VIDEO">视频</option>
            <option value="WECHAT">微信</option>
            <option value="EMAIL">邮件</option>
            <option value="OTHER">其他</option>
          </select></label
        >
        <label
          >成功概率（%）<input
            v-model.number="followUpForm.successProbability"
            type="number"
            min="0"
            max="100"
            required
        /></label>
        <label class="wide"
          >沟通内容<textarea
            v-model="followUpForm.communication"
            required
            minlength="2"
          ></textarea>
        </label>
        <label class="wide"
          >客户反馈<textarea v-model="followUpForm.customerFeedback"></textarea>
        </label>
        <label class="wide"
          >下一步行动<textarea
            v-model="followUpForm.nextAction"
            required
            minlength="2"
          ></textarea>
        </label>
        <label
          >下次跟进<input
            v-model="followUpForm.nextFollowUpAt"
            type="datetime-local" /></label
        ><button :disabled="saving">保存跟进</button>
      </form>
      <h3>跟进记录</h3>
      <article v-for="followUp in followUps" :key="followUp.id">
        <strong
          >{{ new Date(followUp.followedUpAt).toLocaleString() }} ·
          {{ followUpMethodText(followUp.method) }}</strong
        >
        <p>{{ followUp.communication }}</p>
        <small
          >成功概率 {{ followUp.successProbability }}% · 下一步：{{
            followUp.nextAction
          }}</small
        >
      </article>
      <p v-if="!followUps.length">暂无跟进记录</p>
    </section>
  </main>
</template>
