<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";

interface Option {
  id: string;
  name?: string;
  projectName?: string;
  contractName?: string;
  contractType?: string;
  projectId?: string;
}
interface InvoiceApplication {
  id: string;
  code: string;
  projectId: string;
  contractId: string;
  requestedAmount: string;
}
interface ReceiptDocument {
  id: string;
  code: string;
  projectId: string;
  contractId: string;
  amount: string;
  allocatedAmount: string;
  receiptType: string;
}
interface InvoiceDocument {
  id: string;
  invoiceNumber: string;
  projectId: string;
  contractId: string;
  amount: string;
  allocatedAmount: string;
}
const modules = [
  ["开票申请", "合同额度控制"],
  ["销项发票", "开票与红冲"],
  ["收款登记", "预收与正常收款"],
  ["发票核销", "一收多票、一票多收"],
  ["费用报销", "主表与明细汇总"],
  ["项目付款", "多次付款明细"],
  ["日常采购", "非项目费用与采购审批"],
];
const auth = useAuthStore(),
  summary = ref({
    invoicedAmount: "0.00",
    receivedAmount: "0.00",
    paidAmount: "0.00",
  }),
  projects = ref<Option[]>([]),
  contracts = ref<Option[]>([]),
  customers = ref<Option[]>([]),
  invoiceApplications = ref<InvoiceApplication[]>([]),
  receipts = ref<ReceiptDocument[]>([]),
  salesInvoices = ref<InvoiceDocument[]>([]),
  error = ref<string | null>(null),
  mode = ref<
    | "INVOICE"
    | "RECEIPT"
    | "REIMBURSEMENT"
    | "PAYMENT"
    | "PURCHASE"
    | "SALES_INVOICE"
    | "ALLOCATION"
    | null
  >(null),
  saving = ref(false);
const today = new Date().toISOString().slice(0, 10);
const invoice = ref({
  projectId: "",
  contractId: "",
  requestedAmount: 0,
  invoiceType: "VAT_NORMAL",
  taxRate: 0.06,
  invoiceContent: "",
  buyerInformation: "",
  plannedInvoiceOn: today,
  collectionCondition: "",
});
const receipt = ref({
  projectId: "",
  contractId: "",
  customerId: "",
  receivedOn: today,
  amount: 0,
  receivingAccount: "",
  payerName: "",
  payerAccount: "",
  receiptType: "NORMAL",
  voucherNumber: "",
});
const reimbursement = ref({
  projectId: "",
  reason: "",
  paymentRecipient: "",
  receivingAccount: "",
  expenseType: "TRAVEL",
  incurredOn: today,
  amount: 0,
  description: "",
  hasInvoice: false,
  invoiceNumber: "",
  invoicingParty: "",
});
const payment = ref({
  projectId: "",
  sourceId: "",
  recipientName: "",
  paymentType: "CONTRACT_PAYMENT",
  requestedAmount: 0,
  plannedOn: today,
  paymentBasis: "",
  receivingAccount: "",
  invoiceRequired: true,
});
const purchase = ref({
  purchaseType: "OFFICE",
  supplierId: "",
  itemDescription: "",
  quantity: 1,
  budgetAmount: 0,
  purpose: "",
  expectedOn: today,
  paymentMethod: "TRANSFER",
  contractRelated: false,
  contractId: "",
});
const salesInvoice = ref({
  applicationId: "",
  invoiceNumber: "",
  invoiceCode: "",
  invoicedOn: today,
  taxInclusiveAmount: 0,
  taxExclusiveAmount: 0,
  taxAmount: 0,
  buyerName: "",
});
const allocation = ref({
  receiptId: "",
  invoiceId: "",
  allocationAmount: 0,
  allocatedOn: today,
});

async function load() {
  try {
    const [s, p, c, o, documents] = await Promise.all([
      callApi<typeof summary.value>("finance.summary", {}),
      callApi<{ items: Option[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("contract.list", { page: 1, pageSize: 50 }),
      callApi<{ items: Option[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
      callApi<{
        applications: InvoiceApplication[];
        receipts: ReceiptDocument[];
        invoices: InvoiceDocument[];
      }>("finance.documents", {}),
    ]);
    summary.value = s;
    projects.value = p.items;
    contracts.value = c.items;
    customers.value = o.items;
    invoiceApplications.value = documents.applications;
    receipts.value = documents.receipts;
    salesInvoices.value = documents.invoices;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
onMounted(load);
async function createInvoice() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("invoice.application.create", {
      ...invoice.value,
      collectionCondition: invoice.value.collectionCondition || null,
      applicantId: auth.user.id,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createReceipt() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("receipt.create", {
      ...receipt.value,
      payerAccount: receipt.value.payerAccount || null,
      voucherNumber: receipt.value.voucherNumber || null,
      operatorId: auth.user.employeeId,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createSalesInvoice() {
  saving.value = true;
  error.value = null;
  try {
    await callApi("sales.invoice.create", {
      ...salesInvoice.value,
      invoiceCode: salesInvoice.value.invoiceCode || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function allocateReceipt() {
  saving.value = true;
  error.value = null;
  try {
    await callApi("receipt.invoice.allocate", allocation.value);
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "核销失败";
  } finally {
    saving.value = false;
  }
}
async function createReimbursement() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = reimbursement.value;
    await callApi("reimbursement.create", {
      claimantId: auth.user.employeeId,
      departmentId: auth.user.departmentId,
      projectId: f.projectId || null,
      reason: f.reason,
      paymentRecipient: f.paymentRecipient,
      receivingAccount: f.receivingAccount,
      details: [
        {
          expenseType: f.expenseType,
          incurredOn: f.incurredOn,
          amount: f.amount,
          description: f.description,
          hasInvoice: f.hasInvoice,
          invoiceNumber: f.invoiceNumber || null,
          invoicingParty: f.invoicingParty || null,
        },
      ],
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createPayment() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("payment.application.create", {
      ...payment.value,
      sourceType: "EXPENSE_CONTRACT",
      operatorId: auth.user.employeeId,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createPurchase() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = purchase.value;
    await callApi("daily.purchase.create", {
      ...f,
      applicantId: auth.user.employeeId,
      departmentId: auth.user.departmentId,
      supplierId: f.supplierId || null,
      contractId: f.contractRelated ? f.contractId : null,
    });
    mode.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CASH & BILLING</p>
        <h1>收支管理</h1>
      </div>
      <div class="header-actions">
        <button class="primary-action" @click="mode = 'INVOICE'">
          申请开票</button
        ><button class="primary-action" @click="mode = 'RECEIPT'">
          登记收款</button
        ><button class="primary-action" @click="mode = 'SALES_INVOICE'">
          完成开票</button
        ><button class="primary-action" @click="mode = 'ALLOCATION'">
          收款核销</button
        ><button class="primary-action" @click="mode = 'REIMBURSEMENT'">
          费用报销</button
        ><button class="primary-action" @click="mode = 'PAYMENT'">
          申请付款</button
        ><button class="primary-action" @click="mode = 'PURCHASE'">
          日常采购
        </button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="contract-panels">
      <article>
        <p>累计开票</p>
        <strong>¥ {{ summary.invoicedAmount }}</strong
        ><small>有效销项发票</small>
      </article>
      <article>
        <p>累计收款</p>
        <strong>¥ {{ summary.receivedAmount }}</strong
        ><small>实际到账</small>
      </article>
      <article>
        <p>累计支付</p>
        <strong>¥ {{ summary.paidAmount }}</strong
        ><small>实际经营付款</small>
      </article>
    </section>
    <form
      v-if="mode === 'INVOICE'"
      class="entity-form"
      @submit.prevent="createInvoice"
    >
      <label
        >项目<select v-model="invoice.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >收入合同<select v-model="invoice.contractId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="c in contracts.filter(
              (x) =>
                x.contractType === 'INCOME' &&
                (!invoice.projectId || x.projectId === invoice.projectId),
            )"
            :key="c.id"
            :value="c.id"
          >
            {{ c.contractName }}
          </option>
        </select></label
      ><label
        >申请金额<input
          v-model.number="invoice.requestedAmount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >发票类型<select v-model="invoice.invoiceType">
          <option value="VAT_NORMAL">增值税普通发票</option>
          <option value="VAT_SPECIAL">增值税专用发票</option>
          <option value="OTHER">其他</option>
        </select></label
      ><label
        >税率<input
          v-model.number="invoice.taxRate"
          type="number"
          min="0"
          max="1"
          step="0.000001"
          required /></label
      ><label
        >计划开票日<input
          v-model="invoice.plannedInvoiceOn"
          type="date"
          required /></label
      ><label class="wide"
        >开票内容<textarea
          v-model="invoice.invoiceContent"
          required
        ></textarea></label
      ><label class="wide"
        >购买方信息<textarea
          v-model="invoice.buyerInformation"
          required
        ></textarea></label
      ><label class="wide"
        >收款条件<textarea
          v-model="invoice.collectionCondition"
        ></textarea></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存开票申请" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'RECEIPT'"
      class="entity-form"
      @submit.prevent="createReceipt"
    >
      <label
        >项目<select v-model="receipt.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >收入合同<select v-model="receipt.contractId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="c in contracts.filter(
              (x) =>
                x.contractType === 'INCOME' &&
                (!receipt.projectId || x.projectId === receipt.projectId),
            )"
            :key="c.id"
            :value="c.id"
          >
            {{ c.contractName }}
          </option>
        </select></label
      ><label
        >客户<select v-model="receipt.customerId" required>
          <option value="" disabled>请选择</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label
        >收款日期<input
          v-model="receipt.receivedOn"
          type="date"
          required /></label
      ><label
        >金额<input
          v-model.number="receipt.amount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >收款类型<select v-model="receipt.receiptType">
          <option value="NORMAL">正常收款</option>
          <option value="ADVANCE">预收款</option>
          <option value="OTHER">其他</option>
        </select></label
      ><label
        >收款账户<input v-model="receipt.receivingAccount" required /></label
      ><label>付款单位<input v-model="receipt.payerName" required /></label
      ><label>付款账号<input v-model="receipt.payerAccount" /></label
      ><label>凭证号<input v-model="receipt.voucherNumber" /></label
      ><button :disabled="saving">{{ saving ? "保存中…" : "保存收款" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'SALES_INVOICE'"
      class="entity-form"
      @submit.prevent="createSalesInvoice"
    >
      <label
        >已审批开票申请<select v-model="salesInvoice.applicationId" required>
          <option value="" disabled>请选择</option>
          <option v-for="a in invoiceApplications" :key="a.id" :value="a.id">
            {{ a.code }} · ¥{{ a.requestedAmount }}
          </option>
        </select></label
      >
      <label
        >发票号码<input v-model="salesInvoice.invoiceNumber" required /></label
      ><label>发票代码<input v-model="salesInvoice.invoiceCode" /></label
      ><label
        >开票日期<input v-model="salesInvoice.invoicedOn" type="date" required
      /></label>
      <label
        >价税合计<input
          v-model.number="salesInvoice.taxInclusiveAmount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >不含税金额<input
          v-model.number="salesInvoice.taxExclusiveAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >税额<input
          v-model.number="salesInvoice.taxAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label>购买方<input v-model="salesInvoice.buyerName" required /></label>
      <button :disabled="saving">
        {{ saving ? "保存中…" : "保存销项发票" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'ALLOCATION'"
      class="entity-form"
      @submit.prevent="allocateReceipt"
    >
      <label
        >收款<select v-model="allocation.receiptId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="r in receipts.filter((x) => x.receiptType !== 'ADVANCE')"
            :key="r.id"
            :value="r.id"
          >
            {{ r.code }} · 余额 ¥{{
              (Number(r.amount) - Number(r.allocatedAmount)).toFixed(2)
            }}
          </option>
        </select></label
      >
      <label
        >发票<select v-model="allocation.invoiceId" required>
          <option value="" disabled>请选择</option>
          <option v-for="i in salesInvoices" :key="i.id" :value="i.id">
            {{ i.invoiceNumber }} · 余额 ¥{{
              (Number(i.amount) - Number(i.allocatedAmount)).toFixed(2)
            }}
          </option>
        </select></label
      >
      <label
        >核销金额<input
          v-model.number="allocation.allocationAmount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >核销日期<input v-model="allocation.allocatedOn" type="date" required
      /></label>
      <button :disabled="saving">{{ saving ? "核销中…" : "确认核销" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'REIMBURSEMENT'"
      class="entity-form"
      @submit.prevent="createReimbursement"
    >
      <label
        >关联项目<select v-model="reimbursement.projectId">
          <option value="">无</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >报销事由<input
          v-model="reimbursement.reason"
          required
          minlength="2" /></label
      ><label
        >收款人<input
          v-model="reimbursement.paymentRecipient"
          required /></label
      ><label
        >收款账户<input
          v-model="reimbursement.receivingAccount"
          required /></label
      ><label
        >费用类型<input v-model="reimbursement.expenseType" required /></label
      ><label
        >发生日期<input
          v-model="reimbursement.incurredOn"
          type="date"
          required /></label
      ><label
        >金额<input
          v-model.number="reimbursement.amount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >费用说明<input v-model="reimbursement.description" required /></label
      ><label
        ><input v-model="reimbursement.hasInvoice" type="checkbox" />
        已取得发票</label
      ><label v-if="reimbursement.hasInvoice"
        >发票号<input v-model="reimbursement.invoiceNumber" /></label
      ><label v-if="reimbursement.hasInvoice"
        >开票方<input v-model="reimbursement.invoicingParty" /></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存报销单" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'PAYMENT'"
      class="entity-form"
      @submit.prevent="createPayment"
    >
      <label
        >项目<select v-model="payment.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >支出合同<select v-model="payment.sourceId" required>
          <option value="" disabled>请选择</option>
          <option
            v-for="c in contracts.filter(
              (x) =>
                x.contractType === 'EXPENSE' &&
                (!payment.projectId || x.projectId === payment.projectId),
            )"
            :key="c.id"
            :value="c.id"
          >
            {{ c.contractName }}
          </option>
        </select></label
      ><label>收款方<input v-model="payment.recipientName" required /></label
      ><label>付款类型<input v-model="payment.paymentType" required /></label
      ><label
        >申请金额<input
          v-model.number="payment.requestedAmount"
          type="number"
          min="0.01"
          step="0.01"
          required /></label
      ><label
        >计划付款日<input
          v-model="payment.plannedOn"
          type="date"
          required /></label
      ><label class="wide"
        >付款依据<textarea
          v-model="payment.paymentBasis"
          required
        ></textarea></label
      ><label
        >收款账户<input v-model="payment.receivingAccount" required /></label
      ><label
        ><input v-model="payment.invoiceRequired" type="checkbox" />
        需要发票</label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存付款申请" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'PURCHASE'"
      class="entity-form"
      @submit.prevent="createPurchase"
    >
      <label>采购类型<input v-model="purchase.purchaseType" required /></label
      ><label
        >供应商<select v-model="purchase.supplierId">
          <option value="">待定</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label class="wide"
        >物品/服务<textarea
          v-model="purchase.itemDescription"
          required
        ></textarea></label
      ><label
        >数量<input
          v-model.number="purchase.quantity"
          type="number"
          min="0.0001"
          step="0.0001"
          required /></label
      ><label
        >预算金额<input
          v-model.number="purchase.budgetAmount"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >期望日期<input
          v-model="purchase.expectedOn"
          type="date"
          required /></label
      ><label>付款方式<input v-model="purchase.paymentMethod" required /></label
      ><label class="wide"
        >用途<textarea v-model="purchase.purpose" required></textarea></label
      ><label
        ><input v-model="purchase.contractRelated" type="checkbox" />
        关联合同</label
      ><label v-if="purchase.contractRelated"
        >合同<select v-model="purchase.contractId" required>
          <option value="" disabled>请选择</option>
          <option v-for="c in contracts" :key="c.id" :value="c.id">
            {{ c.contractName }}
          </option>
        </select></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存采购申请" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <section class="module-grid">
      <article
        v-for="([title, detail], i) in modules"
        :key="title"
        class="module-card"
      >
        <span class="module-icon">{{ i + 1 }}</span>
        <h2>{{ title }}</h2>
        <p>{{ detail }}</p>
      </article>
    </section>
  </main>
</template>
