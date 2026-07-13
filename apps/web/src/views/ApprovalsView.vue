<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";

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
const loading = ref(false);
const processing = ref<string | null>(null);

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
  try {
    await callApi("approval.task.action", {
      taskId: item.id,
      action,
      actionKey: crypto.randomUUID(),
      comment,
    });
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
  try {
    await callApi("approval.instance.withdraw", {
      instanceId: item.instanceId,
      actionKey: crypto.randomUUID(),
      comment,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "撤回失败";
  } finally {
    processing.value = null;
  }
}

onMounted(() => load());
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
    <p v-if="loading">正在加载…</p>
    <section v-else-if="items.length" class="approval-list">
      <article v-for="item in items" :key="item.id">
        <div>
          <small
            >{{ item.instanceCode }} ·
            {{ item.positionCode || item.status }}</small
          >
          <h2>{{ item.title }}</h2>
          <p>
            {{ item.businessType }} ·
            {{ new Date(item.occurredAt).toLocaleString() }} ·
            {{ item.taskStatus || item.status }}
          </p>
        </div>
        <div v-if="activeMode === 'PENDING'" class="approval-actions">
          <button
            :disabled="processing === item.id"
            @click="act(item, 'APPROVE')"
          >
            同意</button
          ><button
            class="secondary"
            :disabled="processing === item.id"
            @click="act(item, 'RETURN')"
          >
            退回</button
          ><button
            class="danger"
            :disabled="processing === item.id"
            @click="act(item, 'REJECT')"
          >
            驳回
          </button>
        </div>
        <div
          v-else-if="activeMode === 'INITIATED' && item.status === 'PENDING'"
          class="approval-actions"
        >
          <button
            class="secondary"
            :disabled="processing === item.id"
            @click="withdraw(item)"
          >
            撤回
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
