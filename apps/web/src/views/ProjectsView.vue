<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { callApi } from "../api";
import { approvalCodeText, businessTypeText } from "../approval-display";
import { canSubmitApprovalStatus } from "../approval-status";
import { useAuthStore } from "../stores/auth";

interface ProjectRow {
  id: string;
  code: string;
  projectName: string;
  status: string;
  managerName?: string;
}

interface ApplicationRow {
  id: string;
  code: string;
  projectName: string;
  estimatedRevenue: string | number;
  estimatedCost: string | number;
  estimatedProfit?: string | number | null;
  status: string;
  version: number;
  createdBy: string;
}

interface ApplicationDetail {
  id: string;
  code: string;
  projectName: string;
  customerId: string;
  sourceLeadId: string | null;
  sourceLeadCode?: string | null;
  sourceLeadName?: string | null;
  projectType: string;
  background: string | null;
  serviceScope: string;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedStartOn: string;
  estimatedEndOn: string;
  proposedManagerId: string;
  biddingMethod: string | null;
  riskDescription: string | null;
  necessity: string;
  status: string;
  version: number;
}

interface ApprovalProgressRow {
  instanceId: string;
  instanceCode: string;
  instanceStatus: string;
  currentNodeOrder: number | null;
  nodeOrder: number;
  taskStatus: string;
  positionCode: string;
  positionName: string;
  approverName: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
}

interface Customer {
  id: string;
  name: string;
}

interface ProjectDetail {
  project: Record<string, string>;
  members: Array<Record<string, string>>;
  contracts: Array<Record<string, string>>;
  stages: Array<Record<string, string | number>>;
  risks: Array<Record<string, string>>;
  timeline: Array<{
    eventType: string;
    title: string;
    eventAt: string;
    status: string;
  }>;
  approvalRecords: Array<{
    id: string;
    instanceCode: string;
    businessType: string;
    title: string;
    status: string;
    submittedAt: string;
    completedAt: string | null;
    applicantName: string | null;
  }>;
  auditLogs: Array<{
    id: string;
    requestId: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    outcome: string;
    occurredAt: string;
    username: string | null;
  }>;
  money: Record<string, string>;
  financialVisible: boolean;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projects = ref<ProjectRow[]>([]);
const applications = ref<ApplicationRow[]>([]);
const customers = ref<Customer[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const editingApplicationId = ref<string | null>(null);
const editingApplicationVersion = ref(0);
const editingApplicationSourceLeadId = ref<string | null>(null);
const detail = ref<ProjectDetail | null>(null);
const selectedApplication = ref<ApplicationDetail | null>(null);
const selectedApplicationApprovalProgress = ref<ApprovalProgressRow[]>([]);
const listPageSize = 6;
const projectPage = ref(1);
const applicationPage = ref(1);

const pendingApplicationCount = computed(
  () =>
    applications.value.filter((x) => x.status === "APPROVAL_PENDING").length,
);
const draftApplicationCount = computed(
  () => applications.value.filter((x) => x.status === "DRAFT").length,
);
const activeProjectCount = computed(
  () =>
    projects.value.filter((x) =>
      [
        "PREPARING",
        "PENDING_START",
        "IN_PROGRESS",
        "PENDING_ACCEPTANCE",
      ].includes(x.status),
    ).length,
);
const attentionProjectCount = computed(
  () =>
    projects.value.filter((x) =>
      ["SUSPENDED", "PENDING_CLOSE", "TERMINATED"].includes(x.status),
    ).length,
);
const visibleApplications = computed(() =>
  applications.value.filter((x) => x.status !== "APPROVED"),
);
const projectPageCount = computed(() =>
  Math.max(1, Math.ceil(projects.value.length / listPageSize)),
);
const applicationPageCount = computed(() =>
  Math.max(1, Math.ceil(visibleApplications.value.length / listPageSize)),
);
const pagedProjects = computed(() =>
  projects.value.slice(
    (projectPage.value - 1) * listPageSize,
    projectPage.value * listPageSize,
  ),
);
const pagedApplications = computed(() =>
  visibleApplications.value.slice(
    (applicationPage.value - 1) * listPageSize,
    applicationPage.value * listPageSize,
  ),
);

const today = new Date().toISOString().slice(0, 10);
const later = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

const form = ref({
  projectName: "",
  customerId: "",
  projectType: "CONSULTING",
  background: "",
  serviceScope: "",
  estimatedRevenue: 0,
  estimatedCost: 0,
  estimatedStartOn: today,
  estimatedEndOn: later,
  biddingMethod: "PUBLIC",
  riskDescription: "",
  necessity: "",
});

const workflow = [
  {
    number: "01",
    title: "生成立项申请",
    detail: "可从线索生成，也可在项目管理中手工发起。",
  },
  {
    number: "02",
    title: "提交立项审批",
    detail: "草稿状态可修改；提交后进入审批与待办。",
  },
  {
    number: "03",
    title: "审批通过转正式项目",
    detail: "审批通过后自动生成正式项目，关联线索变为已转项目。",
  },
];

function statusText(value?: string | null) {
  const labels: Record<string, string> = {
    ESTABLISHED: "已立项",
    DRAFT: "草稿",
    APPROVAL_PENDING: "审批中",
    RETURNED: "已退回",
    REJECTED: "已驳回",
    WITHDRAWN: "已撤回",
    APPROVED: "已通过",
    PREPARING: "准备中",
    PENDING_START: "待启动",
    IN_PROGRESS: "实施中",
    PENDING_ACCEPTANCE: "待验收",
    SUSPENDED: "已暂停",
    PENDING_CLOSE: "待结项",
    CLOSED: "已结项",
    TERMINATED: "已终止",
    CANCELLED: "已取消",
  };
  return (value && labels[value]) || value || "-";
}

function approvalTaskStatusText(value?: string | null) {
  const labels: Record<string, string> = {
    WAITING: "未到此环节",
    PENDING: "待审批",
    APPROVED: "已同意",
    RETURNED: "已退回",
    REJECTED: "已驳回",
    CANCELLED: "已取消",
    CANCELED: "已取消",
    SKIPPED: "已跳过",
  };
  return (value && labels[value]) || value || "-";
}

function applicationApprovalSummary() {
  if (!selectedApplicationApprovalProgress.value.length) return "";
  const current = selectedApplicationApprovalProgress.value.find(
    (task) => task.taskStatus === "PENDING",
  );
  if (current) {
    return `当前待审批：第 ${current.nodeOrder} 关 · ${current.positionName}${current.approverName ? `（${current.approverName}）` : ""}`;
  }
  const last = selectedApplicationApprovalProgress.value.at(-1);
  return last ? `当前审批状态：${approvalTaskStatusText(last.taskStatus)}` : "";
}

function projectTypeText(value?: string | null) {
  const labels: Record<string, string> = {
    CONSULTING: "信息化咨询",
    SUPERVISION: "信息化监理",
    OTHER: "其他",
  };
  return (value && labels[value]) || value || "-";
}

function biddingMethodText(value?: string | null) {
  const labels: Record<string, string> = {
    PUBLIC: "公开投标",
    NEGOTIATION: "商务洽谈",
    NONE: "无需投标",
  };
  return (value && labels[value]) || value || "-";
}

function moneyText(value?: string | number | null) {
  const numberValue = Number(value ?? 0);
  return `${Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0.00"} 万元`;
}

function dateText(value?: string | null) {
  if (!value) return "未填写";
  return value.slice(0, 10);
}

function applicationProfit(item: ApplicationRow) {
  if (item.estimatedProfit != null) return moneyText(item.estimatedProfit);
  return moneyText(Number(item.estimatedRevenue) - Number(item.estimatedCost));
}

function resetForm() {
  form.value = {
    projectName: "",
    customerId: "",
    projectType: "CONSULTING",
    background: "",
    serviceScope: "",
    estimatedRevenue: 0,
    estimatedCost: 0,
    estimatedStartOn: today,
    estimatedEndOn: later,
    biddingMethod: "PUBLIC",
    riskDescription: "",
    necessity: "",
  };
  editingApplicationId.value = null;
  editingApplicationVersion.value = 0;
  editingApplicationSourceLeadId.value = null;
}

async function load() {
  error.value = null;
  try {
    const [p, a, c] = await Promise.all([
      callApi<{ items: ProjectRow[] }>("project.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: ApplicationRow[] }>("project.application.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: Customer[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
    ]);
    projects.value = p.items;
    applications.value = a.items;
    customers.value = c.items;
    projectPage.value = Math.min(projectPage.value, projectPageCount.value);
    applicationPage.value = Math.min(
      applicationPage.value,
      applicationPageCount.value,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}

function toggleApplicationForm() {
  if (showForm.value) resetForm();
  showForm.value = !showForm.value;
  notice.value = null;
}

async function createApplication() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const data = {
      ...form.value,
      background: form.value.background || null,
      sourceLeadId: editingApplicationId.value
        ? editingApplicationSourceLeadId.value
        : null,
      proposedManagerId: auth.user.employeeId,
      memberSuggestions: [],
      riskDescription: form.value.riskDescription || null,
    };
    if (editingApplicationId.value) {
      await callApi("project.application.update", {
        applicationId: editingApplicationId.value,
        version: editingApplicationVersion.value,
        data,
      });
      notice.value = "立项申请已保存。";
    } else {
      await callApi("project.application.create", data);
      notice.value = "立项申请已生成。下一步可在列表中提交立项审批。";
    }
    resetForm();
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function editApplication(item: ApplicationRow) {
  error.value = null;
  notice.value = null;
  try {
    const result = await callApi<{ application: ApplicationDetail }>(
      "project.application.detail",
      { applicationId: item.id },
    );
    const application = result.application;
    form.value = {
      projectName: application.projectName,
      customerId: application.customerId,
      projectType: application.projectType,
      background: application.background ?? "",
      serviceScope: application.serviceScope,
      estimatedRevenue: Number(application.estimatedRevenue),
      estimatedCost: Number(application.estimatedCost),
      estimatedStartOn: toDateInput(application.estimatedStartOn),
      estimatedEndOn: toDateInput(application.estimatedEndOn),
      biddingMethod: application.biddingMethod ?? "NONE",
      riskDescription: application.riskDescription ?? "",
      necessity: application.necessity,
    };
    editingApplicationId.value = application.id;
    editingApplicationVersion.value = application.version;
    editingApplicationSourceLeadId.value = application.sourceLeadId ?? null;
    showForm.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载立项申请失败";
  }
}

async function viewApplication(applicationId: string) {
  error.value = null;
  notice.value = null;
  try {
    const result = await callApi<{ application: ApplicationDetail }>(
      "project.application.detail",
      { applicationId },
    );
    selectedApplication.value = result.application;
    selectedApplicationApprovalProgress.value =
      (result as {
        approvalProgress?: ApprovalProgressRow[];
      }).approvalProgress || [];
    detail.value = null;
    showForm.value = false;
    editingApplicationId.value = null;
    editingApplicationSourceLeadId.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载立项申请详情失败";
  }
}

async function loadDetail(projectId: string) {
  error.value = null;
  selectedApplication.value = null;
  selectedApplicationApprovalProgress.value = [];
  try {
    detail.value = await callApi<ProjectDetail>("project.detail", {
      projectId,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载详情失败";
  }
}

async function submitApplication(item: ApplicationRow) {
  error.value = null;
  notice.value = null;
  saving.value = true;
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_APPLICATION",
      businessId: item.id,
      title: `项目立项：${item.projectName}`,
      amount: Number(item.estimatedRevenue),
    });
    notice.value =
      "立项审批已提交。下一步：审批人与待办 → 待我审批；审批通过后自动生成正式项目。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  } finally {
    saving.value = false;
  }
}

function routeApplicationId() {
  const value = route.query.applicationId;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function routeProjectId() {
  const value = route.query.projectId;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function routeReturnProjectId() {
  const value = route.query.returnProjectId;
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

async function closeSelectedApplication() {
  if (fromApprovalInbox()) {
    await router.push({
      path: "/approvals",
      query: { mode: routeReturnMode() },
    });
    return;
  }
  const returnProjectId = routeReturnProjectId();
  if (returnProjectId) {
    await router.push({
      path: "/projects",
      query: { projectId: returnProjectId },
    });
    return;
  }
  selectedApplication.value = null;
  selectedApplicationApprovalProgress.value = [];
}

async function loadPage() {
  await load();
  const applicationId = routeApplicationId();
  const projectId = routeProjectId();
  if (applicationId) {
    await viewApplication(applicationId);
    return;
  }
  if (projectId) await loadDetail(projectId);
}

onMounted(loadPage);

watch(
  () => [route.query.applicationId, route.query.projectId],
  async () => {
    const applicationId = routeApplicationId();
    const projectId = routeProjectId();
    if (applicationId) {
      await viewApplication(applicationId);
      return;
    }
    if (projectId) await loadDetail(projectId);
  },
);
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">PROJECT PORTFOLIO</p>
        <h1>项目管理</h1>
      </div>
      <button
        v-if="!selectedApplication && !showForm"
        class="primary-action"
        @click="toggleApplicationForm"
      >
        发起立项申请
      </button>
    </header>

    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <form
      v-if="showForm"
      class="entity-form"
      @submit.prevent="createApplication"
    >
      <h2 class="wide">
        {{ editingApplicationId ? "修改立项申请" : "新增立项申请" }}
      </h2>
      <label>
        项目名称
        <input v-model="form.projectName" required minlength="2" />
      </label>
      <label>
        客户
        <select v-model="form.customerId" required>
          <option value="" disabled>请选择</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </label>
      <label>
        项目类型
        <select v-model="form.projectType">
          <option value="CONSULTING">信息化咨询</option>
          <option value="SUPERVISION">信息化监理</option>
          <option value="OTHER">其他</option>
        </select>
      </label>
      <label>
        预计收入（万元）
        <input
          v-model.number="form.estimatedRevenue"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </label>
      <label>
        预计成本（万元）
        <input
          v-model.number="form.estimatedCost"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </label>
      <label>
        预计利润（万元）
        <input
          :value="(form.estimatedRevenue - form.estimatedCost).toFixed(2)"
          readonly
        />
      </label>
      <label>
        预计开始
        <input v-model="form.estimatedStartOn" type="date" required />
      </label>
      <label>
        预计结束
        <input v-model="form.estimatedEndOn" type="date" required />
      </label>
      <label>
        投标方式
        <select v-model="form.biddingMethod">
          <option value="PUBLIC">公开投标</option>
          <option value="NEGOTIATION">商务洽谈</option>
          <option value="NONE">无需投标</option>
        </select>
      </label>
      <label class="wide">
        服务范围
        <textarea v-model="form.serviceScope" required minlength="2"></textarea>
      </label>
      <label class="wide">
        立项必要性
        <textarea v-model="form.necessity" required minlength="2"></textarea>
      </label>
      <label class="wide">
        项目背景
        <textarea v-model="form.background"></textarea>
      </label>
      <label class="wide">
        风险说明
        <textarea v-model="form.riskDescription"></textarea>
      </label>
      <button type="submit" :disabled="saving">
        {{
          saving
            ? "保存中..."
            : editingApplicationId
              ? "保存修改（编号不变）"
              : "保存立项申请"
        }}
      </button>
      <button type="button" @click="toggleApplicationForm">取消</button>
    </form>

    <section v-if="!selectedApplication" class="project-summary">
      <div>
        <strong>{{ draftApplicationCount }}</strong>
        <span>草稿立项申请</span>
      </div>
      <div>
        <strong>{{ pendingApplicationCount }}</strong>
        <span>审批中的立项</span>
      </div>
      <div>
        <strong>{{ activeProjectCount }}</strong>
        <span>实施中的项目</span>
      </div>
      <div>
        <strong>{{ attentionProjectCount }}</strong>
        <span>待处理项目</span>
      </div>
    </section>

    <section v-if="!selectedApplication" class="workflow-card">
      <p class="eyebrow">立项流程</p>
      <div class="workflow-steps">
        <article v-for="step in workflow" :key="step.number">
          <span>{{ step.number }}</span>
          <h2>{{ step.title }}</h2>
          <p>{{ step.detail }}</p>
        </article>
      </div>
    </section>

    <section v-if="selectedApplication" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">立项申请详情</p>
          <h2>项目名称：{{ selectedApplication.projectName }}</h2>
        </div>
        <button
          class="secondary-button"
          type="button"
          @click="closeSelectedApplication"
        >
          {{ fromApprovalInbox() ? "返回审批与待办" : "返回项目管理" }}
        </button>
      </header>
      <p>
        申请编号：{{ selectedApplication.code }}　状态：{{
          statusText(selectedApplication.status)
        }}　项目类型：{{ projectTypeText(selectedApplication.projectType) }}
      </p>
      <section v-if="selectedApplication.sourceLeadId" class="trace-card">
        <div>
          <p class="eyebrow">来源线索</p>
          <h3>
            {{ selectedApplication.sourceLeadCode || selectedApplication.sourceLeadId }}
            <template v-if="selectedApplication.sourceLeadName">
              · {{ selectedApplication.sourceLeadName }}
            </template>
          </h3>
          <p class="muted">
            立项项目名称可以修改，但这里固定保留来源线索，便于后续追溯。
          </p>
        </div>
        <RouterLink
          class="secondary-button"
          :to="{ path: '/leads', query: { leadId: selectedApplication.sourceLeadId } }"
        >
          查看来源线索
        </RouterLink>
      </section>
      <section
        v-if="selectedApplicationApprovalProgress.length"
        class="approval-guide"
      >
        <h3>审批进度</h3>
        <p class="status-hint">{{ applicationApprovalSummary() }}</p>
        <div class="approval-progress-list">
          <article
            v-for="task in selectedApplicationApprovalProgress"
            :key="`${task.instanceId}-${task.nodeOrder}-${task.positionCode}`"
            class="approval-progress-item"
          >
            <strong>
              第 {{ task.nodeOrder }} 关：{{ task.positionName }}
            </strong>
            <span>{{ approvalTaskStatusText(task.taskStatus) }}</span>
            <small>
              审批人：{{ task.approverName || "未配置" }}
              <template v-if="task.completedAt">
                · 处理人：{{ task.completedByName || task.approverName || "-" }}
                · {{ new Date(task.completedAt).toLocaleString() }}
              </template>
            </small>
          </article>
        </div>
      </section>
      <section class="contract-panels">
        <article>
          <p>预计收入</p>
          <strong>{{ moneyText(selectedApplication.estimatedRevenue) }}</strong>
        </article>
        <article>
          <p>预计成本</p>
          <strong>{{ moneyText(selectedApplication.estimatedCost) }}</strong>
        </article>
        <article>
          <p>预计利润</p>
          <strong>
            {{
              moneyText(
                Number(selectedApplication.estimatedRevenue) -
                  Number(selectedApplication.estimatedCost),
              )
            }}
          </strong>
        </article>
      </section>
      <div class="module-grid">
        <article class="module-card">
          <h3>基本信息</h3>
          <p>预计开始：{{ selectedApplication.estimatedStartOn }}</p>
          <p>预计结束：{{ selectedApplication.estimatedEndOn }}</p>
          <p>
            投标方式：{{ biddingMethodText(selectedApplication.biddingMethod) }}
          </p>
        </article>
        <article class="module-card">
          <h3>服务范围</h3>
          <p>{{ selectedApplication.serviceScope || "暂无" }}</p>
        </article>
        <article class="module-card">
          <h3>立项必要性</h3>
          <p>{{ selectedApplication.necessity || "暂无" }}</p>
        </article>
      </div>
      <p v-if="selectedApplication.background">
        项目背景：{{ selectedApplication.background }}
      </p>
      <p v-if="selectedApplication.riskDescription">
        风险说明：{{ selectedApplication.riskDescription }}
      </p>
    </section>

    <section v-if="!selectedApplication" class="data-panel">
      <div class="section-title">
        <h2>正式项目</h2>
        <span class="muted">共 {{ projects.length }} 个</span>
      </div>
      <div v-if="projects.length" class="project-card-list">
        <article
          v-for="item in pagedProjects"
          :key="item.id"
          class="project-card-row"
          @click="loadDetail(item.id)"
        >
          <div>
            <p class="eyebrow">{{ item.code }}</p>
            <h3>项目名称：{{ item.projectName }}</h3>
            <p>
              状态：{{ statusText(item.status) }}
              <template v-if="item.managerName">
                · 负责人：{{ item.managerName }}
              </template>
            </p>
          </div>
          <button class="secondary-button" type="button">查看详情</button>
        </article>
      </div>
      <p v-else>暂无正式项目</p>
      <div v-if="projectPageCount > 1" class="pager">
        <button
          type="button"
          :disabled="projectPage <= 1"
          @click="projectPage -= 1"
        >
          上一页
        </button>
        <span>第 {{ projectPage }} / {{ projectPageCount }} 页</span>
        <button
          type="button"
          :disabled="projectPage >= projectPageCount"
          @click="projectPage += 1"
        >
          下一页
        </button>
      </div>
    </section>

    <section v-if="detail && !selectedApplication" class="data-panel project-detail-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">项目详情</p>
          <h2>项目名称：{{ detail.project.projectName }}</h2>
        </div>
        <button class="secondary-button" @click="detail = null">关闭</button>
      </header>
      <p>
        {{ detail.project.code }} · {{ detail.project.customerName }} ·
        {{ detail.project.managerName }} ·
        {{ statusText(detail.project.status) }}
      </p>
      <section
        v-if="detail.project.applicationCode || detail.project.sourceLeadId"
        class="trace-card"
      >
        <div>
          <p class="eyebrow">立项来源</p>
          <h3 v-if="detail.project.applicationCode">
            立项申请：
            <RouterLink
              v-if="detail.project.applicationId"
              class="text-link"
              :to="{
                path: '/projects',
                query: {
                  applicationId: detail.project.applicationId,
                  returnProjectId: detail.project.id,
                },
              }"
            >
              {{ detail.project.applicationCode }}
            </RouterLink>
            <template v-else>{{ detail.project.applicationCode }}</template>
          </h3>
          <p v-if="detail.project.sourceLeadId">
            来源线索：
            <RouterLink
              class="text-link"
              :to="{ path: '/leads', query: { leadId: detail.project.sourceLeadId } }"
            >
              {{ detail.project.sourceLeadCode || detail.project.sourceLeadId }}
            </RouterLink>
            <template v-if="detail.project.sourceLeadName">
              · {{ detail.project.sourceLeadName }}
            </template>
          </p>
        </div>
        <div class="trace-actions">
          <RouterLink
            v-if="detail.project.applicationId"
            class="secondary-button"
            :to="{
              path: '/projects',
              query: {
                applicationId: detail.project.applicationId,
                returnProjectId: detail.project.id,
              },
            }"
          >
            查看立项申请
          </RouterLink>
          <RouterLink
            v-if="detail.project.sourceLeadId"
            class="secondary-button"
            :to="{ path: '/leads', query: { leadId: detail.project.sourceLeadId } }"
          >
            查看来源线索
          </RouterLink>
        </div>
      </section>
      <section v-if="detail.project.applicationCode" class="application-full-card">
        <div class="section-title">
          <h3>立项申请填写信息</h3>
          <span class="muted">
            {{ detail.project.applicationCode }} ·
            {{ statusText(detail.project.applicationStatus) }}
          </span>
        </div>
        <div class="application-detail-grid">
          <p>
            <span>立项项目名称</span>
            <strong>{{
              detail.project.applicationProjectName || detail.project.projectName
            }}</strong>
          </p>
          <p>
            <span>项目类型</span>
            <strong>{{
              projectTypeText(detail.project.applicationProjectType || detail.project.projectType)
            }}</strong>
          </p>
          <p>
            <span>预计开始</span>
            <strong>{{ dateText(detail.project.applicationEstimatedStartOn) }}</strong>
          </p>
          <p>
            <span>预计结束</span>
            <strong>{{ dateText(detail.project.applicationEstimatedEndOn) }}</strong>
          </p>
          <p>
            <span>投标方式</span>
            <strong>{{
              biddingMethodText(detail.project.applicationBiddingMethod)
            }}</strong>
          </p>
          <p v-if="detail.financialVisible">
            <span>预计成本</span>
            <strong>{{ moneyText(detail.project.applicationEstimatedCost) }}</strong>
          </p>
        </div>
        <div class="application-text-grid">
          <article>
            <h4>服务范围</h4>
            <p>{{ detail.project.applicationServiceScope || "暂无" }}</p>
          </article>
          <article>
            <h4>立项必要性</h4>
            <p>{{ detail.project.applicationNecessity || "暂无" }}</p>
          </article>
          <article>
            <h4>项目背景</h4>
            <p>{{ detail.project.applicationBackground || "暂无" }}</p>
          </article>
          <article>
            <h4>风险说明</h4>
            <p>{{ detail.project.applicationRiskDescription || "暂无" }}</p>
          </article>
        </div>
      </section>
      <p>
        <RouterLink
          class="secondary-button"
          :to="{ name: 'files', query: { projectId: detail.project.id } }"
        >
          查看项目文件
        </RouterLink>
      </p>
      <section v-if="detail.financialVisible" class="contract-panels">
        <article>
          <p>预计收入</p>
          <strong>{{ moneyText(detail.project.estimatedRevenue) }}</strong>
        </article>
        <article>
          <p>已开票</p>
          <strong>{{ moneyText(detail.money.invoicedAmount) }}</strong>
        </article>
        <article>
          <p>已收款</p>
          <strong>{{ moneyText(detail.money.receivedAmount) }}</strong>
        </article>
        <article>
          <p>保证金占用</p>
          <strong>{{ moneyText(detail.money.occupiedDeposit) }}</strong>
        </article>
      </section>
      <div class="module-grid">
        <article class="module-card">
          <h3>项目成员</h3>
          <p v-for="m in detail.members" :key="m.name">
            {{ m.name }} · {{ m.projectRole }}
          </p>
          <p v-if="!detail.members.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>合同</h3>
          <p v-for="c in detail.contracts" :key="c.code">
            {{ c.contractName }} · {{ statusText(c.status) }}
          </p>
          <p v-if="!detail.contracts.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>阶段进度</h3>
          <p v-for="s in detail.stages" :key="String(s.stageName)">
            {{ s.stageName }} · {{ s.completionPercentage }}%
          </p>
          <p v-if="!detail.stages.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>问题风险</h3>
          <p v-for="r in detail.risks" :key="r.title">
            {{ r.title }} · {{ r.severity }} · {{ statusText(r.status) }}
          </p>
          <p v-if="!detail.risks.length">暂无</p>
        </article>
      </div>
      <section class="data-list">
        <h3>项目全过程时间轴</h3>
        <article
          v-for="event in detail.timeline"
          :key="`${event.eventType}-${event.eventAt}-${event.title}`"
          class="data-row"
        >
          <div>
            <strong>{{ event.title }}</strong>
            <p>
              {{ businessTypeText(event.eventType) }} ·
              {{ statusText(event.status) }}
            </p>
          </div>
          <time>{{ new Date(event.eventAt).toLocaleString() }}</time>
        </article>
        <p v-if="!detail.timeline.length">暂无时间轴事件</p>
      </section>
      <section class="data-list">
        <h3>审批记录</h3>
        <article
          v-for="record in detail.approvalRecords"
          :key="record.id"
          class="data-row"
        >
          <div>
            <strong>{{ record.title }}</strong>
            <p>
              {{ approvalCodeText(record.instanceCode, record.businessType) }} ·
              {{ businessTypeText(record.businessType) }} ·
              {{ statusText(record.status) }}
            </p>
            <small>申请人：{{ record.applicantName || "未知" }}</small>
          </div>
          <time>{{ new Date(record.submittedAt).toLocaleString() }}</time>
        </article>
        <p v-if="!detail.approvalRecords.length">暂无审批记录</p>
      </section>
    </section>

    <section v-if="!selectedApplication" class="data-panel">
      <div class="section-title">
        <h2>立项申请</h2>
        <span class="muted">
          未完成 {{ visibleApplications.length }} 个，已通过的申请转入正式项目
        </span>
      </div>
      <p class="muted">
        这里只显示草稿、审批中、退回或拒绝的立项申请；已通过的申请不再重复显示。
      </p>
      <table v-if="visibleApplications.length">
        <thead>
          <tr>
            <th>申请编号</th>
            <th>项目名称</th>
            <th>预计收入</th>
            <th>预计成本</th>
            <th>预计利润</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pagedApplications" :key="item.id">
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ moneyText(item.estimatedRevenue) }}</td>
            <td>{{ moneyText(item.estimatedCost) }}</td>
            <td>{{ applicationProfit(item) }}</td>
            <td>{{ statusText(item.status) }}</td>
            <td>
              <div class="approval-actions">
                <button
                  class="secondary"
                  type="button"
                  @click="viewApplication(item.id)"
                >
                  查看详情
                </button>
                <button
                  v-if="
                    canSubmitApprovalStatus(item.status) &&
                    (item.createdBy === auth.user?.id ||
                      auth.user?.roleCodes.includes('ADMIN'))
                  "
                  class="secondary"
                  type="button"
                  @click="editApplication(item)"
                >
                  修改
                </button>
                <button
                  v-if="canSubmitApprovalStatus(item.status)"
                  type="button"
                  :disabled="saving"
                  @click="submitApplication(item)"
                >
                  提交审批
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无待处理立项申请</p>
      <div v-if="applicationPageCount > 1" class="pager">
        <button
          type="button"
          :disabled="applicationPage <= 1"
          @click="applicationPage -= 1"
        >
          上一页
        </button>
        <span>第 {{ applicationPage }} / {{ applicationPageCount }} 页</span>
        <button
          type="button"
          :disabled="applicationPage >= applicationPageCount"
          @click="applicationPage += 1"
        >
          下一页
        </button>
      </div>
    </section>
  </main>
</template>
