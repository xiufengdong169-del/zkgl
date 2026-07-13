<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
interface StatusMetric {
  status: string;
  count: number;
  amount?: number;
  averageProgress?: number;
}
interface ProfitRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  expectedProfit: number;
  operatingProfit: number;
  cashContribution: number;
}
interface Receivable {
  id: string;
  contractCode: string;
  contractName: string;
  projectName: string;
  dueOn: string | null;
  contractAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  overdue: number;
}
const leadStatus = ref<StatusMetric[]>([]),
  bidStatus = ref<StatusMetric[]>([]),
  projectStatus = ref<StatusMetric[]>([]),
  profits = ref<ProfitRow[]>([]),
  receivables = ref<Receivable[]>([]),
  collection = ref({ contractAmount: 0, receivedAmount: 0 }),
  disclaimer = ref("内部项目经营口径，不属于会计利润"),
  error = ref<string | null>(null);
async function load() {
  try {
    const [a, r] = await Promise.all([
      callApi<{
        leadStatus: StatusMetric[];
        bidStatus: StatusMetric[];
        projectStatus: StatusMetric[];
        profits: ProfitRow[];
        collection: { contractAmount: number; receivedAmount: number };
        disclaimer: string;
      }>("report.analytics", {}),
      callApi<{ items: Receivable[] }>("report.receivables", {
        page: 1,
        pageSize: 50,
      }),
    ]);
    leadStatus.value = a.leadStatus;
    bidStatus.value = a.bidStatus;
    projectStatus.value = a.projectStatus;
    profits.value = a.profits;
    collection.value = a.collection;
    disclaimer.value = a.disclaimer;
    receivables.value = r.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "报表加载失败";
  }
}
onMounted(load);
</script>
<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">BUSINESS INTELLIGENCE</p>
        <h1>统计报表</h1>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="contract-panels">
      <article>
        <p>有效收入合同</p>
        <strong>¥ {{ collection.contractAmount }}</strong>
      </article>
      <article>
        <p>累计收款</p>
        <strong>¥ {{ collection.receivedAmount }}</strong>
      </article>
      <article>
        <p>未收余额</p>
        <strong
          >¥
          {{
            Number(collection.contractAmount) -
            Number(collection.receivedAmount)
          }}</strong
        >
      </article>
    </section>
    <p class="accounting-disclaimer">{{ disclaimer }}</p>
    <section class="module-grid">
      <article class="module-card">
        <h2>市场线索</h2>
        <p v-for="item in leadStatus" :key="item.status">
          {{ item.status }}：{{ item.count }} 条 · ¥ {{ item.amount || 0 }}
        </p>
      </article>
      <article class="module-card">
        <h2>投标情况</h2>
        <p v-for="item in bidStatus" :key="item.status">
          {{ item.status }}：{{ item.count }} 项
        </p>
      </article>
      <article class="module-card">
        <h2>项目进度</h2>
        <p v-for="item in projectStatus" :key="item.status">
          {{ item.status }}：{{ item.count }} 项 · 平均
          {{ Number(item.averageProgress || 0).toFixed(1) }}%
        </p>
      </article>
    </section>
    <section class="data-panel">
      <h2>应收与逾期</h2>
      <table v-if="receivables.length">
        <thead>
          <tr>
            <th>合同</th>
            <th>项目</th>
            <th>到期日</th>
            <th>合同金额</th>
            <th>已收</th>
            <th>未收</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in receivables" :key="item.id">
            <td>{{ item.contractCode }} · {{ item.contractName }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.dueOn || "未设置" }}</td>
            <td>¥ {{ item.contractAmount }}</td>
            <td>¥ {{ item.receivedAmount }}</td>
            <td>¥ {{ item.outstandingAmount }}</td>
            <td>{{ item.overdue ? "已逾期" : "未到期" }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无未收款合同</p>
    </section>
    <section class="data-panel">
      <h2>项目利润与现金贡献</h2>
      <table v-if="profits.length">
        <thead>
          <tr>
            <th>项目</th>
            <th>预计利润</th>
            <th>合同经营利润</th>
            <th>现金贡献</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in profits" :key="item.projectId">
            <td>{{ item.projectCode }} · {{ item.projectName }}</td>
            <td>¥ {{ item.expectedProfit }}</td>
            <td>¥ {{ item.operatingProfit }}</td>
            <td>¥ {{ item.cashContribution }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>
