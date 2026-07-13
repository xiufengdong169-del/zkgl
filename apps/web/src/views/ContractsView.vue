<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";
interface Row {
  id: string;
  code: string;
  contractName: string;
  contractType: string;
  taxInclusiveAmount: number;
  taxExclusiveAmount: number;
  amountStatus: string;
  status: string;
}
interface Option {
  id: string;
  name?: string;
  projectName?: string;
}
interface Detail extends Row {
  taxRate: number;
  taxAmount: number;
  expiresOn: string | null;
  contractVersion: number;
}
interface Change {
  id: string;
  changeCode: string;
  changeType: string;
  originalTaxInclusiveAmount: number;
  newTaxInclusiveAmount: number;
  netChangeAmount: number;
  effectiveOn: string;
  changeContent: string;
  reason: string;
  status: string;
}
interface Milestone {
  id: string;
  milestoneType: string;
  milestoneName: string;
  plannedOn: string;
  plannedAmount: number | null;
  completedOn: string | null;
  status: string;
}
const auth = useAuthStore(),
  items = ref<Row[]>([]),
  projects = ref<Option[]>([]),
  parties = ref<Option[]>([]),
  error = ref<string | null>(null),
  saving = ref(false),
  showForm = ref(false),
  selected = ref<Detail | null>(null),
  changes = ref<Change[]>([]),
  milestones = ref<Milestone[]>([]);
const summary = ref({
  incomeAmount: "0.00",
  expenseAmount: "0.00",
  expiringCount: 0,
});
const form = ref({
  contractName: "",
  contractType: "INCOME",
  projectId: "",
  partyAId: "",
  partyBId: "",
  taxInclusiveAmount: 0,
  taxExclusiveAmount: 0,
  taxRate: 0.06,
  amountStatus: "CONFIRMED",
  signedOn: "",
  effectiveOn: "",
  expiresOn: "",
  serviceContent: "",
  paymentTerms: "",
  invoiceTerms: "",
});
const changeForm = ref({
  changeType: "COMPOSITE",
  newTaxInclusiveAmount: 0,
  newTaxExclusiveAmount: 0,
  newTaxRate: 0.06,
  newTaxAmount: 0,
  newEndOn: "",
  changeContent: "",
  reason: "",
  effectiveOn: new Date().toISOString().slice(0, 10),
});
const milestoneForm = ref({
  milestoneType: "DELIVERY",
  milestoneName: "",
  plannedOn: "",
  plannedAmount: null as number | null,
  conditionDescription: "",
});

async function load() {
  error.value = null;
  try {
    const [c, p, o, s] = await Promise.all([
      callApi<{ items: Row[] }>("contract.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
      callApi<typeof summary.value>("contract.summary", {}),
    ]);
    items.value = c.items;
    projects.value = p.items;
    parties.value = o.items;
    summary.value = s;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
async function openDetail(id: string) {
  try {
    const data = await callApi<{
      contract: Detail;
      changes: Change[];
      milestones: Milestone[];
    }>("contract.detail", { contractId: id });
    selected.value = data.contract;
    changes.value = data.changes;
    milestones.value = data.milestones;
    changeForm.value.newTaxInclusiveAmount = Number(
      data.contract.taxInclusiveAmount,
    );
    changeForm.value.newTaxExclusiveAmount = Number(
      data.contract.taxExclusiveAmount,
    );
    changeForm.value.newTaxRate = Number(data.contract.taxRate);
    changeForm.value.newTaxAmount = Number(data.contract.taxAmount);
    changeForm.value.newEndOn = data.contract.expiresOn || "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "详情加载失败";
  }
}
async function createContract() {
  if (!auth.user) return;
  saving.value = true;
  try {
    await callApi("contract.create", {
      ...form.value,
      signingEntityId: form.value.partyBId,
      taxAmount:
        Math.round(
          (form.value.taxInclusiveAmount - form.value.taxExclusiveAmount) * 100,
        ) / 100,
      signedOn: form.value.signedOn || null,
      effectiveOn: form.value.effectiveOn || null,
      expiresOn: form.value.expiresOn || null,
      invoiceTerms: form.value.invoiceTerms || null,
      ownerId: auth.user.employeeId,
      parentContractId: null,
    });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function submitApproval(
  type: "CONTRACT" | "CONTRACT_CHANGE",
  id: string,
  title: string,
  amount: number,
) {
  try {
    await callApi("approval.instance.submit", {
      businessType: type,
      businessId: id,
      title,
      amount,
    });
    await load();
    if (selected.value) await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  }
}
async function activate(item: Row) {
  const date = new Date().toISOString().slice(0, 10);
  try {
    await callApi("contract.activate", {
      contractId: item.id,
      signedOn: date,
      effectiveOn: date,
    });
    await load();
    await openDetail(item.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "确认生效失败";
  }
}
async function createChange() {
  if (!selected.value) return;
  saving.value = true;
  try {
    const result = await callApi<{ id: string; code: string }>(
      "contract.change.create",
      {
        ...changeForm.value,
        contractId: selected.value.id,
        newEndOn: changeForm.value.newEndOn || null,
      },
    );
    await submitApproval(
      "CONTRACT_CHANGE",
      result.id,
      `合同变更：${selected.value.contractName}`,
      Number(changeForm.value.newTaxInclusiveAmount),
    );
    await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "变更申请失败";
  } finally {
    saving.value = false;
  }
}
async function createMilestone() {
  if (!selected.value) return;
  saving.value = true;
  try {
    await callApi("contract.milestone.create", {
      ...milestoneForm.value,
      contractId: selected.value.id,
      plannedAmount: milestoneForm.value.plannedAmount,
      conditionDescription: milestoneForm.value.conditionDescription || null,
    });
    milestoneForm.value.milestoneName = "";
    await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "节点保存失败";
  } finally {
    saving.value = false;
  }
}
async function completeMilestone(item: Milestone) {
  try {
    await callApi("contract.milestone.complete", {
      milestoneId: item.id,
      completedOn: new Date().toISOString().slice(0, 10),
    });
    if (selected.value) await openDetail(selected.value.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "节点完成失败";
  }
}
onMounted(load);
</script>
<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CONTRACTS</p>
        <h1>合同管理</h1>
      </div>
      <button class="primary-action" @click="showForm = !showForm">
        {{ showForm ? "取消" : "新增合同" }}
      </button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <form v-if="showForm" class="entity-form" @submit.prevent="createContract">
      <label
        >合同名称<input
          v-model="form.contractName"
          required
          minlength="2" /></label
      ><label
        >类型<select v-model="form.contractType">
          <option value="INCOME">收入合同</option>
          <option value="EXPENSE">支出合同</option>
        </select></label
      ><label
        >项目<select v-model="form.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >甲方<select v-model="form.partyAId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in parties" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><label
        >乙方/签约主体<select v-model="form.partyBId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in parties" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><label
        >金额状态<select v-model="form.amountStatus">
          <option value="CONFIRMED">已确认</option>
          <option value="PROVISIONAL">暂定</option>
        </select></label
      ><label
        >含税金额<input
          v-model.number="form.taxInclusiveAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >不含税金额<input
          v-model.number="form.taxExclusiveAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >税率<input
          v-model.number="form.taxRate"
          type="number"
          min="0"
          max="1"
          step="0.000001"
          required /></label
      ><label>签订日期<input v-model="form.signedOn" type="date" /></label
      ><label>生效日期<input v-model="form.effectiveOn" type="date" /></label
      ><label>到期日期<input v-model="form.expiresOn" type="date" /></label
      ><label class="wide"
        >服务内容<textarea
          v-model="form.serviceContent"
          required
          minlength="2"
        ></textarea></label
      ><label class="wide"
        >付款条件<textarea
          v-model="form.paymentTerms"
          required
          minlength="2"
        ></textarea></label
      ><label class="wide"
        >开票条件<textarea v-model="form.invoiceTerms"></textarea></label
      ><button :disabled="saving">保存合同</button>
    </form>
    <section class="contract-panels">
      <article>
        <p>收入合同</p>
        <strong>¥ {{ summary.incomeAmount }}</strong>
      </article>
      <article>
        <p>支出合同</p>
        <strong>¥ {{ summary.expenseAmount }}</strong>
      </article>
      <article>
        <p>未来30天到期</p>
        <strong>{{ summary.expiringCount }}</strong>
      </article>
    </section>
    <section class="data-panel">
      <h2>合同列表</h2>
      <table v-if="items.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>类型</th>
            <th>不含税金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.code }}</td>
            <td>
              <button @click="openDetail(item.id)">
                {{ item.contractName }}
              </button>
            </td>
            <td>{{ item.contractType }}</td>
            <td>{{ item.taxExclusiveAmount }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="['DRAFT', 'RETURNED'].includes(item.status)"
                @click="
                  submitApproval(
                    'CONTRACT',
                    item.id,
                    `合同审批：${item.contractName}`,
                    Number(item.taxExclusiveAmount),
                  )
                "
              >
                提交审批</button
              ><button
                v-if="item.status === 'PENDING_SIGNATURE'"
                @click="activate(item)"
              >
                确认生效
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无合同</p>
    </section>
    <section v-if="selected" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">
            {{ selected.code }} · V{{ selected.contractVersion }}
          </p>
          <h2>{{ selected.contractName }}</h2>
        </div>
        <button @click="selected = null">关闭详情</button>
      </header>
      <p>
        状态：{{ selected.status }}　含税金额：¥
        {{ selected.taxInclusiveAmount }}　到期日：{{
          selected.expiresOn || "未设置"
        }}
      </p>
      <form
        v-if="selected.status === 'PERFORMING'"
        class="entity-form"
        @submit.prevent="createChange"
      >
        <h3 class="wide">合同变更申请</h3>
        <label
          >变更类型<select v-model="changeForm.changeType">
            <option value="AMOUNT">金额</option>
            <option value="TERM">期限</option>
            <option value="SCOPE">范围</option>
            <option value="COMPOSITE">综合</option>
          </select></label
        ><label
          >新含税金额<input
            v-model.number="changeForm.newTaxInclusiveAmount"
            type="number"
            min="0"
            step="0.01"
            required /></label
        ><label
          >新不含税金额<input
            v-model.number="changeForm.newTaxExclusiveAmount"
            type="number"
            min="0"
            step="0.01"
            required /></label
        ><label
          >新税率<input
            v-model.number="changeForm.newTaxRate"
            type="number"
            min="0"
            max="1"
            step="0.000001"
            required /></label
        ><label
          >新税额<input
            v-model.number="changeForm.newTaxAmount"
            type="number"
            min="0"
            step="0.01"
            required /></label
        ><label
          >新到期日<input v-model="changeForm.newEndOn" type="date" /></label
        ><label
          >生效日<input
            v-model="changeForm.effectiveOn"
            type="date"
            required /></label
        ><label class="wide"
          >变更内容<textarea
            v-model="changeForm.changeContent"
            required
            minlength="2"
          ></textarea></label
        ><label class="wide"
          >变更原因<textarea
            v-model="changeForm.reason"
            required
            minlength="2"
          ></textarea></label
        ><button :disabled="saving">创建并提交审批</button>
      </form>
      <h3>变更历史</h3>
      <article v-for="change in changes" :key="change.id" class="data-row">
        <div>
          <strong>{{ change.changeCode }} · {{ change.status }}</strong>
          <p>
            ¥ {{ change.originalTaxInclusiveAmount }} → ¥
            {{ change.newTaxInclusiveAmount }}（净变更
            {{ change.netChangeAmount }}）
          </p>
          <small>{{ change.reason }}</small>
        </div>
      </article>
      <p v-if="!changes.length">暂无变更</p>
      <form
        v-if="
          ['PENDING_SIGNATURE', 'PERFORMING', 'CHANGED'].includes(
            selected.status,
          )
        "
        class="entity-form"
        @submit.prevent="createMilestone"
      >
        <h3 class="wide">新增履约节点</h3>
        <label
          >类型<select v-model="milestoneForm.milestoneType">
            <option value="DELIVERY">交付</option>
            <option value="ACCEPTANCE">验收</option>
            <option value="INVOICE">开票</option>
            <option value="PAYMENT">收付款</option>
            <option value="OTHER">其他</option>
          </select></label
        ><label
          >名称<input
            v-model="milestoneForm.milestoneName"
            required
            minlength="2" /></label
        ><label
          >计划日期<input
            v-model="milestoneForm.plannedOn"
            type="date"
            required /></label
        ><label
          >计划金额<input
            v-model.number="milestoneForm.plannedAmount"
            type="number"
            min="0"
            step="0.01" /></label
        ><label class="wide"
          >完成条件<textarea
            v-model="milestoneForm.conditionDescription"
          ></textarea></label
        ><button :disabled="saving">保存节点</button>
      </form>
      <h3>履约节点</h3>
      <article
        v-for="milestone in milestones"
        :key="milestone.id"
        class="data-row"
      >
        <div>
          <strong
            >{{ milestone.milestoneName }} · {{ milestone.status }}</strong
          >
          <p>
            {{ milestone.milestoneType }} · 计划 {{ milestone.plannedOn
            }}<span v-if="milestone.completedOn">
              · 完成 {{ milestone.completedOn }}</span
            >
          </p>
        </div>
        <button
          v-if="milestone.status === 'PENDING'"
          @click="completeMilestone(milestone)"
        >
          确认完成
        </button>
      </article>
      <p v-if="!milestones.length">暂无履约节点</p>
    </section>
  </main>
</template>
