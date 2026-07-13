<script setup lang="ts">
import type { LeadSummary } from "@zkgl/shared";
import { computed, onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";

interface CustomerOption {
  id: string;
  name: string;
}
interface LeadDetail extends LeadSummary {
  customerName: string;
  sourceCode: string;
  discoveredOn: string;
  estimatedAmount: number | null;
  projectType: string;
  requirementSummary: string;
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

const auth = useAuthStore();
const items = ref<LeadSummary[]>([]);
const customers = ref<CustomerOption[]>([]);
const selected = ref<LeadDetail | null>(null);
const followUps = ref<FollowUp[]>([]);
const error = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const showFollowUp = ref(false);
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

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [leads, customerResult] = await Promise.all([
      callApi<{ items: LeadSummary[] }>("lead.list", {
        page: 1,
        pageSize: 100,
      }),
      callApi<{ items: CustomerOption[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 100,
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
    const result = await callApi<{ lead: LeadDetail; followUps: FollowUp[] }>(
      "lead.detail",
      { leadId: id },
    );
    selected.value = result.lead;
    followUps.value = result.followUps;
    followUpForm.value.successProbability = result.lead.successProbability;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "详情加载失败";
  }
}

async function createLead() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
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
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "LEAD",
      businessId: lead.id,
      title: `线索登记：${lead.projectName}`,
      amount: lead.estimatedAmount,
    });
    await load();
    await openDetail(lead.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  } finally {
    saving.value = false;
  }
}

async function addFollowUp() {
  if (!selected.value) return;
  saving.value = true;
  error.value = null;
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

async function closeLead(lead: LeadDetail) {
  const reason = window.prompt("请输入关闭原因")?.trim();
  if (!reason) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("lead.close", { leadId: lead.id, reason });
    selected.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "关闭失败";
  } finally {
    saving.value = false;
  }
}

onMounted(load);
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
        >预计金额<input
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
        >成功概率<input
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
        <small>{{ column.code }}</small>
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
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无线索</p>
    </section>
    <section v-if="selected" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ selected.code }}</p>
          <h2>{{ selected.projectName }}</h2>
        </div>
        <button @click="selected = null">关闭详情</button>
      </header>
      <p>
        客户：{{ selected.customerName }}　成功概率：{{
          selected.successProbability
        }}%　状态：{{ selected.status }}
      </p>
      <p>{{ selected.requirementSummary }}</p>
      <button
        v-if="['DRAFT', 'RETURNED'].includes(selected.status)"
        :disabled="saving"
        @click="submitApproval(selected)"
      >
        提交登记审批
      </button>
      <button
        v-if="selected.status === 'FOLLOWING'"
        @click="showFollowUp = !showFollowUp"
      >
        新增跟进
      </button>
      <button
        v-if="['DRAFT', 'RETURNED', 'FOLLOWING'].includes(selected.status)"
        :disabled="saving"
        @click="closeLead(selected)"
      >
        关闭线索
      </button>
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
          >成功概率<input
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
          {{ followUp.method }}</strong
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
