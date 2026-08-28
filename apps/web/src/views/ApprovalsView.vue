<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { RouterLink, useRoute } from "vue-router";
import { callApi } from "../api";
import { approvalCodeText, businessTypeText } from "../approval-display";

type Mode = "PENDING" | "INITIATED" | "CC" | "PROCESSED";

interface ApprovalItem {
  id: string;
  instanceId: string;
  instanceCode: string;
  title: string;
  businessType: string;
  businessId: string;
  status: string;
  taskStatus: string | null;
  positionCode: string | null;
  occurredAt: string;
  canAct: number;
}

const filters: Array<{ label: string; mode: Mode }> = [
  { label: "待我审批", mode: "PENDING" },
  { label: "我发起的", mode: "INITIATED" },
  { label: "抄送我的", mode: "CC" },
  { label: "已处理", mode: "PROCESSED" },
];

const activeMode = ref<Mode>("PENDING");
const items = ref<ApprovalItem[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const loading = ref(false);
const processing = ref<string | null>(null);
const route = useRoute();

function approvalStatusText(value?: string | null) {
  const labels: Record<string, string> = {
    PENDING: "待审批",
    APPROVED: "已同意",
    RETURNED: "已退回",
    REJECTED: "已驳回",
    WITHDRAWN: "已撤回",
    COMPLETED: "已完成",
    SKIPPED: "已跳过",
    CANCELED: "已取消",
    CANCELLED: "已取消",
  };
  return (value && labels[value]) || value || "-";
}

function positionText(value?: string | null) {
  const labels: Record<string, string> = {
    OPERATIONS_MANAGER: "经营负责人",
    COMPANY_PRINCIPAL: "公司负责人",
    PROJECT_MANAGER: "项目经理",
    FINANCE_REVIEWER: "财务复核人",
    BID_MANAGER: "投标负责人",
  };
  return (value && labels[value]) || value || "-";
}

function detailRoute(item: ApprovalItem): RouteLocationRaw | null {
  const source = { returnTo: "approvals", returnMode: activeMode.value };
  if (item.businessType === "LEAD") {
    return { path: "/leads", query: { leadId: item.businessId, ...source } };
  }
  if (item.businessType === "PROJECT_APPLICATION") {
    return {
      path: "/projects",
      query: { applicationId: item.businessId, ...source },
    };
  }
  if (item.businessType === "BID_APPLICATION") return { path: "/bids" };
  if (item.businessType === "CONTRACT") return { path: "/contracts" };
  if (item.businessType.startsWith("PROJECT_")) return { path: "/delivery" };
  if (
    item.businessType.includes("INVOICE") ||
    item.businessType.includes("PAYMENT") ||
    item.businessType.includes("REIMBURSEMENT") ||
    item.businessType.includes("DEPOSIT") ||
    item.businessType.includes("DAILY_PURCHASE")
  ) {
    return { path: "/finance" };
  }
  return null;
}

function modeFromRoute(): Mode {
  const value = route.query.mode;
  const mode = Array.isArray(value) ? value[0] : value;
  return filters.some((filter) => filter.mode === mode) ? (mode as Mode) : "PENDING";
}

async function load(mode = activeMode.value) {
  activeMode.value = mode;
  loading.value = true;
  error.value = null;
  try {
    items.value = (
      await callApi<{ items: ApprovalItem[] }>("approval.inbox.list", {
        mode,
        page: 1,
        pageSize: 20,
      })
    ).items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function canDeleteApprovalRecord(item: ApprovalItem) {
  return activeMode.value === "INITIATED" && item.status !== "PENDING";
}

async function act(
  item: ApprovalItem,
  action: "APPROVE" | "RETURN" | "REJECT",
) {
  let comment: string | null = null;
  if (action !== "APPROVE") {
    comment =
      window
        .prompt(action === "RETURN" ? "请输入退回原因" : "请输入驳回原因")
        ?.trim() || null;
    if (!comment) return;
  }
  processing.value = item.id;
  error.value = null;
  notice.value = null;
  try {
    await callApi("approval.task.action", {
      taskId: item.id,
      action,
      actionKey: crypto.randomUUID(),
      comment,
    });
    notice.value =
      action === "APPROVE"
        ? "审批已同意。"
        : action === "RETURN"
          ? "审批已退回。"
          : "审批已驳回。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "审批操作失败";
  } finally {
    processing.value = null;
  }
}

async function withdraw(item: ApprovalItem) {
  const comment = window.prompt("请输入撤回原因")?.trim();
  if (!comment) return;
  processing.value = item.id;
  error.value = null;
  notice.value = null;
  try {
    await callApi("approval.instance.withdraw", {
      instanceId: item.instanceId,
      actionKey: crypto.randomUUID(),
      comment,
    });
    notice.value = "审批已撤回。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "撤回失败";
  } finally {
    processing.value = null;
  }
}

async function deleteApprovalRecord(item: ApprovalItem) {
  const title =
    item.title || approvalCodeText(item.instanceCode, item.businessType);
  if (!window.confirm(`确认删除这条记录？\n${title}`)) return;
  processing.value = item.id;
  error.value = null;
  notice.value = null;
  try {
    await callApi("approval.instance.delete", {
      instanceId: item.instanceId,
    });
    notice.value = "删除成功。";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "删除失败";
  } finally {
    processing.value = null;
  }
}

onMounted(() => load(modeFromRoute()));

watch(
  () => route.query.mode,
  () => {
    void load(modeFromRoute());
  },
);
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">APPROVAL INBOX</p>
        <h1>审批与待办</h1>
      </div>
      <span class="badge">顺序审批</span>
    </header>

    <nav class="filter-tabs" aria-label="审批筛选">
      <button
        v-for="filter in filters"
        :key="filter.mode"
        :class="{ active: activeMode === filter.mode }"
        @click="load(filter.mode)"
      >
        {{ filter.label }}
      </button>
    </nav>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="loading">正在加载...</p>

    <section v-else-if="items.length" class="approval-list">
      <article v-for="item in items" :key="item.id">
        <div>
          <small>
            {{ approvalCodeText(item.instanceCode, item.businessType) }} ·
            {{ positionText(item.positionCode) }}
          </small>
          <h2>{{ item.title }}</h2>
          <p>
            {{ businessTypeText(item.businessType) }} ·
            {{ new Date(item.occurredAt).toLocaleString() }} ·
            {{ approvalStatusText(item.taskStatus || item.status) }}
          </p>
        </div>
        <div class="approval-actions">
          <RouterLink
            v-if="detailRoute(item)"
            class="button-link secondary"
            :to="detailRoute(item)!"
          >
            查看详情
          </RouterLink>
          <button
            v-if="activeMode === 'PENDING'"
            :disabled="processing === item.id"
            @click="act(item, 'APPROVE')"
          >
            同意
          </button>
          <button
            v-if="activeMode === 'PENDING'"
            class="secondary"
            :disabled="processing === item.id"
            @click="act(item, 'RETURN')"
          >
            退回
          </button>
          <button
            v-if="activeMode === 'PENDING'"
            class="danger"
            :disabled="processing === item.id"
            @click="act(item, 'REJECT')"
          >
            驳回
          </button>
          <button
            v-if="activeMode === 'INITIATED' && item.status === 'PENDING'"
            class="secondary"
            :disabled="processing === item.id"
            @click="withdraw(item)"
          >
            撤回
          </button>
          <button
            v-if="canDeleteApprovalRecord(item)"
            class="danger"
            :disabled="processing === item.id"
            @click="deleteApprovalRecord(item)"
          >
            删除记录
          </button>
        </div>
      </article>
    </section>

    <section v-else-if="!loading" class="empty-state">
      <span>✓</span>
      <h2>当前分类没有审批事项</h2>
      <p>审批记录会根据你的发起、处理和抄送情况显示在对应分类。</p>
    </section>
  </main>
</template>
