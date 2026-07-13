<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";
interface ProjectRow {
  id: string;
  code: string;
  projectName: string;
  status: string;
}
interface ApplicationRow {
  id: string;
  code: string;
  projectName: string;
  estimatedProfit: string;
  status: string;
}
interface Customer {
  id: string;
  name: string;
}
const auth = useAuthStore(),
  projects = ref<ProjectRow[]>([]),
  applications = ref<ApplicationRow[]>([]),
  customers = ref<Customer[]>([]),
  error = ref<string | null>(null),
  showForm = ref(false),
  saving = ref(false);
interface ProjectDetail {
  project: Record<string, string>;
  members: Array<Record<string, string>>;
  contracts: Array<Record<string, string>>;
  stages: Array<Record<string, string | number>>;
  risks: Array<Record<string, string>>;
  money: Record<string, string>;
  financialVisible: boolean;
}
const detail = ref<ProjectDetail | null>(null);
const today = new Date().toISOString().slice(0, 10),
  later = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
const form = ref({
  projectName: "",
  customerId: "",
  projectType: "CONSULTING",
  background: "",
  serviceScope: "",
  estimatedRevenue: 0,
  estimatedCost: 0,
  estimatedStartOn: today,
  estimatedEndOn: later,
  biddingMethod: "PUBLIC",
  riskDescription: "",
  necessity: "",
});
async function load() {
  try {
    const [p, a, c] = await Promise.all([
      callApi<{ items: ProjectRow[] }>("project.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: ApplicationRow[] }>("project.application.list", {
        page: 1,
        pageSize: 20,
      }),
      callApi<{ items: Customer[] }>("crm.counterparty.list", {
        page: 1,
        pageSize: 50,
      }),
    ]);
    projects.value = p.items;
    applications.value = a.items;
    customers.value = c.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
onMounted(load);
async function createApplication() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("project.application.create", {
      ...form.value,
      background: form.value.background || null,
      sourceLeadId: null,
      proposedManagerId: auth.user.employeeId,
      memberSuggestions: [],
      riskDescription: form.value.riskDescription || null,
      applicantId: auth.user.id,
    });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function loadDetail(projectId: string) {
  try {
    detail.value = await callApi<ProjectDetail>("project.detail", {
      projectId,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载详情失败";
  }
}
async function submitApplication(item: ApplicationRow) {
  error.value = null;
  try {
    await callApi("approval.instance.submit", {
      businessType: "PROJECT_APPLICATION",
      businessId: item.id,
      title: `项目立项：${item.projectName}`,
      amount: null,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交审批失败";
  }
}
const workflow = [
  {
    number: "01",
    title: "立项申请",
    detail: "申请编号独立生成，驳回重提保持不变",
  },
  {
    number: "02",
    title: "审批确认",
    detail: "经营负责人及公司负责人按配置审批",
  },
  {
    number: "03",
    title: "正式项目",
    detail: "仅审批通过后生成唯一、不可修改的项目编号",
  },
];
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">PROJECT PORTFOLIO</p>
        <h1>项目管理</h1>
      </div>
      <button class="primary-action" @click="showForm = !showForm">
        {{ showForm ? "取消" : "发起立项申请" }}
      </button>
    </header>
    <form
      v-if="showForm"
      class="entity-form"
      @submit.prevent="createApplication"
    >
      <label
        >项目名称<input
          v-model="form.projectName"
          required
          minlength="2" /></label
      ><label
        >客户<select v-model="form.customerId" required>
          <option value="" disabled>请选择</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label
        >项目类型<select v-model="form.projectType">
          <option value="CONSULTING">咨询</option>
          <option value="SUPERVISION">监理</option>
          <option value="OTHER">其他</option>
        </select></label
      >
      <label
        >预计收入<input
          v-model.number="form.estimatedRevenue"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >预计成本<input
          v-model.number="form.estimatedCost"
          type="number"
          min="0"
          step="0.01"
          required /></label
      ><label
        >预计利润<input
          :value="(form.estimatedRevenue - form.estimatedCost).toFixed(2)"
          readonly
      /></label>
      <label
        >预计开始<input
          v-model="form.estimatedStartOn"
          type="date"
          required /></label
      ><label
        >预计结束<input
          v-model="form.estimatedEndOn"
          type="date"
          required /></label
      ><label
        >投标方式<select v-model="form.biddingMethod">
          <option value="PUBLIC">公开投标</option>
          <option value="NEGOTIATION">商务洽谈</option>
          <option value="NONE">无需投标</option>
        </select></label
      >
      <label class="wide"
        >服务范围<textarea
          v-model="form.serviceScope"
          required
          minlength="2"
        ></textarea></label
      ><label class="wide"
        >立项必要性<textarea
          v-model="form.necessity"
          required
          minlength="2"
        ></textarea></label
      ><label class="wide"
        >背景与风险<textarea v-model="form.background"></textarea></label
      ><button type="submit" :disabled="saving">
        {{ saving ? "提交中…" : "保存立项申请" }}
      </button>
    </form>
    <section class="project-summary">
      <div><strong>0</strong><span>审批中的立项</span></div>
      <div><strong>0</strong><span>实施中的项目</span></div>
      <div><strong>0</strong><span>待处理事项</span></div>
    </section>
    <section class="workflow-card">
      <p class="eyebrow">ESTABLISHMENT WORKFLOW</p>
      <div class="workflow-steps">
        <article v-for="step in workflow" :key="step.number">
          <span>{{ step.number }}</span>
          <h2>{{ step.title }}</h2>
          <p>{{ step.detail }}</p>
        </article>
      </div>
    </section>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="data-panel">
      <h2>正式项目</h2>
      <table v-if="projects.length">
        <thead>
          <tr>
            <th>编号</th>
            <th>项目名称</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in projects"
            :key="item.id"
            class="clickable"
            @click="loadDetail(item.id)"
          >
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无正式项目</p>
    </section>
    <section v-if="detail" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">PROJECT PANORAMA</p>
          <h2>{{ detail.project.projectName }}</h2>
        </div>
        <button class="secondary-button" @click="detail = null">关闭</button>
      </header>
      <p>
        {{ detail.project.code }} · {{ detail.project.customerName }} ·
        {{ detail.project.managerName }} · {{ detail.project.status }}
      </p>
      <section v-if="detail.financialVisible" class="contract-panels">
        <article>
          <p>预计收入</p>
          <strong>¥ {{ detail.project.estimatedRevenue }}</strong>
        </article>
        <article>
          <p>已开票</p>
          <strong>¥ {{ detail.money.invoicedAmount }}</strong>
        </article>
        <article>
          <p>已收款</p>
          <strong>¥ {{ detail.money.receivedAmount }}</strong>
        </article>
        <article>
          <p>保证金占用</p>
          <strong>¥ {{ detail.money.occupiedDeposit }}</strong>
        </article>
      </section>
      <div class="module-grid">
        <article class="module-card">
          <h3>项目成员</h3>
          <p v-for="m in detail.members" :key="m.name">
            {{ m.name }} · {{ m.projectRole }}
          </p>
          <p v-if="!detail.members.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>合同</h3>
          <p v-for="c in detail.contracts" :key="c.code">
            {{ c.contractName }} · {{ c.status }}
          </p>
          <p v-if="!detail.contracts.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>阶段进度</h3>
          <p v-for="s in detail.stages" :key="String(s.stageName)">
            {{ s.stageName }} · {{ s.completionPercentage }}%
          </p>
          <p v-if="!detail.stages.length">暂无</p>
        </article>
        <article class="module-card">
          <h3>问题风险</h3>
          <p v-for="r in detail.risks" :key="r.title">
            {{ r.title }} · {{ r.severity }} · {{ r.status }}
          </p>
          <p v-if="!detail.risks.length">暂无</p>
        </article>
      </div>
    </section>
    <section class="data-panel">
      <h2>立项申请</h2>
      <table v-if="applications.length">
        <thead>
          <tr>
            <th>申请编号</th>
            <th>项目名称</th>
            <th>预计利润</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in applications" :key="item.id">
            <td>{{ item.code }}</td>
            <td>{{ item.projectName }}</td>
            <td>{{ item.estimatedProfit }}</td>
            <td>{{ item.status }}</td>
            <td>
              <button
                v-if="
                  ['DRAFT', 'RETURNED', 'REJECTED', 'WITHDRAWN'].includes(
                    item.status,
                  )
                "
                class="secondary-button"
                @click="submitApplication(item)"
              >
                提交审批
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>暂无立项申请</p>
    </section>
  </main>
</template>
