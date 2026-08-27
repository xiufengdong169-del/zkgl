<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { callApi, openTrustedDownloadUrl } from "../api";
import { approvalCodeText, businessTypeText } from "../approval-display";

interface Message {
  id: string;
  title: string;
  content: string;
  businessType: string;
  businessId: string;
  createdAt: string;
  readAt: string | null;
}

interface ExportTask {
  id: string;
  taskCode: string;
  exportType: string;
  estimatedRows: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | string;
  failureReason: string | null;
  fileId: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  isExpired: 0 | 1 | boolean;
  logicalName: string | null;
  sizeBytes: number | null;
}

interface ApprovalItem {
  id: string;
  instanceCode: string;
  title: string;
  businessType: string;
  occurredAt: string;
}

interface ProjectItem {
  id: string;
  code: string;
  projectName: string;
  status: string;
  projectManagerId: string;
  managerName?: string;
}

const summary = ref({
  expectedProfit: "0.00",
  contractOperatingProfit: "0.00",
  cashContribution: "0.00",
  projectCount: 0,
  disclaimer:
    "\u5185\u90e8\u9879\u76ee\u7ecf\u8425\u53e3\u5f84\uff0c\u4e0d\u5c5e\u4e8e\u4f1a\u8ba1\u5229\u6da6",
});
const messages = ref<Message[]>([]);
const exportTasks = ref<ExportTask[]>([]);
const pendingApprovals = ref<ApprovalItem[]>([]);
const myProjects = ref<ProjectItem[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const exporting = ref(false);

const exportFailureMessages: Record<string, string> = {
  EXPORT_PERMISSION_SNAPSHOT_INVALID: "导出权限快照已失效，请重新发起导出",
  EXPORT_TASK_PROCESS_FAILED: "导出处理失败，请稍后重试或联系管理员",
};

function exportFailureText(reason: string | null) {
  if (!reason) return "";
  return (
    exportFailureMessages[reason] ?? "导出处理失败，请稍后重试或联系管理员"
  );
}

async function loadDashboardAndMessages() {
  const [report, messageResult, approvalResult, projectResult] =
    await Promise.allSettled([
      callApi<typeof summary.value>("report.dashboard", {}),
      callApi<{ items: Message[] }>("message.list", { page: 1, pageSize: 20 }),
      callApi<{ items: ApprovalItem[] }>("approval.inbox.list", {
        mode: "PENDING",
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: ProjectItem[] }>("project.list", {
        page: 1,
        pageSize: 20,
      }),
    ]);
  if (report.status === "fulfilled") summary.value = report.value;
  if (messageResult.status === "fulfilled")
    messages.value = messageResult.value.items;
  if (approvalResult.status === "fulfilled")
    pendingApprovals.value = approvalResult.value.items.slice(0, 6);
  if (projectResult.status === "fulfilled")
    myProjects.value = projectResult.value.items.slice(0, 6);
  if (report.status === "rejected" && messageResult.status === "rejected") {
    error.value = "\u5de5\u4f5c\u53f0\u52a0\u8f7d\u5931\u8d25";
  }
}

async function loadExportTasks() {
  try {
    exportTasks.value = (
      await callApi<{ items: ExportTask[] }>("report.exportTasks", {
        page: 1,
        pageSize: 20,
      })
    ).items;
  } catch (e) {
    error.value =
      e instanceof Error
        ? e.message
        : "\u5bfc\u51fa\u4efb\u52a1\u52a0\u8f7d\u5931\u8d25";
  }
}

onMounted(async () => {
  await Promise.all([loadDashboardAndMessages(), loadExportTasks()]);
});

async function exportProjects() {
  exporting.value = true;
  error.value = null;
  notice.value = null;
  try {
    const data = await callApi<{
      mode: "BACKGROUND";
      taskCode: string;
      estimatedRows: number;
      message: string;
    }>("report.project.export", {});
    notice.value = data.message;
    await loadExportTasks();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "\u5bfc\u51fa\u5931\u8d25";
  } finally {
    exporting.value = false;
  }
}

async function downloadExportTask(task: ExportTask) {
  if (!task.fileId || task.isExpired) return;
  error.value = null;
  try {
    const result = await callApi<{ url: string }>("file.download", {
      fileId: task.fileId,
    });
    openTrustedDownloadUrl(result.url);
  } catch (e) {
    error.value =
      e instanceof Error
        ? e.message
        : "\u5bfc\u51fa\u6587\u4ef6\u4e0b\u8f7d\u5931\u8d25";
  }
}

async function markRead(message: Message) {
  try {
    await callApi("message.read", { messageId: message.id });
    message.readAt = new Date().toISOString();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "\u6d88\u606f\u64cd\u4f5c\u5931\u8d25";
  }
}
</script>

<template>
  <main class="shell">
    <header>
      <div>
        <p class="eyebrow">WORKSPACE</p>
        <h1>&#39033;&#30446;&#20840;&#36807;&#31243;&#31649;&#29702;</h1>
      </div>
      <button
        class="primary-action"
        :disabled="exporting"
        @click="exportProjects"
      >
        {{
          exporting
            ? "\u5bfc\u51fa\u4e2d\u2026"
            : "\u5bfc\u51fa\u9879\u76ee\u6570\u636e"
        }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="accounting-disclaimer">{{ notice }}</p>

    <section class="hero">
      <h2>&#32463;&#33829;&#24037;&#20316;&#21488;</h2>
      <p>
        &#24403;&#21069;&#25968;&#25454;&#33539;&#22260;&#20869;&#20849;
        {{ summary.projectCount }} &#20010;&#39033;&#30446;&#12290;
      </p>
    </section>

    <section class="metric-strip">
      <article>
        <span>&#39044;&#35745;&#21033;&#28070;</span
        ><strong>&yen; {{ summary.expectedProfit }}</strong>
      </article>
      <article>
        <span>&#21512;&#21516;&#32463;&#33829;&#21033;&#28070;</span
        ><strong>&yen; {{ summary.contractOperatingProfit }}</strong>
      </article>
      <article>
        <span>&#29616;&#37329;&#36129;&#29486;</span
        ><strong>&yen; {{ summary.cashContribution }}</strong>
      </article>
    </section>

    <p class="accounting-disclaimer">{{ summary.disclaimer }}</p>

    <section class="dashboard-grid">
      <article class="data-list">
        <div class="section-title">
          <h2>我的待办</h2>
          <RouterLink class="secondary-button" :to="{ name: 'approvals' }">
            查看全部
          </RouterLink>
        </div>
        <div v-if="pendingApprovals.length">
          <div
            v-for="item in pendingApprovals"
            :key="item.id"
            class="data-row compact"
          >
            <div>
              <strong>{{ item.title }}</strong>
              <p>
                {{ approvalCodeText(item.instanceCode, item.businessType) }} ·
                {{ businessTypeText(item.businessType) }} ·
                {{ item.occurredAt }}
              </p>
            </div>
          </div>
        </div>
        <p v-else>暂无待审批事项</p>
      </article>

      <article class="data-list">
        <div class="section-title">
          <h2>我的项目</h2>
          <RouterLink class="secondary-button" :to="{ name: 'projects' }">
            查看全部
          </RouterLink>
        </div>
        <div v-if="myProjects.length">
          <div
            v-for="project in myProjects"
            :key="project.id"
            class="data-row compact"
          >
            <div>
              <strong>{{ project.code }} · {{ project.projectName }}</strong>
              <p>
                {{ project.status }} · 负责人
                {{ project.managerName || project.projectManagerId }}
              </p>
            </div>
          </div>
        </div>
        <p v-else>暂无可查看项目</p>
      </article>
    </section>

    <section class="data-list" v-if="exportTasks.length">
      <h2>&#23548;&#20986;&#20219;&#21153;</h2>
      <article v-for="task in exportTasks" :key="task.id" class="data-row">
        <div>
          <strong>{{ task.taskCode }} &middot; {{ task.status }}</strong>
          <p>
            {{ task.estimatedRows }} &#34892; &middot;
            {{ task.completedAt || task.createdAt }}
            <span v-if="task.expiresAt">
              &middot; &#36807;&#26399;&#26102;&#38388;
              {{ task.expiresAt }}</span
            >
          </p>
          <p v-if="task.isExpired" class="error">
            &#23548;&#20986;&#25991;&#20214;&#24050;&#36807;&#26399;
          </p>
          <p v-if="task.failureReason" class="error">
            {{ exportFailureText(task.failureReason) }}
          </p>
        </div>
        <button
          class="secondary-button"
          :disabled="
            task.status !== 'COMPLETED' ||
            !task.fileId ||
            Boolean(task.isExpired)
          "
          @click="downloadExportTask(task)"
        >
          &#19979;&#36733;&#25991;&#20214;
        </button>
      </article>
    </section>

    <section class="data-list">
      <h2>&#28040;&#24687;&#19982;&#20020;&#26399;&#24322;&#24120;</h2>
      <article v-for="m in messages" :key="m.id" class="data-row">
        <div>
          <strong
            >{{ m.readAt ? "\u5df2\u8bfb" : "\u672a\u8bfb" }} &middot;
            {{ m.title }}</strong
          >
          <p>{{ m.content }}</p>
          <p v-if="m.businessType">
            来源 {{ m.businessType }} #{{ m.businessId }}
          </p>
        </div>
        <button v-if="!m.readAt" @click="markRead(m)">
          &#26631;&#35760;&#24050;&#35835;
        </button>
      </article>
      <p v-if="!messages.length">&#26242;&#26080;&#25552;&#37266;</p>
    </section>
  </main>
</template>
