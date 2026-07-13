<script setup lang="ts">
import type { CounterpartySummary } from "@zkgl/shared";
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";

const items = ref<CounterpartySummary[]>([]);
const auth = useAuthStore(),
  showForm = ref(false),
  showContact = ref(false),
  showVisit = ref(false),
  saving = ref(false);
interface ContactRecord {
  id: string;
  name: string;
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
interface Detail {
  counterparty: Record<string, string>;
  contacts: ContactRecord[];
  visits: VisitRecord[];
}
const detail = ref<Detail | null>(null),
  selectedId = ref("");
const form = ref({
  name: "",
  shortName: "",
  type: "CUSTOMER",
  industry: "",
  region: "",
  phone: "",
  remark: "",
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
const loading = ref(false);
const error = ref<string | null>(null);
async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await callApi<{ items: CounterpartySummary[] }>(
      "crm.counterparty.list",
      { page: 1, pageSize: 20 },
    );
    items.value = result.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
async function createCounterparty() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("crm.counterparty.create", {
      ...form.value,
      shortName: form.value.shortName || null,
      industry: form.value.industry || null,
      region: form.value.region || null,
      phone: form.value.phone || null,
      remark: form.value.remark || null,
      ownerId: auth.user.employeeId,
    });
    showForm.value = false;
    form.value = {
      name: "",
      shortName: "",
      type: "CUSTOMER",
      industry: "",
      region: "",
      phone: "",
      remark: "",
    };
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function loadDetail(id: string) {
  selectedId.value = id;
  try {
    detail.value = await callApi<Detail>("crm.counterparty.detail", {
      counterpartyId: id,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载详情失败";
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
      ownerId: auth.user.employeeId,
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
      ownerId: auth.user.employeeId,
    });
    showVisit.value = false;
    await loadDetail(selectedId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
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
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CRM</p>
        <h1>客户管理</h1>
      </div>
      <div class="header-actions">
        <button class="primary-action" @click="showForm = !showForm">
          新增往来单位</button
        ><button
          class="primary-action"
          :disabled="!selectedId"
          @click="showContact = !showContact"
        >
          新增联系人</button
        ><button
          class="primary-action"
          :disabled="!selectedId"
          @click="showVisit = !showVisit"
        >
          登记拜访
        </button>
      </div>
    </header>
    <form
      v-if="showForm"
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
          <option value="CUSTOMER">客户</option>
          <option value="SUPPLIER">供应商</option>
          <option value="GENERAL_CONTRACTOR">总包单位</option>
          <option value="PARTNER">合作伙伴</option>
          <option value="OTHER">其他</option>
        </select></label
      >
      <label>所属行业<input v-model="form.industry" maxlength="128" /></label
      ><label>地区<input v-model="form.region" maxlength="128" /></label
      ><label>电话<input v-model="form.phone" maxlength="32" /></label>
      <label class="wide"
        >备注<textarea v-model="form.remark" maxlength="1000"></textarea>
      </label>
      <button type="submit" :disabled="saving">
        {{ saving ? "保存中…" : "保存单位" }}
      </button>
    </form>
    <form
      v-if="showContact"
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
    <form v-if="showVisit" class="entity-form" @submit.prevent="createVisit">
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
    <section class="module-grid">
      <article v-for="item in modules" :key="item.title" class="module-card">
        <span class="module-icon">{{ item.title.slice(0, 1) }}</span>
        <h2>{{ item.title }}</h2>
        <p>{{ item.description }}</p>
        <small>{{ item.permission }}</small>
      </article>
    </section>
    <section class="data-panel">
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
            @click="loadDetail(item.id)"
          >
            <td>{{ item.code }}</td>
            <td>{{ item.name }}</td>
            <td>{{ item.type }}</td>
            <td>{{ item.cooperationStatus }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无往来单位</p>
    </section>
    <section v-if="detail" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">CUSTOMER 360</p>
          <h2>{{ detail.counterparty.name }}</h2>
        </div>
        <button
          class="secondary-button"
          @click="
            detail = null;
            selectedId = '';
          "
        >
          关闭
        </button>
      </header>
      <p>
        {{ detail.counterparty.code }} · {{ detail.counterparty.type }} ·
        {{ detail.counterparty.cooperationStatus }}
      </p>
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
  </main>
</template>
