<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";
interface BidRow {
  id: string;
  code: string;
  projectName: string;
  deadlineAt: string;
  status: string;
}
interface Option {
  id: string;
  projectName?: string;
  name?: string;
}
const auth = useAuthStore(),
  items = ref<BidRow[]>([]),
  projects = ref<Option[]>([]),
  customers = ref<Option[]>([]),
  error = ref<string | null>(null),
  showForm = ref(false),
  showResult = ref(false),
  saving = ref(false);
const form = ref({
  projectId: "",
  tendererId: "",
  tenderNumber: "",
  projectBudget: null as number | null,
  bidCeiling: null as number | null,
  deadlineAt: "",
  openingAt: "",
  bidLocation: "",
  bidMethod: "ONLINE",
  depositAmount: 0,
  documentFee: 0,
  applicationReason: "",
});
const resultForm = ref({
  bidId: "",
  openedOn: new Date().toISOString().slice(0, 10),
  quotedAmount: 0,
  ranking: null as number | null,
  result: "WON",
  winningAmount: null as number | null,
  noticeOn: "",
  lossReason: "",
  competitors: "",
  retrospective: "",
});
async function load() {
  try {
    const [b, p, c] = await Promise.all([
      callApi<{ items: BidRow[] }>("bid.application.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: Option[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
    ]);
    items.value = b.items;
    projects.value = p.items;
    customers.value = c.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
onMounted(load);
async function createBid() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("bid.application.create", {
      ...form.value,
      agencyId: null,
      tenderNumber: form.value.tenderNumber || null,
      registrationAt: null,
      documentPurchaseAt: null,
      clarificationAt: null,
      deadlineAt: new Date(form.value.deadlineAt).toISOString(),
      openingAt: form.value.openingAt
        ? new Date(form.value.openingAt).toISOString()
        : null,
      bidLocation: form.value.bidLocation || null,
      businessOwnerId: auth.user.employeeId,
      technicalOwnerId: auth.user.employeeId,
      pricingOwnerId: auth.user.employeeId,
    });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function submitBid(item: BidRow) {
  error.value = null;
  try {
    await callApi("approval.instance.submit", {
      businessType: "BID_APPLICATION",
      businessId: item.id,
      title: `投标申请：${item.code}`,
      amount: null,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  }
}
async function transition(item: BidRow, action: string) {
  try {
    await callApi("bid.status.transition", { bidId: item.id, action });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败";
  }
}
async function createResult() {
  saving.value = true;
  error.value = null;
  try {
    const f = resultForm.value;
    await callApi("bid.result.create", {
      ...f,
      ranking: f.ranking ?? null,
      winningAmount: f.result === "WON" ? f.winningAmount : null,
      noticeOn: f.noticeOn || null,
      lossReason: f.result === "WON" ? null : f.lossReason || null,
      competitors: f.competitors || null,
      retrospective: f.retrospective || null,
    });
    showResult.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
const areas = [
  ["投标申请", "审批、时间节点与保证金信息"],
  ["任务分工", "商务标、技术标与报价任务"],
  ["文件检查", "检查、整改和复查闭环"],
  ["投标结果", "中标状态与项目复盘"],
  ["友商配合", "报名、报价与配合投标登记"],
];
</script>
<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">BIDDING</p>
        <h1>投标管理</h1>
      </div>
      <div class="header-actions">
        <button class="primary-action" @click="showForm = !showForm">
          {{ showForm ? "取消" : "新增投标申请" }}</button
        ><button class="primary-action" @click="showResult = !showResult">
          登记投标结果
        </button>
      </div>
    </header>
    <form v-if="showForm" class="entity-form" @submit.prevent="createBid">
      <label
        >项目<select v-model="form.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >招标人<select v-model="form.tendererId" required>
          <option value="" disabled>请选择</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label>招标编号<input v-model="form.tenderNumber" /></label
      ><label
        >项目预算<input
          v-model.number="form.projectBudget"
          type="number"
          min="0"
          step="0.01" /></label
      ><label
        >投标限价<input
          v-model.number="form.bidCeiling"
          type="number"
          min="0"
          step="0.01" /></label
      ><label
        >投标方式<select v-model="form.bidMethod">
          <option value="ONLINE">线上</option>
          <option value="OFFLINE">线下</option>
        </select></label
      ><label
        >截止时间<input
          v-model="form.deadlineAt"
          type="datetime-local"
          required /></label
      ><label
        >开标时间<input v-model="form.openingAt" type="datetime-local" /></label
      ><label>投标地点<input v-model="form.bidLocation" /></label
      ><label
        >保证金<input
          v-model.number="form.depositAmount"
          type="number"
          min="0"
          step="0.01" /></label
      ><label
        >标书费<input
          v-model.number="form.documentFee"
          type="number"
          min="0"
          step="0.01" /></label
      ><label class="wide"
        >申请说明<textarea
          v-model="form.applicationReason"
          required
          minlength="2"
        ></textarea></label
      ><button :disabled="saving">{{ saving ? "保存中…" : "保存申请" }}</button>
    </form>
    <form v-if="showResult" class="entity-form" @submit.prevent="createResult">
      <label
        >已开标项目<select v-model="resultForm.bidId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="b in items.filter((x) => x.status === 'OPENED')"
            :key="b.id"
            :value="b.id"
          >
            {{ b.code }} · {{ b.projectName }}
          </option>
        </select></label
      ><label
        >开标日<input
          v-model="resultForm.openedOn"
          type="date"
          required /></label
      ><label
        >我方报价<input
          v-model.number="resultForm.quotedAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >排名<input
          v-model.number="resultForm.ranking"
          type="number"
          min="1" /></label
      ><label
        >结果<select v-model="resultForm.result">
          <option value="WON">中标</option>
          <option value="LOST">未中标</option>
          <option value="FAILED">废标</option>
        </select></label
      ><label v-if="resultForm.result === 'WON'"
        >中标金额<input
          v-model.number="resultForm.winningAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label v-else class="wide"
        >未中标原因<textarea
          v-model="resultForm.lossReason"
          required
        ></textarea></label
      ><label class="wide"
        >复盘<textarea v-model="resultForm.retrospective"></textarea></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存投标结果" }}
      </button>
    </form>
    <section class="module-grid bid-grid">
      <article
        v-for="([title, detail], index) in areas"
        :key="title"
        class="module-card"
      >
        <span class="module-icon">{{
          String(index + 1).padStart(2, "0")
        }}</span>
        <h2>{{ title }}</h2>
        <p>{{ detail }}</p>
      </article>
    </section>
    <section class="data-panel">
      <h2>最近投标</h2>
      <p v-if="error" class="error">{{ error }}</p>
      <table v-else-if="items.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>项目</th>
            <th>截止时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.deadlineAt }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="
                  ['DRAFT', 'RETURNED', 'REJECTED', 'WITHDRAWN'].includes(
                    item.status,
                  )
                "
                class="secondary-button"
                @click="submitBid(item)"
              >
                提交审批
              </button>
              <button
                v-if="item.status === 'PREPARING'"
                class="secondary-button"
                @click="transition(item, 'SUBMIT_BID')"
              >
                确认投标</button
              ><button
                v-if="item.status === 'SUBMITTED'"
                class="secondary-button"
                @click="transition(item, 'OPEN')"
              >
                确认开标</button
              ><button
                v-if="['DRAFT', 'PREPARING'].includes(item.status)"
                class="secondary-button"
                @click="transition(item, 'ABANDON')"
              >
                放弃
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无投标申请</p>
    </section>
  </main>
</template>
