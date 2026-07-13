<script setup lang="ts">
import { onMounted, ref } from "vue";
import { callApi } from "../api";
import { useAuthStore } from "../stores/auth";
const modules = [
  ["启动", "正常/提前启动"],
  ["阶段计划", "目标、工期与交付物"],
  ["进展", "完成情况与偏差"],
  ["问题风险", "处理与验证闭环"],
  ["项目变更", "工期及金额影响"],
  ["成果", "版本提交与确认"],
  ["验收", "验收结果与整改"],
];
interface Project {
  id: string;
  projectName: string;
}
interface DeliverableRecord {
  id: string;
  deliverableName: string;
  deliverableVersion: string;
  submittedOn: string;
  status: string;
  projectName: string;
}
interface AcceptanceRecord {
  id: string;
  acceptanceType: string;
  acceptedOn: string;
  result: string;
  status: string;
  projectName: string;
}
const auth = useAuthStore(),
  projects = ref<Project[]>([]),
  deliverableRecords = ref<DeliverableRecord[]>([]),
  acceptanceRecords = ref<AcceptanceRecord[]>([]),
  summary = ref({
    stageCount: 0,
    averageProgress: 0,
    openRiskCount: 0,
    confirmedDeliverableCount: 0,
  }),
  error = ref<string | null>(null),
  mode = ref<"STAGE" | "DELIVERABLE" | "ACCEPTANCE" | null>(null),
  saving = ref(false);
const today = new Date().toISOString().slice(0, 10),
  later = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const form = ref({
  projectId: "",
  stageName: "",
  stageOrder: 1,
  plannedStartOn: today,
  plannedEndOn: later,
  objective: "",
  deliverables: "",
});
const deliverable = ref({
  projectId: "",
  deliverableName: "",
  deliverableType: "DOCUMENT",
  deliverableVersion: "V1.0",
  submittedOn: today,
  recipient: "",
  description: "",
});
const acceptance = ref({
  projectId: "",
  acceptanceType: "FINAL",
  appliedOn: today,
  acceptanceScope: "",
  acceptanceBasis: "",
  acceptedOn: today,
  acceptanceOrganization: "",
  result: "PASSED",
  remainingIssues: "",
  rectificationDueOn: "",
});
async function load() {
  try {
    const [s, p, records] = await Promise.all([
      callApi<typeof summary.value>("delivery.summary", {}),
      callApi<{ items: Project[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{
        deliverables: DeliverableRecord[];
        acceptances: AcceptanceRecord[];
      }>("delivery.records", {}),
    ]);
    summary.value = s;
    projects.value = p.items;
    deliverableRecords.value = records.deliverables;
    acceptanceRecords.value = records.acceptances;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
}
onMounted(load);
async function createStage() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("project.stage.create", {
      ...form.value,
      ownerId: auth.user.employeeId,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createDeliverable() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("project.deliverable.create", {
      ...deliverable.value,
      stageId: null,
      submitterId: auth.user.employeeId,
      recipient: deliverable.value.recipient || null,
      description: deliverable.value.description || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createAcceptance() {
  saving.value = true;
  error.value = null;
  try {
    const f = acceptance.value;
    await callApi("project.acceptance.create", {
      ...f,
      contractId: null,
      remainingIssues: f.remainingIssues || null,
      rectificationDueOn: f.rectificationDueOn || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function confirmDeliverable(
  item: DeliverableRecord,
  result: "ACCEPTED" | "REJECTED",
) {
  try {
    await callApi("project.deliverable.confirm", {
      deliverableId: item.id,
      confirmationResult: result,
      comment: null,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "确认失败";
  }
}
</script>
<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">PROJECT DELIVERY</p>
        <h1>项目实施</h1>
      </div>
      <div class="header-actions">
        <button class="primary-action" @click="mode = 'STAGE'">新增阶段</button
        ><button class="primary-action" @click="mode = 'DELIVERABLE'">
          提交成果</button
        ><button class="primary-action" @click="mode = 'ACCEPTANCE'">
          登记验收
        </button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="contract-panels">
      <article>
        <p>阶段计划</p>
        <strong>{{ summary.stageCount }}</strong
        ><small>平均进度 {{ summary.averageProgress.toFixed(1) }}%</small>
      </article>
      <article>
        <p>未关闭风险</p>
        <strong>{{ summary.openRiskCount }}</strong
        ><small>问题与风险</small>
      </article>
      <article>
        <p>已确认成果</p>
        <strong>{{ summary.confirmedDeliverableCount }}</strong
        ><small>版本化成果</small>
      </article>
    </section>
    <form
      v-if="mode === 'STAGE'"
      class="entity-form"
      @submit.prevent="createStage"
    >
      <label
        >项目<select v-model="form.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label>阶段名称<input v-model="form.stageName" required /></label
      ><label
        >顺序<input
          v-model.number="form.stageOrder"
          type="number"
          min="1"
          required /></label
      ><label
        >计划开始<input
          v-model="form.plannedStartOn"
          type="date"
          required /></label
      ><label
        >计划结束<input
          v-model="form.plannedEndOn"
          type="date"
          required /></label
      ><label class="wide"
        >阶段目标<textarea v-model="form.objective" required></textarea></label
      ><label class="wide"
        >交付物<textarea v-model="form.deliverables" required></textarea></label
      ><button :disabled="saving">{{ saving ? "保存中…" : "保存阶段" }}</button>
    </form>
    <form
      v-if="mode === 'DELIVERABLE'"
      class="entity-form"
      @submit.prevent="createDeliverable"
    >
      <label
        >项目<select v-model="deliverable.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >成果名称<input v-model="deliverable.deliverableName" required /></label
      ><label
        >成果类型<input v-model="deliverable.deliverableType" required /></label
      ><label
        >版本<input v-model="deliverable.deliverableVersion" required /></label
      ><label
        >提交日<input
          v-model="deliverable.submittedOn"
          type="date"
          required /></label
      ><label>接收人<input v-model="deliverable.recipient" /></label
      ><label class="wide"
        >成果说明<textarea v-model="deliverable.description"></textarea></label
      ><button :disabled="saving">{{ saving ? "保存中…" : "保存成果" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'ACCEPTANCE'"
      class="entity-form"
      @submit.prevent="createAcceptance"
    >
      <label
        >项目<select v-model="acceptance.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >验收类型<input v-model="acceptance.acceptanceType" required /></label
      ><label
        >申请日<input
          v-model="acceptance.appliedOn"
          type="date"
          required /></label
      ><label
        >验收日<input
          v-model="acceptance.acceptedOn"
          type="date"
          required /></label
      ><label
        >验收单位<input
          v-model="acceptance.acceptanceOrganization"
          required /></label
      ><label
        >结果<select v-model="acceptance.result">
          <option value="PASSED">通过</option>
          <option value="CONDITIONAL">有条件通过</option>
          <option value="FAILED">未通过</option>
        </select></label
      ><label class="wide"
        >验收范围<textarea
          v-model="acceptance.acceptanceScope"
          required
        ></textarea></label
      ><label class="wide"
        >验收依据<textarea
          v-model="acceptance.acceptanceBasis"
          required
        ></textarea></label
      ><template v-if="acceptance.result === 'CONDITIONAL'"
        ><label class="wide"
          >遗留问题<textarea
            v-model="acceptance.remainingIssues"
            required
          ></textarea></label
        ><label
          >整改期限<input
            v-model="acceptance.rectificationDueOn"
            type="date"
            required /></label></template
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存验收结果" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <section v-if="deliverableRecords.length" class="data-panel">
      <h2>成果版本</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>成果</th>
            <th>版本</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in deliverableRecords" :key="d.id">
            <td>{{ d.projectName }}</td>
            <td>{{ d.deliverableName }}</td>
            <td>{{ d.deliverableVersion }}</td>
            <td>{{ d.status }}</td>
            <td>
              <template v-if="d.status === 'SUBMITTED'"
                ><button
                  class="secondary-button"
                  @click="confirmDeliverable(d, 'ACCEPTED')"
                >
                  确认</button
                ><button
                  class="secondary-button"
                  @click="confirmDeliverable(d, 'REJECTED')"
                >
                  驳回
                </button></template
              >
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="acceptanceRecords.length" class="data-panel">
      <h2>验收记录</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>类型</th>
            <th>日期</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in acceptanceRecords" :key="a.id">
            <td>{{ a.projectName }}</td>
            <td>{{ a.acceptanceType }}</td>
            <td>{{ a.acceptedOn }}</td>
            <td>{{ a.result }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="delivery-timeline">
      <article v-for="([title, detail], index) in modules" :key="title">
        <span>{{ index + 1 }}</span>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ detail }}</p>
        </div>
      </article>
    </section>
  </main>
</template>
