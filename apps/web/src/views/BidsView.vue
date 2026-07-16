<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { canSubmitApprovalStatus } from "../approval-status";
import { useAuthStore } from "../stores/auth";
interface BidRow {
  id: string;
  projectId: string;
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
interface EmployeeOption {
  id: string;
  name: string;
  positionName?: string;
}
interface BidTask {
  id: string;
  taskType: string;
  taskName: string;
  assigneeId: string;
  dueAt: string;
  deliveryRequirement: string;
  completionDescription: string | null;
  status: string;
}
interface BidCheck {
  id: string;
  checkItem: string;
  checkStandard: string;
  responsibleId: string;
  result: string;
  issueDescription: string | null;
  rectifierId: string | null;
  rectificationDueAt: string | null;
  recheckResult: string | null;
}
interface PartnerBid {
  id: string;
  partnerName: string;
  finalCustomerName: string;
  cooperationType: string;
  ourQuotation: number | null;
  result: string | null;
  description: string | null;
}
const auth = useAuthStore(),
  items = ref<BidRow[]>([]),
  projects = ref<Option[]>([]),
  customers = ref<Option[]>([]),
  employees = ref<EmployeeOption[]>([]),
  selected = ref<BidRow | null>(null),
  tasks = ref<BidTask[]>([]),
  checks = ref<BidCheck[]>([]),
  partnerBids = ref<PartnerBid[]>([]),
  error = ref<string | null>(null),
  showForm = ref(false),
  showResult = ref(false),
  showTask = ref(false),
  showCheck = ref(false),
  showPartner = ref(false),
  saving = ref(false);
const taskForm = ref({
  taskType: "TECHNICAL",
  taskName: "",
  assigneeId: "",
  collaboratorIds: [] as string[],
  startsAt: "",
  dueAt: "",
  deliveryRequirement: "",
  checkerId: "",
});
const checkForm = ref({ checkItem: "", checkStandard: "", responsibleId: "" });
const partnerForm = ref({
  partnerId: "",
  finalCustomerId: "",
  cooperationType: "JOINT_BID",
  registrationAt: "",
  quotationAt: "",
  biddingAt: "",
  ourQuotation: null as number | null,
  result: "",
  description: "",
});
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
    const [b, p, c, e] = await Promise.all([
      callApi<{ items: BidRow[] }>("bid.application.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: Option[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
      callApi<{ items: EmployeeOption[] }>("organization.employee.options", {}),
    ]);
    items.value = b.items;
    projects.value = p.items;
    customers.value = c.items;
    employees.value = e.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
async function openDetail(item: BidRow) {
  try {
    const data = await callApi<{
      tasks: BidTask[];
      checks: BidCheck[];
      partners: PartnerBid[];
    }>("bid.detail", { bidId: item.id });
    selected.value = item;
    tasks.value = data.tasks;
    checks.value = data.checks;
    partnerBids.value = data.partners;
    if (auth.user) {
      taskForm.value.assigneeId = auth.user.employeeId;
      checkForm.value.responsibleId = auth.user.employeeId;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "详情加载失败";
  }
}
async function createTask() {
  if (!selected.value) return;
  saving.value = true;
  try {
    await callApi("bid.task.create", {
      ...taskForm.value,
      bidId: selected.value.id,
      startsAt: taskForm.value.startsAt
        ? new Date(taskForm.value.startsAt).toISOString()
        : null,
      dueAt: new Date(taskForm.value.dueAt).toISOString(),
      checkerId: taskForm.value.checkerId || null,
    });
    showTask.value = false;
    await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "任务保存失败";
  } finally {
    saving.value = false;
  }
}
async function taskAction(task: BidTask, action: string) {
  let completionDescription: null | string = null;
  if (action === "SUBMIT_CHECK") {
    completionDescription = window.prompt("请输入完成说明")?.trim() || null;
    if (!completionDescription) return;
  }
  try {
    await callApi("bid.task.transition", {
      taskId: task.id,
      action,
      completionDescription,
    });
    if (selected.value) await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "任务操作失败";
  }
}
async function createCheck() {
  if (!selected.value) return;
  saving.value = true;
  try {
    await callApi("bid.check.create", {
      ...checkForm.value,
      bidId: selected.value.id,
    });
    showCheck.value = false;
    await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "检查项保存失败";
  } finally {
    saving.value = false;
  }
}
async function checkResult(item: BidCheck, result: "PASSED" | "FAILED") {
  let issueDescription: null | string = null,
    rectifierId: null | string = null,
    rectificationDueAt: null | string = null;
  if (result === "FAILED") {
    issueDescription = window.prompt("问题说明")?.trim() || null;
    rectifierId = auth.user?.employeeId || null;
    const due = window.prompt("整改期限（YYYY-MM-DD）")?.trim();
    if (!issueDescription || !due) return;
    rectificationDueAt = new Date(`${due}T18:00:00`).toISOString();
  }
  try {
    await callApi("bid.check.result", {
      checkId: item.id,
      result,
      issueDescription,
      rectifierId,
      rectificationDueAt,
      recheckResult: null,
    });
    if (selected.value) await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "检查结果保存失败";
  }
}
async function recheck(item: BidCheck, result: "PASSED" | "FAILED") {
  try {
    await callApi("bid.check.result", {
      checkId: item.id,
      result: item.result,
      issueDescription: item.issueDescription,
      rectifierId: item.rectifierId,
      rectificationDueAt: item.rectificationDueAt
        ? new Date(item.rectificationDueAt).toISOString()
        : null,
      recheckResult: result,
    });
    if (selected.value) await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "复查保存失败";
  }
}
async function createPartner() {
  if (!selected.value || !auth.user) return;
  saving.value = true;
  try {
    const f = partnerForm.value;
    await callApi("bid.partner.create", {
      projectId: selected.value.projectId,
      leadId: null,
      partnerId: f.partnerId,
      finalCustomerId: f.finalCustomerId,
      cooperationType: f.cooperationType,
      registrationAt: f.registrationAt
        ? new Date(f.registrationAt).toISOString()
        : null,
      quotationAt: f.quotationAt ? new Date(f.quotationAt).toISOString() : null,
      biddingAt: f.biddingAt ? new Date(f.biddingAt).toISOString() : null,
      ourQuotation: f.ourQuotation,
      result: f.result || null,
      description: f.description || null,
    });
    showPartner.value = false;
    await openDetail(selected.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "友商配合保存失败";
  } finally {
    saving.value = false;
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
      actionKey: crypto.randomUUID(),
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
            <td>
              <button @click="openDetail(item)">{{ item.projectName }}</button>
            </td>
            <td>{{ item.deadlineAt }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="canSubmitApprovalStatus(item.status)"
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
    <section v-if="selected" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ selected.code }}</p>
          <h2>{{ selected.projectName }} · 执行详情</h2>
        </div>
        <div>
          <button @click="showTask = !showTask">新增任务</button
          ><button @click="showCheck = !showCheck">新增检查项</button
          ><button @click="showPartner = !showPartner">友商配合</button
          ><button @click="selected = null">关闭</button>
        </div>
      </header>
      <form v-if="showTask" class="entity-form" @submit.prevent="createTask">
        <label>任务类型<input v-model="taskForm.taskType" required /></label
        ><label
          >任务名称<input
            v-model="taskForm.taskName"
            required
            minlength="2" /></label
        ><label
          >责任人<select v-model="taskForm.assigneeId" required>
            <option
              v-for="employee in employees"
              :key="employee.id"
              :value="employee.id"
            >
              {{ employee.name }}
            </option>
          </select></label
        ><label
          >检查人<select v-model="taskForm.checkerId">
            <option value="">不指定</option>
            <option
              v-for="employee in employees"
              :key="employee.id"
              :value="employee.id"
            >
              {{ employee.name }}
            </option>
          </select></label
        ><label
          >开始时间<input
            v-model="taskForm.startsAt"
            type="datetime-local" /></label
        ><label
          >截止时间<input
            v-model="taskForm.dueAt"
            type="datetime-local"
            required /></label
        ><label class="wide"
          >交付要求<textarea
            v-model="taskForm.deliveryRequirement"
            required
            minlength="2"
          ></textarea></label
        ><button :disabled="saving">保存任务</button>
      </form>
      <h3>任务分工</h3>
      <article v-for="task in tasks" :key="task.id" class="data-row">
        <div>
          <strong>{{ task.taskName }} · {{ task.status }}</strong>
          <p>
            {{ task.taskType }} · 截止
            {{ new Date(task.dueAt).toLocaleString() }}
          </p>
          <small>{{ task.deliveryRequirement }}</small>
        </div>
        <div>
          <button
            v-if="['PENDING', 'OVERDUE'].includes(task.status)"
            @click="taskAction(task, 'START')"
          >
            开始</button
          ><button
            v-if="task.status === 'IN_PROGRESS'"
            @click="taskAction(task, 'SUBMIT_CHECK')"
          >
            提交检查</button
          ><button
            v-if="task.status === 'PENDING_CHECK'"
            @click="taskAction(task, 'COMPLETE')"
          >
            检查完成</button
          ><button
            v-if="!['COMPLETED', 'CANCELLED'].includes(task.status)"
            @click="taskAction(task, 'CANCEL')"
          >
            取消
          </button>
        </div>
      </article>
      <p v-if="!tasks.length">暂无任务</p>
      <form v-if="showCheck" class="entity-form" @submit.prevent="createCheck">
        <label
          >检查项<input
            v-model="checkForm.checkItem"
            required
            minlength="2" /></label
        ><label
          >责任人<select v-model="checkForm.responsibleId" required>
            <option
              v-for="employee in employees"
              :key="employee.id"
              :value="employee.id"
            >
              {{ employee.name }}
            </option>
          </select></label
        ><label class="wide"
          >检查标准<textarea
            v-model="checkForm.checkStandard"
            required
            minlength="2"
          ></textarea></label
        ><button :disabled="saving">保存检查项</button>
      </form>
      <h3>文件检查与整改</h3>
      <article v-for="check in checks" :key="check.id" class="data-row">
        <div>
          <strong>{{ check.checkItem }} · {{ check.result }}</strong>
          <p>{{ check.checkStandard }}</p>
          <small v-if="check.issueDescription"
            >问题：{{ check.issueDescription }} · 复查
            {{ check.recheckResult || "待复查" }}</small
          >
        </div>
        <div>
          <button
            v-if="check.result === 'PENDING'"
            @click="checkResult(check, 'PASSED')"
          >
            通过</button
          ><button
            v-if="check.result === 'PENDING'"
            @click="checkResult(check, 'FAILED')"
          >
            不通过</button
          ><button
            v-if="check.result === 'FAILED' && !check.recheckResult"
            @click="recheck(check, 'PASSED')"
          >
            复查通过</button
          ><button
            v-if="check.result === 'FAILED' && !check.recheckResult"
            @click="recheck(check, 'FAILED')"
          >
            复查未通过
          </button>
        </div>
      </article>
      <p v-if="!checks.length">暂无检查项</p>
      <form
        v-if="showPartner"
        class="entity-form"
        @submit.prevent="createPartner"
      >
        <label
          >友商<select v-model="partnerForm.partnerId" required>
            <option
              v-for="customer in customers"
              :key="customer.id"
              :value="customer.id"
            >
              {{ customer.name }}
            </option>
          </select></label
        ><label
          >最终客户<select v-model="partnerForm.finalCustomerId" required>
            <option
              v-for="customer in customers"
              :key="customer.id"
              :value="customer.id"
            >
              {{ customer.name }}
            </option>
          </select></label
        ><label
          >配合类型<input
            v-model="partnerForm.cooperationType"
            required /></label
        ><label
          >我方报价<input
            v-model.number="partnerForm.ourQuotation"
            type="number"
            min="0"
            step="0.01" /></label
        ><label>结果<input v-model="partnerForm.result" /></label
        ><label class="wide"
          >说明<textarea v-model="partnerForm.description"></textarea></label
        ><button :disabled="saving">保存友商配合</button>
      </form>
      <h3>友商配合投标</h3>
      <article
        v-for="partner in partnerBids"
        :key="partner.id"
        class="data-row"
      >
        <div>
          <strong
            >{{ partner.partnerName }} → {{ partner.finalCustomerName }}</strong
          >
          <p>
            {{ partner.cooperationType }} · 报价
            {{ partner.ourQuotation ?? "未填" }} ·
            {{ partner.result || "进行中" }}
          </p>
          <small>{{ partner.description }}</small>
        </div>
      </article>
      <p v-if="!partnerBids.length">暂无友商配合记录</p>
    </section>
  </main>
</template>
