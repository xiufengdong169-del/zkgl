<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { canSubmitApprovalStatus } from "../approval-status";
import { useAuthStore } from "../stores/auth";

interface Option {
  id: string;
  projectName?: string;
  name?: string;
}
interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
}
interface PlanDocument {
  id: string;
  code: string;
  projectId: string;
  partnerName: string;
  status: string;
  currentVersion: number;
  versionId: string;
  settlementMethod: string;
  ratio: number | null;
  fixedAmount: number | null;
  calculationBasis: string;
  effectiveFrom: string;
  versionStatus: string;
}
interface SettlementDocument {
  id: string;
  code: string;
  projectId: string;
  netAmount: string;
  status: string;
  partnerName: string;
  paymentStatus: string;
  invoiceRequirement: string | null;
  hasPaymentApplication: number;
}
interface DepositEventDocument {
  id: string;
  depositId: string;
  depositCode: string;
  eventType: string;
  amount: string;
  occurredOn: string;
  status: string;
}
interface DepositDocument {
  id: string;
  code: string;
  projectId: string;
  direction: string;
  counterpartyName: string;
  amount: string;
  account: string | null;
  occupiedAmount: string;
  lossAmount: string;
  status: string;
  hasPaymentApplication: number;
}
interface CloseDocument {
  id: string;
  code: string;
  projectName: string;
  appliedOn: string;
  closeType: string;
  contractAmount: string;
  receivedAmount: string;
  confirmedCost: string;
  status: string;
}
interface CloseOpenItemDocument {
  id: string;
  closeCode: string;
  projectName: string;
  itemType: string;
  description: string;
  responsibleId: string;
  dueOn: string;
  completedOn: string | null;
  status: string;
}
const today = new Date().toISOString().slice(0, 10),
  auth = useAuthStore(),
  projects = ref<Option[]>([]),
  partners = ref<Option[]>([]),
  plans = ref<PlanDocument[]>([]),
  settlements = ref<SettlementDocument[]>([]),
  deposits = ref<DepositDocument[]>([]),
  depositEvents = ref<DepositEventDocument[]>([]),
  closes = ref<CloseDocument[]>([]),
  closeOpenItems = ref<CloseOpenItemDocument[]>([]),
  employees = ref<EmployeeOption[]>([]),
  summary = ref({
    planCount: 0,
    settledAmount: "0.00",
    occupiedDeposit: "0.00",
    pendingCloseCount: 0,
  }),
  error = ref<string | null>(null),
  mode = ref<
    | "PLAN"
    | "PLAN_VERSION"
    | "DEPOSIT"
    | "CLOSE"
    | "SETTLEMENT"
    | "DEPOSIT_EVENT"
    | "DEPOSIT_PAYMENT"
    | "PARTNER_PAYMENT"
    | null
  >(null),
  saving = ref(false);
const versionPlanId = ref("");
const plan = ref({
  projectId: "",
  partnerId: "",
  settlementMethod: "RATIO",
  fixedAmount: null as number | null,
  ratio: 0.2 as number | null,
  calculationBasis: "ACTUAL_RECEIPTS",
  upperLimit: null as number | null,
  lowerLimit: null as number | null,
  effectiveFrom: today,
  effectiveTo: "",
  conditions: "",
});
const deposit = ref({
  projectId: "",
  depositType: "BID",
  direction: "PAY",
  counterpartyId: "",
  amount: 0,
  duePaymentOn: today,
  dueReturnOn: "",
  account: "",
});
const close = ref({
  projectId: "",
  appliedOn: today,
  completionSummary: "",
  acceptanceConclusion: "",
  archiveCheckPassed: false,
  closeDescription: "",
  closeType: "NORMAL",
  specialApprovalComment: "",
});
const closeDraftItems = ref([
  {
    type: "RECEIVABLE",
    description: "",
    responsibleId: "",
    dueOn: "",
  },
]);
const settlement = ref({
  planId: "",
  periodStartOn: today,
  periodEndOn: today,
  deductionAmount: 0,
  invoiceRequirement: "",
});
const depositEvent = ref({
  depositId: "",
  eventType: "RETURN",
  amount: 0,
  occurredOn: today,
  description: "",
});
const depositPayment = ref({
  depositId: "",
  projectId: "",
  recipientName: "",
  requestedAmount: 0,
  plannedOn: today,
  receivingAccount: "",
});
const partnerPayment = ref({
  settlementId: "",
  projectId: "",
  recipientName: "",
  requestedAmount: 0,
  plannedOn: today,
  receivingAccount: "",
  invoiceRequired: true,
});
async function load() {
  try {
    const [s, p, c, operations, closeResult, employeeResult] =
      await Promise.all([
        callApi<typeof summary.value>("settlement.summary", {}),
        callApi<{ items: Option[] }>("project.list", { page: 1, pageSize: 50 }),
        callApi<{ items: Option[] }>("crm.counterparty.list", {
          page: 1,
          pageSize: 50,
        }),
        callApi<{
          plans: PlanDocument[];
          settlements: SettlementDocument[];
          deposits: DepositDocument[];
          depositEvents: DepositEventDocument[];
        }>("finance.operations", {}),
        callApi<{
          items: CloseDocument[];
          openItems: CloseOpenItemDocument[];
        }>("project.close.list", {
          page: 1,
          pageSize: 50,
        }),
        callApi<{ items: EmployeeOption[] }>("org.employee.options", {}),
      ]);
    summary.value = s;
    projects.value = p.items;
    partners.value = c.items;
    plans.value = operations.plans;
    settlements.value = operations.settlements;
    deposits.value = operations.deposits;
    depositEvents.value = operations.depositEvents;
    closes.value = closeResult.items;
    closeOpenItems.value = closeResult.openItems;
    employees.value = employeeResult.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
onMounted(load);
async function createPlan() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = plan.value;
    await callApi("partner.plan.create", {
      ...f,
      fixedAmount: f.settlementMethod === "FIXED" ? f.fixedAmount : null,
      ratio: f.settlementMethod === "RATIO" ? f.ratio : null,
      deductibleCostScope: [],
      effectiveTo: f.effectiveTo || null,
      conditions: f.conditions || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
function startPlanVersion(item: PlanDocument) {
  versionPlanId.value = item.id;
  plan.value.settlementMethod = item.settlementMethod;
  plan.value.ratio = item.ratio;
  plan.value.fixedAmount = item.fixedAmount;
  plan.value.calculationBasis = item.calculationBasis;
  plan.value.effectiveFrom = today;
  mode.value = "PLAN_VERSION";
}
async function createPlanVersion() {
  saving.value = true;
  try {
    const f = plan.value,
      created = await callApi<{ id: string }>("partner.plan.version.create", {
        planId: versionPlanId.value,
        settlementMethod: f.settlementMethod,
        fixedAmount: f.settlementMethod === "FIXED" ? f.fixedAmount : null,
        ratio: f.settlementMethod === "RATIO" ? f.ratio : null,
        calculationBasis: f.calculationBasis,
        deductibleCostScope: [],
        upperLimit: f.upperLimit,
        lowerLimit: f.lowerLimit,
        effectiveFrom: f.effectiveFrom,
        effectiveTo: f.effectiveTo || null,
        conditions: f.conditions || null,
      });
    await callApi("partner.plan.version.activate", {
      planId: versionPlanId.value,
      versionId: created.id,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "方案新版本保存失败";
  } finally {
    saving.value = false;
  }
}
async function createDeposit() {
  saving.value = true;
  error.value = null;
  try {
    const f = deposit.value;
    await callApi("deposit.create", {
      ...f,
      bidId: null,
      contractId: null,
      dueReturnOn: f.dueReturnOn || null,
      account: f.account || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createClose() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = close.value,
      withOpen = f.closeType === "WITH_OPEN_ITEMS";
    const result = await callApi<{
      id: string;
      code: string;
      profit: { contractOperatingProfit: number };
    }>("project.close.create", {
      projectId: f.projectId,
      appliedOn: f.appliedOn,
      completionSummary: f.completionSummary,
      acceptanceConclusion: f.acceptanceConclusion,
      archiveCheckPassed: f.archiveCheckPassed,
      closeDescription: f.closeDescription,
      closeType: f.closeType,
      specialApprovalComment: f.specialApprovalComment || null,
      openItems: withOpen ? closeDraftItems.value : [],
    });
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_CLOSE",
      businessId: result.id,
      title: `项目结项：${result.code}`,
      amount: Math.max(0, Number(result.profit.contractOperatingProfit)),
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
function addCloseDraftItem() {
  closeDraftItems.value.push({
    type: "OTHER",
    description: "",
    responsibleId: auth.user?.employeeId ?? "",
    dueOn: "",
  });
}
function removeCloseDraftItem(index: number) {
  if (closeDraftItems.value.length > 1) closeDraftItems.value.splice(index, 1);
}
async function createSettlement() {
  saving.value = true;
  error.value = null;
  try {
    await callApi("partner.settlement.create", {
      ...settlement.value,
      invoiceRequirement: settlement.value.invoiceRequirement || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createDepositEvent() {
  saving.value = true;
  error.value = null;
  try {
    const result = await callApi<{
      id?: string;
      requiresApproval?: boolean;
    }>("deposit.event.create", {
      ...depositEvent.value,
      description: depositEvent.value.description || null,
      idempotencyKey: crypto.randomUUID(),
    });
    if (result.requiresApproval && result.id)
      await callApi("approval.instance.submit", {
        actionKey: crypto.randomUUID(),
        businessType: "DEPOSIT_LOSS",
        businessId: result.id,
        title: `保证金没收损失：${
          deposits.value.find((x) => x.id === depositEvent.value.depositId)
            ?.code ?? depositEvent.value.depositId
        }`,
        amount: depositEvent.value.amount,
      });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function submitDeposit(item: DepositDocument) {
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "DEPOSIT",
      businessId: item.id,
      title: `保证金缴纳：${item.code}`,
      amount: Number(item.amount),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交保证金审批失败";
  }
}
function startDepositPayment(item: DepositDocument) {
  depositPayment.value = {
    depositId: item.id,
    projectId: item.projectId,
    recipientName: item.counterpartyName,
    requestedAmount: Number(item.amount),
    plannedOn: today,
    receivingAccount: item.account ?? "",
  };
  mode.value = "DEPOSIT_PAYMENT";
}
async function createDepositPayment() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = depositPayment.value;
    await callApi("payment.application.create", {
      projectId: f.projectId,
      sourceType: "DEPOSIT",
      sourceId: f.depositId,
      recipientName: f.recipientName,
      paymentType: "DEPOSIT",
      requestedAmount: f.requestedAmount,
      plannedOn: f.plannedOn,
      paymentBasis: "已审批保证金缴纳申请",
      receivingAccount: f.receivingAccount,
      invoiceRequired: false,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "生成保证金付款申请失败";
  } finally {
    saving.value = false;
  }
}
async function submitDepositLoss(item: DepositEventDocument) {
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "DEPOSIT_LOSS",
      businessId: item.id,
      title: `保证金没收损失：${item.depositCode}`,
      amount: Number(item.amount),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交损失审批失败";
  }
}
function startPartnerPayment(item: SettlementDocument) {
  partnerPayment.value = {
    settlementId: item.id,
    projectId: item.projectId,
    recipientName: item.partnerName,
    requestedAmount: Number(item.netAmount),
    plannedOn: today,
    receivingAccount: "由合作方档案带入",
    invoiceRequired: Boolean(item.invoiceRequirement),
  };
  mode.value = "PARTNER_PAYMENT";
}
async function createPartnerPayment() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = partnerPayment.value;
    await callApi("payment.application.create", {
      projectId: f.projectId,
      sourceType: "PARTNER_SETTLEMENT",
      sourceId: f.settlementId,
      recipientName: f.recipientName,
      paymentType: "PARTNER_SETTLEMENT",
      requestedAmount: f.requestedAmount,
      plannedOn: f.plannedOn,
      paymentBasis: "已审批合作方结算单",
      receivingAccount: f.receivingAccount,
      invoiceRequired: f.invoiceRequired,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "生成付款申请失败";
  } finally {
    saving.value = false;
  }
}
async function submitSettlement(item: SettlementDocument) {
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PARTNER_SETTLEMENT",
      businessId: item.id,
      title: `合作方结算：${item.code}`,
      amount: Number(item.netAmount),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  }
}
async function submitClose(item: CloseDocument) {
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_CLOSE",
      businessId: item.id,
      title: `项目结项：${item.projectName}`,
      amount: Math.max(
        0,
        Number(item.contractAmount) - Number(item.confirmedCost),
      ),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交结项审批失败";
  }
}
async function completeCloseOpenItem(item: CloseOpenItemDocument) {
  error.value = null;
  try {
    await callApi("project.close.openItem.complete", {
      itemId: item.id,
      completedOn: today,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "确认未清事项完成失败";
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SETTLEMENT & CLOSE</p>
        <h1>结算、保证金与结项</h1>
      </div>
      <div class="header-actions">
        <button
          v-if="auth.user?.permissionCodes.includes('partner.plan.create')"
          class="primary-action"
          @click="mode = 'PLAN'"
        >
          新增合作方案</button
        ><button
          v-if="auth.user?.permissionCodes.includes('deposit.create')"
          class="primary-action"
          @click="mode = 'DEPOSIT'"
        >
          登记保证金</button
        ><button
          v-if="
            auth.user?.permissionCodes.includes('partner.settlement.create')
          "
          class="primary-action"
          @click="mode = 'SETTLEMENT'"
        >
          生成结算单</button
        ><button
          v-if="auth.user?.permissionCodes.includes('deposit.event.create')"
          class="primary-action"
          @click="mode = 'DEPOSIT_EVENT'"
        >
          保证金退回/没收</button
        ><button
          v-if="auth.user?.permissionCodes.includes('project.close.create')"
          class="primary-action"
          @click="mode = 'CLOSE'"
        >
          申请结项
        </button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="contract-panels">
      <article>
        <p>合作方案</p>
        <strong>{{ summary.planCount }}</strong
        ><small>全部有效版本</small>
      </article>
      <article>
        <p>已审批结算</p>
        <strong>¥ {{ summary.settledAmount }}</strong
        ><small>已确认成本</small>
      </article>
      <article>
        <p>保证金占用</p>
        <strong>¥ {{ summary.occupiedDeposit }}</strong
        ><small>已缴未退</small>
      </article>
      <article>
        <p>待结项</p>
        <strong>{{ summary.pendingCloseCount }}</strong
        ><small>流程处理中</small>
      </article>
    </section>
    <section v-if="plans.length" class="data-panel">
      <h2>合作分配方案</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>合作方</th>
            <th>版本</th>
            <th>方式</th>
            <th>比例/固定额</th>
            <th>计算基数</th>
            <th>生效日</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in plans" :key="item.id">
            <td>{{ item.code }}</td>
            <td>{{ item.partnerName }}</td>
            <td>V{{ item.currentVersion }}</td>
            <td>{{ item.settlementMethod }}</td>
            <td>
              {{
                item.settlementMethod === "RATIO"
                  ? `${Number(item.ratio || 0) * 100}%`
                  : `¥ ${item.fixedAmount || 0}`
              }}
            </td>
            <td>{{ item.calculationBasis }}</td>
            <td>{{ item.effectiveFrom }}</td>
            <td>{{ item.status }} / {{ item.versionStatus }}</td>
            <td><button @click="startPlanVersion(item)">创建新版本</button></td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="settlements.length" class="data-panel">
      <h2>合作方结算单</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>实结金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in settlements" :key="s.id">
            <td>{{ s.code }}</td>
            <td>{{ s.netAmount }}</td>
            <td>{{ s.status }}</td>
            <td>
              <button
                v-if="canSubmitApprovalStatus(s.status)"
                class="secondary-button"
                @click="submitSettlement(s)"
              >
                提交审批
              </button>
              <button
                v-if="
                  s.status === 'APPROVED' &&
                  s.paymentStatus === 'PENDING_PAYMENT' &&
                  !s.hasPaymentApplication
                "
                class="secondary-button"
                @click="startPartnerPayment(s)"
              >
                生成付款申请
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="deposits.length" class="data-panel">
      <h2>保证金台账</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>登记金额</th>
            <th>占用金额</th>
            <th>确认损失</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in deposits" :key="item.id">
            <td>{{ item.code }}</td>
            <td>¥ {{ item.amount }}</td>
            <td>¥ {{ item.occupiedAmount }}</td>
            <td>¥ {{ item.lossAmount }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="canSubmitApprovalStatus(item.status)"
                @click="submitDeposit(item)"
              >
                提交缴纳审批
              </button>
              <button
                v-if="
                  item.direction === 'PAY' &&
                  item.status === 'PENDING_PAYMENT' &&
                  !item.hasPaymentApplication &&
                  auth.user?.permissionCodes.includes(
                    'payment.application.create',
                  )
                "
                class="secondary-button"
                @click="startDepositPayment(item)"
              >
                生成付款申请
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="depositEvents.length" class="data-panel">
      <h2>保证金事件</h2>
      <table>
        <thead>
          <tr>
            <th>保证金</th>
            <th>事件</th>
            <th>金额</th>
            <th>发生日</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in depositEvents" :key="item.id">
            <td>{{ item.depositCode }}</td>
            <td>{{ item.eventType }}</td>
            <td>¥ {{ item.amount }}</td>
            <td>{{ item.occurredOn }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="
                  item.eventType === 'FORFEIT' &&
                  canSubmitApprovalStatus(item.status)
                "
                @click="submitDepositLoss(item)"
              >
                提交损失审批
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="closes.length" class="data-panel">
      <h2>项目结项申请</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>项目</th>
            <th>申请日</th>
            <th>类型</th>
            <th>合同金额</th>
            <th>已收款</th>
            <th>确认成本</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in closes" :key="item.id">
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.appliedOn }}</td>
            <td>{{ item.closeType }}</td>
            <td>¥ {{ item.contractAmount }}</td>
            <td>¥ {{ item.receivedAmount }}</td>
            <td>¥ {{ item.confirmedCost }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="canSubmitApprovalStatus(item.status)"
                @click="submitClose(item)"
              >
                提交审批
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="closeOpenItems.length" class="data-panel">
      <h2>结项未清事项</h2>
      <table>
        <thead>
          <tr>
            <th>结项编号</th>
            <th>项目</th>
            <th>类型</th>
            <th>事项</th>
            <th>完成期限</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in closeOpenItems" :key="item.id">
            <td>{{ item.closeCode }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.itemType }}</td>
            <td>{{ item.description }}</td>
            <td>{{ item.dueOn }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="
                  item.status === 'OPEN' &&
                  auth.user?.permissionCodes.includes(
                    'project.close.openItem.complete',
                  )
                "
                class="secondary-button"
                @click="completeCloseOpenItem(item)"
              >
                确认完成
              </button>
              <span v-else>{{ item.completedOn }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <form
      v-if="mode === 'DEPOSIT_PAYMENT'"
      class="entity-form"
      @submit.prevent="createDepositPayment"
    >
      <label
        >收款方<input v-model="depositPayment.recipientName" readonly
      /></label>
      <label
        >申请金额<input
          v-model.number="depositPayment.requestedAmount"
          type="number"
          readonly
      /></label>
      <label
        >计划付款日<input
          v-model="depositPayment.plannedOn"
          type="date"
          required
      /></label>
      <label
        >收款账户<input v-model="depositPayment.receivingAccount" required
      /></label>
      <button :disabled="saving">
        {{ saving ? "生成中…" : "生成付款申请" }}
      </button>
      <button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'PARTNER_PAYMENT'"
      class="entity-form"
      @submit.prevent="createPartnerPayment"
    >
      <label
        >收款方<input v-model="partnerPayment.recipientName" readonly
      /></label>
      <label
        >申请金额<input
          v-model.number="partnerPayment.requestedAmount"
          type="number"
          readonly
      /></label>
      <label
        >计划付款日<input
          v-model="partnerPayment.plannedOn"
          type="date"
          required
      /></label>
      <label
        >收款账户<input v-model="partnerPayment.receivingAccount" required
      /></label>
      <label
        ><input v-model="partnerPayment.invoiceRequired" type="checkbox" />
        需要发票</label
      >
      <button :disabled="saving">
        {{ saving ? "生成中…" : "生成付款申请" }}
      </button>
      <button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'PLAN' || mode === 'PLAN_VERSION'"
      class="entity-form"
      @submit.prevent="mode === 'PLAN' ? createPlan() : createPlanVersion()"
    >
      <label
        >项目<select v-model="plan.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >合作方<select v-model="plan.partnerId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in partners" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><label
        >结算方式<select v-model="plan.settlementMethod">
          <option value="RATIO">比例</option>
          <option value="FIXED">固定金额</option>
        </select></label
      ><label v-if="plan.settlementMethod === 'RATIO'"
        >比例<input
          v-model.number="plan.ratio"
          type="number"
          min="0"
          max="1"
          step="0.000001"
          required /></label
      ><label v-else
        >固定金额<input
          v-model.number="plan.fixedAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >计算基数<select v-model="plan.calculationBasis">
          <option value="ACTUAL_RECEIPTS">实际收款</option>
          <option value="CONTRACT_REVENUE_EX_TAX">合同不含税收入</option>
          <option value="PROJECT_GROSS_PROFIT">项目毛利</option>
          <option value="FIXED">固定金额</option>
        </select></label
      ><label
        >生效日期<input
          v-model="plan.effectiveFrom"
          type="date"
          required /></label
      ><label
        >上限<input
          v-model.number="plan.upperLimit"
          type="number"
          min="0"
          step="0.01" /></label
      ><label
        >下限<input
          v-model.number="plan.lowerLimit"
          type="number"
          min="0"
          step="0.01" /></label
      ><label class="wide"
        >条件<textarea v-model="plan.conditions"></textarea></label
      ><button :disabled="saving">
        {{
          saving ? "保存中…" : mode === "PLAN" ? "保存方案" : "保存并启用新版本"
        }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'DEPOSIT'"
      class="entity-form"
      @submit.prevent="createDeposit"
    >
      <label
        >项目<select v-model="deposit.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >往来单位<select v-model="deposit.counterpartyId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in partners" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><label>保证金类型<input v-model="deposit.depositType" required /></label
      ><label
        >方向<select v-model="deposit.direction">
          <option value="PAY">我方缴纳</option>
          <option value="RECEIVE">我方收取</option>
        </select></label
      ><label
        >金额<input
          v-model.number="deposit.amount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >应缴日<input
          v-model="deposit.duePaymentOn"
          type="date"
          required /></label
      ><label>应退日<input v-model="deposit.dueReturnOn" type="date" /></label
      ><label>账户<input v-model="deposit.account" /></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存保证金" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'SETTLEMENT'"
      class="entity-form"
      @submit.prevent="createSettlement"
    >
      <label
        >合作方案<select v-model="settlement.planId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in plans" :key="p.id" :value="p.id">
            {{ p.code }} · {{ p.partnerName }}
          </option>
        </select></label
      ><label
        >期间开始<input
          v-model="settlement.periodStartOn"
          type="date"
          required /></label
      ><label
        >期间结束<input
          v-model="settlement.periodEndOn"
          type="date"
          required /></label
      ><label
        >扣减金额<input
          v-model.number="settlement.deductionAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label class="wide"
        >开票要求<textarea
          v-model="settlement.invoiceRequirement"
        ></textarea></label
      ><button :disabled="saving">
        {{ saving ? "生成中…" : "生成结算单" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'DEPOSIT_EVENT'"
      class="entity-form"
      @submit.prevent="createDepositEvent"
    >
      <label
        >保证金<select v-model="depositEvent.depositId" required>
          <option value="" disabled>请选择</option>
          <option v-for="d in deposits" :key="d.id" :value="d.id">
            {{ d.code }} · 登记¥{{ d.amount }} · 占用¥{{ d.occupiedAmount }}
          </option>
        </select></label
      ><label
        >事件<select v-model="depositEvent.eventType">
          <option value="PAY">我方收取</option>
          <option value="RETURN">退回</option>
          <option value="FORFEIT">没收</option>
          <option value="VOID">作废</option>
        </select></label
      ><label
        >金额<input
          v-model.number="depositEvent.amount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >发生日期<input
          v-model="depositEvent.occurredOn"
          type="date"
          required /></label
      ><label class="wide"
        >说明<textarea v-model="depositEvent.description"></textarea></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存保证金事件" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'CLOSE'"
      class="entity-form"
      @submit.prevent="createClose"
    >
      <label
        >项目<select v-model="close.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >申请日<input v-model="close.appliedOn" type="date" required /></label
      ><label class="wide"
        >完成情况<textarea
          v-model="close.completionSummary"
          required
          minlength="2"
        ></textarea></label
      ><label class="wide"
        >验收结论<textarea
          v-model="close.acceptanceConclusion"
          required
          minlength="2"
        ></textarea></label
      ><label
        ><input v-model="close.archiveCheckPassed" type="checkbox" required />
        归档检查已通过</label
      ><label
        >结项类型<select v-model="close.closeType">
          <option value="NORMAL">普通结项</option>
          <option value="WITH_OPEN_ITEMS">带遗留事项</option>
        </select></label
      ><label class="wide"
        >结项说明<textarea
          v-model="close.closeDescription"
          required
          minlength="2"
        ></textarea></label
      ><template v-if="close.closeType === 'WITH_OPEN_ITEMS'"
        ><fieldset
          v-for="(item, index) in closeDraftItems"
          :key="index"
          class="wide"
        >
          <legend>遗留事项 {{ index + 1 }}</legend>
          <label
            >类型<select v-model="item.type" required>
              <option value="RECEIVABLE">未收款</option>
              <option value="PAYABLE">未付款</option>
              <option value="DEPOSIT_RETURN">未退保证金</option>
              <option value="RISK_ISSUE">未关闭问题</option>
              <option value="OTHER">其他</option>
            </select></label
          >
          <label
            >责任人<select v-model="item.responsibleId" required>
              <option value="" disabled>请选择</option>
              <option v-for="e in employees" :key="e.id" :value="e.id">
                {{ e.name }}（{{ e.employeeCode }}）
              </option>
            </select></label
          >
          <label
            >完成期限<input v-model="item.dueOn" type="date" required
          /></label>
          <label class="wide"
            >事项说明<textarea v-model="item.description" required></textarea>
          </label>
          <button
            type="button"
            class="secondary-button"
            :disabled="closeDraftItems.length === 1"
            @click="removeCloseDraftItem(index)"
          >
            删除本项
          </button>
        </fieldset>
        <button
          type="button"
          class="secondary-button"
          @click="addCloseDraftItem"
        >
          添加遗留事项
        </button>
        ><label class="wide"
          >特批说明<textarea
            v-model="close.specialApprovalComment"
            required
          ></textarea></label></template
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "提交结项申请" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
  </main>
</template>
