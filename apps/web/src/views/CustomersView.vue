<script setup lang="ts">
import type { CounterpartySummary } from "@zkgl/shared";
import { computed, onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";

interface ContactRecord {
  id: string;
  name: string;
  departmentName?: string;
  positionName?: string;
  mobile?: string;
  email?: string;
  isKeyContact: boolean;
}

interface VisitRecord {
  id: string;
  code: string;
  visitedAt: string;
  method: string;
  purpose: string;
  communication: string;
  nextAction?: string;
}

interface CounterpartyDetail {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  type: string;
  industry?: string | null;
  region?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  cooperationStatus: string;
  remark?: string | null;
  version: number;
}

interface Detail {
  counterparty: CounterpartyDetail;
  contacts: ContactRecord[];
  visits: VisitRecord[];
}

interface DictionaryOption {
  value: string;
  label: string;
}

const auth = useAuthStore();
const items = ref<CounterpartySummary[]>([]);
const detail = ref<Detail | null>(null);
const selectedId = ref("");
const showForm = ref(false);
const showEdit = ref(false);
const showContact = ref(false);
const showVisit = ref(false);
const saving = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const activeSection = ref<"counterparties" | "contacts" | "visits">(
  "counterparties",
);
const pageSize = 6;
const currentPage = ref(1);
const totalItems = ref(0);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalItems.value / pageSize)),
);
const pageStart = computed(() =>
  totalItems.value ? (currentPage.value - 1) * pageSize + 1 : 0,
);
const pageEnd = computed(() =>
  Math.min(currentPage.value * pageSize, totalItems.value),
);
const selectedCounterpartyName = computed(
  () => detail.value?.counterparty.name || "未选择往来单位",
);

const defaultTypeOptions = [
  { value: "CUSTOMER", label: "客户" },
  { value: "SUPPLIER", label: "供应商" },
  { value: "GENERAL_CONTRACTOR", label: "总包单位" },
  { value: "PARTNER", label: "合作伙伴" },
  { value: "OTHER", label: "其他" },
];

const defaultCooperationStatusOptions = [
  { value: "POTENTIAL", label: "潜在合作" },
  { value: "ACTIVE", label: "合作中" },
  { value: "SUSPENDED", label: "暂停合作" },
  { value: "ENDED", label: "已结束" },
];

const defaultIndustryOptions = [
  { value: "政府/事业单位", label: "政府/事业单位" },
  { value: "建筑工程", label: "建筑工程" },
  { value: "信息化/软件", label: "信息化/软件" },
  { value: "园区/地产", label: "园区/地产" },
  { value: "能源环保", label: "能源环保" },
  { value: "教育医疗", label: "教育医疗" },
  { value: "金融服务", label: "金融服务" },
  { value: "制造业", label: "制造业" },
  { value: "其他", label: "其他" },
];
const typeOptions = ref<DictionaryOption[]>(defaultTypeOptions);
const cooperationStatusOptions = ref<DictionaryOption[]>(
  defaultCooperationStatusOptions,
);
const industryOptions = ref<DictionaryOption[]>(defaultIndustryOptions);

const form = ref({
  name: "",
  shortName: "",
  type: "CUSTOMER",
  industry: "",
  address: "",
  phone: "",
  cooperationStatus: "POTENTIAL",
  remark: "",
});

const editForm = ref({
  name: "",
  shortName: "",
  type: "CUSTOMER",
  industry: "",
  address: "",
  phone: "",
  cooperationStatus: "POTENTIAL",
  remark: "",
  version: 0,
});

const contact = ref({
  name: "",
  departmentName: "",
  positionName: "",
  mobile: "",
  email: "",
  isKeyContact: false,
  relationshipLevel: "NORMAL",
  decisionRole: "",
  remark: "",
});

const visit = ref({
  contactId: "",
  visitedAt: new Date().toISOString().slice(0, 16),
  method: "ONSITE",
  location: "",
  purpose: "",
  communication: "",
  customerNeeds: "",
  opportunityAssessment: "",
  nextAction: "",
  nextFollowUpAt: "",
  generateLead: false,
});

function switchSection(section: "counterparties" | "contacts" | "visits") {
  activeSection.value = section;
  if (section !== "counterparties") showForm.value = false;
  if (section !== "contacts") showContact.value = false;
  if (section !== "visits") showVisit.value = false;
}

function openCounterpartyForm() {
  activeSection.value = "counterparties";
  showForm.value = !showForm.value;
  showContact.value = false;
  showVisit.value = false;
}

function openContactForm() {
  activeSection.value = "contacts";
  showContact.value = !showContact.value;
  showForm.value = false;
  showVisit.value = false;
}

function openVisitForm() {
  activeSection.value = "visits";
  showVisit.value = !showVisit.value;
  showForm.value = false;
  showContact.value = false;
}

const modules = [
  {
    title: "往来单位",
    description: "客户、供应商、总包单位与合作伙伴统一档案",
    permission: "crm.counterparty.read",
  },
  {
    title: "联系人",
    description: "联系人、关键关系与决策角色",
    permission: "crm.contact.read",
  },
  {
    title: "客户拜访",
    description: "拜访记录、下一步计划与线索生成",
    permission: "crm.visit.read",
  },
];

const selectedCounterpartySummary = computed(() =>
  detail.value
    ? `${detail.value.counterparty.code} · ${typeText(
        detail.value.counterparty.type,
      )} · ${cooperationStatusText(detail.value.counterparty.cooperationStatus)}`
    : "",
);

function typeText(value?: string | null) {
  return (
    typeOptions.value.find((item) => item.value === value)?.label ||
    value ||
    "-"
  );
}

function cooperationStatusText(value?: string | null) {
  return (
    cooperationStatusOptions.value.find((item) => item.value === value)?.label ||
    value ||
    "-"
  );
}

function applyDictionaryOptions(
  typeCode: string,
  items: Array<{ typeCode: string; label: string; valueText: string }>,
  fallback: DictionaryOption[],
) {
  const options = items
    .filter((item) => item.typeCode === typeCode)
    .map((item) => ({ value: item.valueText, label: item.label }));
  return options.length ? options : fallback;
}

async function loadCrmOptions() {
  try {
    const result = await callApi<{
      items: Array<{ typeCode: string; label: string; valueText: string }>;
    }>("dictionary.crmOptions", {});
    typeOptions.value = applyDictionaryOptions(
      "CRM_COUNTERPARTY_TYPE",
      result.items,
      defaultTypeOptions,
    );
    cooperationStatusOptions.value = applyDictionaryOptions(
      "CRM_COOPERATION_STATUS",
      result.items,
      defaultCooperationStatusOptions,
    );
    industryOptions.value = applyDictionaryOptions(
      "CRM_INDUSTRY",
      result.items,
      defaultIndustryOptions,
    );
  } catch {
    typeOptions.value = defaultTypeOptions;
    cooperationStatusOptions.value = defaultCooperationStatusOptions;
    industryOptions.value = defaultIndustryOptions;
  }
}

async function load(page = currentPage.value) {
  loading.value = true;
  error.value = null;
  try {
    const requestedPage = Math.max(1, page);
    const result = await callApi<{
      items: CounterpartySummary[];
      page: number;
      pageSize: number;
      total?: number;
    }>("crm.counterparty.list", { page: requestedPage, pageSize });
    const total = Number(result.total ?? result.items.length);
    if (!result.items.length && total > 0 && requestedPage > 1) {
      await load(Math.max(1, Math.ceil(total / pageSize)));
      return;
    }
    items.value = result.items;
    totalItems.value = total;
    currentPage.value = result.page || requestedPage;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  await load(page);
}

async function loadDetail(id: string) {
  selectedId.value = id;
  try {
    detail.value = await callApi<Detail>("crm.counterparty.detail", {
      counterpartyId: id,
    });
    showEdit.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载详情失败";
  }
}

async function createCounterparty() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const created = await callApi<{ id?: string }>("crm.counterparty.create", {
      ...form.value,
      shortName: form.value.shortName || null,
      industry: form.value.industry || null,
      region: null,
      address: form.value.address || null,
      phone: form.value.phone || null,
      cooperationStatus: form.value.cooperationStatus,
      remark: form.value.remark || null,
    });
    showForm.value = false;
    form.value = {
      name: "",
      shortName: "",
      type: "CUSTOMER",
      industry: "",
      address: "",
      phone: "",
      cooperationStatus: "POTENTIAL",
      remark: "",
    };
    await load(1);
    if (created.id) await loadDetail(created.id);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

function startEditCounterparty() {
  if (!detail.value) return;
  const item = detail.value.counterparty;
  editForm.value = {
    name: item.name,
    shortName: item.shortName || "",
    type: item.type || "CUSTOMER",
    industry: item.industry || "",
    address: item.address || item.region || "",
    phone: item.phone || "",
    cooperationStatus: item.cooperationStatus || "POTENTIAL",
    remark: item.remark || "",
    version: Number(item.version ?? 0),
  };
  showEdit.value = true;
}

async function updateCounterparty() {
  if (!auth.user || !detail.value) return;
  saving.value = true;
  error.value = null;
  try {
    const f = editForm.value;
    const id = detail.value.counterparty.id;
    await callApi("crm.counterparty.update", {
      counterpartyId: id,
      name: f.name,
      shortName: f.shortName || null,
      type: f.type,
      industry: f.industry || null,
      region: null,
      address: f.address || null,
      phone: f.phone || null,
      cooperationStatus: f.cooperationStatus,
      remark: f.remark || null,
      version: f.version,
    });
    showEdit.value = false;
    await load(currentPage.value);
    await loadDetail(id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "往来单位更新失败";
  } finally {
    saving.value = false;
  }
}

async function deleteCounterparty() {
  if (!auth.user || !detail.value) return;
  const item = detail.value.counterparty;
  if (!window.confirm(`确认删除往来单位“${item.name}”？已关联业务不会被删除。`))
    return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("crm.counterparty.delete", {
      counterpartyId: item.id,
      version: Number(item.version ?? 0),
    });
    detail.value = null;
    selectedId.value = "";
    showEdit.value = false;
    await load(currentPage.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "往来单位删除失败";
  } finally {
    saving.value = false;
  }
}

async function createContact() {
  if (!auth.user || !selectedId.value) return;
  saving.value = true;
  try {
    const f = contact.value;
    await callApi("crm.contact.create", {
      counterpartyId: selectedId.value,
      ...f,
      gender: null,
      departmentName: f.departmentName || null,
      positionName: f.positionName || null,
      mobile: f.mobile || null,
      phone: null,
      email: f.email || null,
      wechat: null,
      relationshipLevel: f.relationshipLevel || null,
      decisionRole: f.decisionRole || null,
      remark: f.remark || null,
    });
    showContact.value = false;
    await loadDetail(selectedId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function createVisit() {
  if (!auth.user || !selectedId.value) return;
  saving.value = true;
  try {
    const f = visit.value;
    await callApi("crm.visit.create", {
      customerId: selectedId.value,
      ...f,
      contactId: f.contactId || null,
      visitedAt: new Date(f.visitedAt).toISOString(),
      location: f.location || null,
      participantIds: [auth.user.employeeId],
      customerNeeds: f.customerNeeds || null,
      opportunityAssessment: f.opportunityAssessment || null,
      nextAction: f.nextAction || null,
      nextFollowUpAt: f.nextFollowUpAt
        ? new Date(f.nextFollowUpAt).toISOString()
        : null,
    });
    showVisit.value = false;
    await loadDetail(selectedId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadCrmOptions();
  await load();
});
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CRM</p>
        <h1>客户管理</h1>
      </div>
      <div class="header-actions">
        <button class="primary-action" @click="openCounterpartyForm">
          新增往来单位</button
        ><button
          class="primary-action"
          :disabled="!selectedId"
          @click="openContactForm"
        >
          新增联系人</button
        ><button
          class="primary-action"
          :disabled="!selectedId"
          @click="openVisitForm"
        >
          登记拜访
        </button>
      </div>
    </header>

    <nav class="crm-subnav" aria-label="客户管理分类">
      <button
        type="button"
        :class="{ active: activeSection === 'counterparties' }"
        @click="switchSection('counterparties')"
      >
        <strong>往来单位</strong>
        <span>客户、供应商、合作伙伴档案</span>
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'contacts' }"
        @click="switchSection('contacts')"
      >
        <strong>联系人</strong>
        <span>围绕当前单位维护联系人</span>
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'visits' }"
        @click="switchSection('visits')"
      >
        <strong>拜访记录</strong>
        <span>记录沟通、跟进和线索</span>
      </button>
    </nav>

    <div v-if="selectedId" class="crm-context-bar">
      <span>当前单位</span>
      <strong>{{ selectedCounterpartyName }}</strong>
      <button type="button" @click="switchSection('counterparties')">
        查看单位信息
      </button>
      <button type="button" @click="openContactForm">新增联系人</button>
      <button type="button" @click="openVisitForm">登记拜访</button>
    </div>

    <form
      v-if="activeSection === 'counterparties' && showForm"
      class="entity-form"
      @submit.prevent="createCounterparty"
    >
      <label
        >单位名称<input
          v-model="form.name"
          required
          minlength="2"
          maxlength="255"
      /></label>
      <label>单位简称<input v-model="form.shortName" maxlength="128" /></label>
      <label
        >单位类型<select v-model="form.type">
          <option
            v-for="option in typeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label
        >所属行业<select v-model="form.industry">
          <option value="">请选择</option>
          <option
            v-for="option in industryOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label>地址<input v-model="form.address" maxlength="512" /></label>
      <label
        >合作状态<select v-model="form.cooperationStatus">
          <option
            v-for="option in cooperationStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label>电话<input v-model="form.phone" maxlength="32" /></label>
      <label class="wide"
        >备注<textarea v-model="form.remark" maxlength="1000"></textarea>
      </label>
      <button type="submit" :disabled="saving">
        {{ saving ? "保存中…" : "保存单位" }}
      </button>
    </form>

    <form
      v-if="activeSection === 'counterparties' && showEdit"
      class="entity-form"
      @submit.prevent="updateCounterparty"
    >
      <h2 class="wide">修改往来单位</h2>
      <label>单位名称<input v-model="editForm.name" required /></label>
      <label>单位简称<input v-model="editForm.shortName" maxlength="128" /></label>
      <label
        >单位类型<select v-model="editForm.type">
          <option
            v-for="option in typeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label
        >所属行业<select v-model="editForm.industry">
          <option value="">请选择</option>
          <option
            v-for="option in industryOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label>地址<input v-model="editForm.address" maxlength="512" /></label>
      <label
        >合作状态<select v-model="editForm.cooperationStatus">
          <option
            v-for="option in cooperationStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label>电话<input v-model="editForm.phone" maxlength="32" /></label>
      <label class="wide"
        >备注<textarea v-model="editForm.remark" maxlength="1000"></textarea>
      </label>
      <button type="submit" :disabled="saving">保存修改</button>
      <button type="button" @click="showEdit = false">取消</button>
    </form>

    <form
      v-if="activeSection === 'contacts' && showContact && selectedId"
      class="entity-form"
      @submit.prevent="createContact"
    >
      <label>姓名<input v-model="contact.name" required /></label
      ><label>部门<input v-model="contact.departmentName" /></label
      ><label>职务<input v-model="contact.positionName" /></label
      ><label>手机<input v-model="contact.mobile" /></label
      ><label>邮箱<input v-model="contact.email" type="email" /></label
      ><label
        ><input v-model="contact.isKeyContact" type="checkbox" />
        关键联系人</label
      ><label
        >关系程度<select v-model="contact.relationshipLevel">
          <option value="NORMAL">一般</option>
          <option value="GOOD">良好</option>
          <option value="STRONG">密切</option>
        </select></label
      ><label>决策角色<input v-model="contact.decisionRole" /></label
      ><button :disabled="saving">保存联系人</button>
    </form>

    <form
      v-if="activeSection === 'visits' && showVisit && selectedId"
      class="entity-form"
      @submit.prevent="createVisit"
    >
      <label
        >联系人<select v-model="visit.contactId">
          <option value="">无</option>
          <option v-for="c in detail?.contacts || []" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label
        >拜访时间<input
          v-model="visit.visitedAt"
          type="datetime-local"
          required /></label
      ><label
        >方式<select v-model="visit.method">
          <option value="ONSITE">上门</option>
          <option value="PHONE">电话</option>
          <option value="VIDEO">视频</option>
          <option value="OTHER">其他</option>
        </select></label
      ><label>地点<input v-model="visit.location" /></label
      ><label class="wide"
        >拜访目的<textarea v-model="visit.purpose" required></textarea></label
      ><label class="wide"
        >沟通内容<textarea
          v-model="visit.communication"
          required
        ></textarea></label
      ><label class="wide"
        >客户需求<textarea v-model="visit.customerNeeds"></textarea></label
      ><label class="wide"
        >机会判断<textarea
          v-model="visit.opportunityAssessment"
        ></textarea></label
      ><label class="wide"
        >下一步<textarea v-model="visit.nextAction"></textarea></label
      ><label
        ><input v-model="visit.generateLead" type="checkbox" />
        同时生成线索</label
      ><button :disabled="saving">保存拜访</button>
    </form>

    <div v-if="activeSection === 'counterparties'" class="customer-workspace">
    <section class="data-panel list-panel">
      <h2>最近往来单位</h2>
      <p v-if="loading">正在加载…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <table v-else-if="items.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>类型</th>
            <th>合作状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="clickable"
            :class="{ selected: item.id === selectedId }"
            @click="loadDetail(item.id)"
          >
            <td>{{ item.code }}</td>
            <td>{{ item.name }}</td>
            <td>{{ typeText(item.type) }}</td>
            <td>{{ cooperationStatusText(item.cooperationStatus) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !error && totalItems > pageSize" class="pager">
        <button
          type="button"
          class="secondary-button"
          :disabled="currentPage <= 1"
          @click="goToPage(currentPage - 1)"
        >
          上一页
        </button>
        <span
          >第 {{ currentPage }} / {{ totalPages }} 页，显示
          {{ pageStart }}-{{ pageEnd }} 条，共 {{ totalItems }} 条</span
        >
        <button
          type="button"
          class="secondary-button"
          :disabled="currentPage >= totalPages"
          @click="goToPage(currentPage + 1)"
        >
          下一页
        </button>
      </div>
      <p v-if="!loading && !error && !items.length">暂无往来单位</p>
    </section>

    <section v-if="detail" class="data-panel detail-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">单位详情</p>
          <h2>{{ detail.counterparty.name }}</h2>
          <p>{{ selectedCounterpartySummary }}</p>
        </div>
        <div class="detail-actions">
          <button class="secondary-button" @click="startEditCounterparty">
            修改单位
          </button>
          <button
            class="danger-button"
            :disabled="saving"
            @click="deleteCounterparty"
          >
            删除单位
          </button>
          <button
            class="secondary-button"
            @click="
              detail = null;
              selectedId = '';
              showEdit = false;
            "
          >
            关闭
          </button>
        </div>
      </header>

      <div class="detail-grid">
        <span>行业：{{ detail.counterparty.industry || "-" }}</span>
        <span
          >地址：{{
            detail.counterparty.address || detail.counterparty.region || "-"
          }}</span
        >
        <span>电话：{{ detail.counterparty.phone || "-" }}</span>
        <span>简称：{{ detail.counterparty.shortName || "-" }}</span>
      </div>

      <div class="module-grid">
        <article class="module-card">
          <h3>联系人</h3>
          <p v-for="c in detail.contacts" :key="c.id">
            {{ c.name }} · {{ c.positionName || "-" }} ·
            {{ c.mobile || c.email }}
          </p>
          <p v-if="!detail.contacts.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>拜访记录</h3>
          <p v-for="v in detail.visits" :key="v.id">
            {{ v.visitedAt }} · {{ v.purpose }}
          </p>
          <p v-if="!detail.visits.length">暂无</p>
        </article>
      </div>
    </section>
    </div>

    <section v-if="activeSection === 'contacts'" class="data-panel crm-related-panel">
      <header class="related-header">
        <div>
          <p class="eyebrow">联系人</p>
          <h2>{{ selectedCounterpartyName }}</h2>
        </div>
        <button
          class="primary-action"
          :disabled="!selectedId"
          @click="openContactForm"
        >
          新增联系人
        </button>
      </header>
      <p v-if="!selectedId" class="compact-tip">
        请先在“往来单位”中选择一个单位，再维护该单位的联系人。
      </p>
      <table v-else-if="detail?.contacts.length">
        <thead>
          <tr>
            <th>姓名</th>
            <th>部门</th>
            <th>职务</th>
            <th>手机</th>
            <th>邮箱</th>
            <th>关键联系人</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in detail.contacts" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.departmentName || "-" }}</td>
            <td>{{ c.positionName || "-" }}</td>
            <td>{{ c.mobile || "-" }}</td>
            <td>{{ c.email || "-" }}</td>
            <td>{{ c.isKeyContact ? "是" : "否" }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>当前单位暂无联系人，可点击“新增联系人”。</p>
    </section>

    <section v-if="activeSection === 'visits'" class="data-panel crm-related-panel">
      <header class="related-header">
        <div>
          <p class="eyebrow">拜访记录</p>
          <h2>{{ selectedCounterpartyName }}</h2>
        </div>
        <button
          class="primary-action"
          :disabled="!selectedId"
          @click="openVisitForm"
        >
          登记拜访
        </button>
      </header>
      <p v-if="!selectedId" class="compact-tip">
        请先在“往来单位”中选择一个单位，再登记该单位的拜访记录。
      </p>
      <table v-else-if="detail?.visits.length">
        <thead>
          <tr>
            <th>拜访时间</th>
            <th>方式</th>
            <th>目的</th>
            <th>沟通内容</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in detail.visits" :key="v.id">
            <td>{{ v.visitedAt }}</td>
            <td>{{ v.method }}</td>
            <td>{{ v.purpose }}</td>
            <td>{{ v.communication }}</td>
            <td>{{ v.nextAction || "-" }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>当前单位暂无拜访记录，可点击“登记拜访”。</p>
    </section>
  </main>
</template>

<style scoped>
.crm-subnav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.crm-subnav button {
  width: auto;
  margin: 0;
  padding: 16px 18px;
  border: 1px solid #d8e2ee;
  border-radius: 14px;
  background: #fff;
  color: #0b1f3a;
  text-align: left;
}

.crm-subnav button.active {
  border-color: #2f6bab;
  background: #eaf4ff;
  box-shadow: inset 0 -4px 0 #2f6bab;
}

.crm-subnav strong {
  display: block;
  font-size: 18px;
  margin-bottom: 6px;
}

.crm-subnav span {
  color: #66758a;
  font-size: 13px;
}

.crm-context-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding: 12px 16px;
  border: 1px solid #d8e2ee;
  border-radius: 12px;
  background: #fff;
}

.crm-context-bar span {
  color: #66758a;
}

.crm-context-bar strong {
  margin-right: auto;
}

.crm-context-bar button {
  width: auto;
  margin: 0;
  padding: 8px 12px;
  color: #245f9f;
  background: #e6f0fa;
}

.customer-workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  align-items: start;
}

.list-panel,
.detail-panel {
  margin-top: 0;
}

.list-panel table {
  table-layout: auto;
  min-width: 760px;
}

.list-panel td,
.list-panel th {
  vertical-align: middle;
}

.list-panel th:first-child,
.list-panel td:first-child {
  width: 170px;
}

.list-panel th:nth-child(3),
.list-panel td:nth-child(3),
.list-panel th:nth-child(4),
.list-panel td:nth-child(4) {
  width: 120px;
}

.list-panel td:nth-child(2) {
  white-space: normal;
  word-break: break-word;
}

.clickable.selected {
  background: #eaf4ff;
  box-shadow: inset 4px 0 0 #2f6bab;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e6edf5;
  color: #52647c;
  font-size: 14px;
}

.pager span {
  text-align: center;
  line-height: 1.6;
}

.related-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.related-header h2 {
  margin: 4px 0 0;
}

.related-header button {
  width: auto;
  margin: 0;
}

.compact-tip {
  margin: 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: #f6f9fc;
  color: #66758a;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.detail-actions button,
.pager button {
  width: auto;
  min-width: 96px;
  margin: 0;
  padding: 10px 16px;
}

.detail-actions .danger-button {
  min-width: 118px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin: 16px 0 22px;
}

.detail-grid span {
  padding: 10px 12px;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  background: #fbfdff;
  color: #4c5d75;
}

.danger-button {
  background: #fff1f1;
  color: #d14343;
}

@media (max-width: 900px) {
  .crm-subnav {
    grid-template-columns: 1fr;
  }

  .crm-context-bar,
  .related-header {
    align-items: stretch;
    flex-direction: column;
  }

  .crm-context-bar strong {
    margin-right: 0;
  }

  .pager {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
