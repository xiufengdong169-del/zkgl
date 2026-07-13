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
interface StageRecord {
  id: string;
  projectId: string;
  stageName: string;
  completionPercentage: number;
  status: string;
  projectName: string;
}
interface RiskRecord {
  id: string;
  projectId: string;
  title: string;
  severity: string;
  status: string;
  projectName: string;
}
interface ChangeRecord {
  id: string;
  projectId: string;
  changeType: string;
  scheduleImpactDays: number;
  amountImpact: string;
  status: string;
  projectName: string;
}
const auth = useAuthStore(),
  projects = ref<Project[]>([]),
  deliverableRecords = ref<DeliverableRecord[]>([]),
  acceptanceRecords = ref<AcceptanceRecord[]>([]),
  stageRecords = ref<StageRecord[]>([]),
  riskRecords = ref<RiskRecord[]>([]),
  changeRecords = ref<ChangeRecord[]>([]),
  summary = ref({
    stageCount: 0,
    averageProgress: 0,
    openRiskCount: 0,
    confirmedDeliverableCount: 0,
  }),
  error = ref<string | null>(null),
  mode = ref<
    | "START"
    | "STAGE"
    | "PROGRESS"
    | "RISK"
    | "DELIVERABLE"
    | "CHANGE"
    | "ACCEPTANCE"
    | "ACCEPTANCE_RESULT"
    | null
  >(null),
  saving = ref(false);
const acceptanceResultId = ref("");
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
const start = ref({
  projectId: "",
  startType: "NORMAL",
  startedOn: today,
  objectives: "",
  scopeDescription: "",
  communicationMechanism: "",
  deliverables: "",
  risks: "",
  currentContractStatus: "",
  earlyStartReason: "",
  startBasis: "",
  estimatedContractAmount: null as number | null,
  expectedSigningOn: "",
});
const progress = ref({
  projectId: "",
  stageId: "",
  recordedOn: today,
  completedWork: "",
  currentProgress: 0,
  nextPlan: "",
  deviationDescription: "",
  coordinationNeeded: "",
});
const risk = ref({
  projectId: "",
  itemType: "RISK",
  title: "",
  description: "",
  severity: "MEDIUM",
  impact: "",
  discoveredOn: today,
  plannedResolutionOn: later,
  measures: "",
});
const change = ref({
  projectId: "",
  changeType: "SCOPE",
  originalContent: "",
  newContent: "",
  reason: "",
  impactScope: "",
  scheduleImpactDays: 0,
  amountImpact: 0,
  effectiveOn: "",
});
async function load() {
  try {
    const [s, p, records] = await Promise.all([
      callApi<typeof summary.value>("delivery.summary", {}),
      callApi<{ items: Project[] }>("project.list", { page: 1, pageSize: 50 }),
      callApi<{
        deliverables: DeliverableRecord[];
        acceptances: AcceptanceRecord[];
        stages: StageRecord[];
        risks: RiskRecord[];
        changes: ChangeRecord[];
      }>("delivery.records", {}),
    ]);
    summary.value = s;
    projects.value = p.items;
    deliverableRecords.value = records.deliverables;
    acceptanceRecords.value = records.acceptances;
    stageRecords.value = records.stages;
    riskRecords.value = records.risks;
    changeRecords.value = records.changes;
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
    await callApi("project.stage.create", form.value);
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
    const result = await callApi<{ id: string }>("project.acceptance.create", {
      projectId: f.projectId,
      acceptanceType: f.acceptanceType,
      appliedOn: f.appliedOn,
      acceptanceScope: f.acceptanceScope,
      acceptanceBasis: f.acceptanceBasis,
      contractId: null,
    });
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_ACCEPTANCE",
      businessId: result.id,
      title: `项目验收申请：${projects.value.find((p) => p.id === f.projectId)?.projectName || f.projectId}`,
      amount: null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
function openAcceptanceResult(item: AcceptanceRecord) {
  acceptanceResultId.value = item.id;
  mode.value = "ACCEPTANCE_RESULT";
}
async function recordAcceptanceResult() {
  saving.value = true;
  error.value = null;
  try {
    const f = acceptance.value;
    await callApi("project.acceptance.result", {
      acceptanceId: acceptanceResultId.value,
      acceptedOn: f.acceptedOn,
      acceptanceOrganization: f.acceptanceOrganization,
      result: f.result,
      remainingIssues: f.remainingIssues || null,
      rectificationDueOn: f.rectificationDueOn || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "验收结果保存失败";
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
async function createStart() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = start.value,
      created = await callApi<{ id: string }>("project.start.create", {
        ...f,
        projectManagerId: auth.user.employeeId,
        risks: f.risks || null,
        currentContractStatus: f.currentContractStatus || null,
        earlyStartReason: f.startType === "EARLY" ? f.earlyStartReason : null,
        startBasis: f.startType === "EARLY" ? f.startBasis : null,
        estimatedContractAmount:
          f.startType === "EARLY" ? f.estimatedContractAmount : null,
        expectedSigningOn: f.startType === "EARLY" ? f.expectedSigningOn : null,
      });
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_START",
      businessId: created.id,
      title: `项目启动：${projects.value.find((x) => x.id === f.projectId)?.projectName || f.projectId}`,
      amount: f.estimatedContractAmount,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存或提交审批失败";
  } finally {
    saving.value = false;
  }
}
async function createProgress() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = progress.value;
    await callApi("project.progress.create", {
      ...f,
      stageId: f.stageId || null,
      deviationDescription: f.deviationDescription || null,
      coordinationNeeded: f.coordinationNeeded || null,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function createRisk() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    await callApi("project.risk.create", {
      ...risk.value,
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}
async function stageAction(item: StageRecord, action: string) {
  try {
    await callApi("project.stage.transition", { stageId: item.id, action });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败";
  }
}
async function riskAction(item: RiskRecord, action: string) {
  try {
    await callApi("project.risk.transition", { riskId: item.id, action });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败";
  }
}
async function createChange() {
  if (!auth.user) return;
  saving.value = true;
  error.value = null;
  try {
    const f = change.value,
      created = await callApi<{ id: string }>("project.change.create", {
        ...f,
        effectiveOn: f.effectiveOn || null,
      });
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_CHANGE",
      businessId: created.id,
      title: `项目变更：${projects.value.find((x) => x.id === f.projectId)?.projectName || f.projectId}`,
      amount: Math.abs(f.amountImpact),
    });
    mode.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存或提交审批失败";
  } finally {
    saving.value = false;
  }
}
async function submitChange(item: ChangeRecord) {
  try {
    await callApi("approval.instance.submit", {
      actionKey: crypto.randomUUID(),
      businessType: "PROJECT_CHANGE",
      businessId: item.id,
      title: `项目变更：${item.projectName}`,
      amount: Math.max(0, Number(item.amountImpact)),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "项目变更提交失败";
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
        <button class="primary-action" @click="mode = 'START'">项目启动</button
        ><button class="primary-action" @click="mode = 'STAGE'">新增阶段</button
        ><button class="primary-action" @click="mode = 'PROGRESS'">
          记录进展</button
        ><button class="primary-action" @click="mode = 'RISK'">登记风险</button
        ><button class="primary-action" @click="mode = 'CHANGE'">
          项目变更</button
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
      v-if="mode === 'START'"
      class="entity-form"
      @submit.prevent="createStart"
    >
      <label
        >项目<select v-model="start.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >启动类型<select v-model="start.startType">
          <option value="NORMAL">正常启动</option>
          <option value="EARLY">提前启动</option>
        </select></label
      ><label
        >启动日<input v-model="start.startedOn" type="date" required /></label
      ><label class="wide"
        >项目目标<textarea
          v-model="start.objectives"
          required
        ></textarea></label
      ><label class="wide"
        >范围<textarea
          v-model="start.scopeDescription"
          required
        ></textarea></label
      ><label class="wide"
        >沟通机制<textarea
          v-model="start.communicationMechanism"
          required
        ></textarea></label
      ><label class="wide"
        >交付物<textarea
          v-model="start.deliverables"
          required
        ></textarea></label
      ><template v-if="start.startType === 'EARLY'"
        ><label class="wide"
          >提前原因<textarea
            v-model="start.earlyStartReason"
            required
          ></textarea></label
        ><label class="wide"
          >启动依据<textarea
            v-model="start.startBasis"
            required
          ></textarea></label
        ><label
          >预计合同额<input
            v-model.number="start.estimatedContractAmount"
            type="number"
            min="0"
            step="0.01" /></label
        ><label
          >预计签约日<input
            v-model="start.expectedSigningOn"
            type="date"
            required /></label></template
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存启动信息" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
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
      v-if="mode === 'PROGRESS'"
      class="entity-form"
      @submit.prevent="createProgress"
    >
      <label
        >项目<select v-model="progress.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >阶段<select v-model="progress.stageId">
          <option value="">无</option>
          <option
            v-for="s in stageRecords.filter(
              (x) => !progress.projectId || x.projectId === progress.projectId,
            )"
            :key="s.id"
            :value="s.id"
          >
            {{ s.stageName }}
          </option>
        </select></label
      ><label
        >记录日<input
          v-model="progress.recordedOn"
          type="date"
          required /></label
      ><label
        >当前进度<input
          v-model.number="progress.currentProgress"
          type="number"
          min="0"
          max="100"
          required /></label
      ><label class="wide"
        >已完成工作<textarea
          v-model="progress.completedWork"
          required
        ></textarea></label
      ><label class="wide"
        >下步计划<textarea
          v-model="progress.nextPlan"
          required
        ></textarea></label
      ><label class="wide"
        >偏差说明<textarea
          v-model="progress.deviationDescription"
        ></textarea></label
      ><label class="wide"
        >需协调事项<textarea
          v-model="progress.coordinationNeeded"
        ></textarea></label
      ><button :disabled="saving">{{ saving ? "保存中…" : "保存进展" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'RISK'"
      class="entity-form"
      @submit.prevent="createRisk"
    >
      <label
        >项目<select v-model="risk.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label
        >类型<select v-model="risk.itemType">
          <option value="RISK">风险</option>
          <option value="ISSUE">问题</option>
        </select></label
      ><label>标题<input v-model="risk.title" required /></label
      ><label
        >等级<select v-model="risk.severity">
          <option value="LOW">低</option>
          <option value="MEDIUM">中</option>
          <option value="HIGH">高</option>
          <option value="CRITICAL">严重</option>
        </select></label
      ><label
        >发现日<input v-model="risk.discoveredOn" type="date" required /></label
      ><label
        >计划解决日<input
          v-model="risk.plannedResolutionOn"
          type="date"
          required /></label
      ><label class="wide"
        >描述<textarea v-model="risk.description" required></textarea></label
      ><label class="wide"
        >影响<textarea v-model="risk.impact" required></textarea></label
      ><label class="wide"
        >措施<textarea v-model="risk.measures" required></textarea></label
      ><button :disabled="saving">
        {{ saving ? "保存中…" : "保存问题风险" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'CHANGE'"
      class="entity-form"
      @submit.prevent="createChange"
    >
      <label
        >项目<select v-model="change.projectId" required>
          <option value="" disabled>请选择</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectName }}
          </option>
        </select></label
      ><label>变更类型<input v-model="change.changeType" required /></label
      ><label
        >工期影响天数<input
          v-model.number="change.scheduleImpactDays"
          type="number"
          required /></label
      ><label
        >金额影响<input
          v-model.number="change.amountImpact"
          type="number"
          step="0.01"
          required /></label
      ><label
        >计划生效日<input v-model="change.effectiveOn" type="date" /></label
      ><label class="wide"
        >原内容<textarea
          v-model="change.originalContent"
          required
        ></textarea></label
      ><label class="wide"
        >新内容<textarea v-model="change.newContent" required></textarea></label
      ><label class="wide"
        >变更原因<textarea v-model="change.reason" required></textarea></label
      ><label class="wide"
        >影响范围<textarea
          v-model="change.impactScope"
          required
        ></textarea></label
      ><button :disabled="saving">
        {{ saving ? "提交中…" : "保存并提交审批" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
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
      ><label v-if="false"
        >验收日<input
          v-model="acceptance.acceptedOn"
          type="date"
          required /></label
      ><label v-if="false"
        >验收单位<input
          v-model="acceptance.acceptanceOrganization"
          required /></label
      ><label v-if="false"
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
      ><template v-if="false"
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
        {{ saving ? "保存中…" : "创建并提交验收审批" }}</button
      ><button type="button" class="secondary-button" @click="mode = null">
        取消
      </button>
    </form>
    <form
      v-if="mode === 'ACCEPTANCE_RESULT'"
      class="entity-form"
      @submit.prevent="recordAcceptanceResult"
    >
      <h2 class="wide">登记验收结果</h2>
      <label
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
      ><button :disabled="saving">保存验收结果</button
      ><button type="button" @click="mode = null">取消</button>
    </form>
    <section v-if="changeRecords.length" class="data-panel">
      <h2>项目变更</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>类型</th>
            <th>工期影响</th>
            <th>金额影响</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in changeRecords" :key="c.id">
            <td>{{ c.projectName }}</td>
            <td>{{ c.changeType }}</td>
            <td>{{ c.scheduleImpactDays }} 天</td>
            <td>{{ c.amountImpact }}</td>
            <td>{{ c.status }}</td>
            <td>
              <button
                v-if="
                  ['DRAFT', 'RETURNED', 'REJECTED', 'WITHDRAWN'].includes(
                    c.status,
                  )
                "
                @click="submitChange(c)"
              >
                提交审批
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="stageRecords.length" class="data-panel">
      <h2>阶段执行</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>阶段</th>
            <th>进度</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in stageRecords" :key="s.id">
            <td>{{ s.projectName }}</td>
            <td>{{ s.stageName }}</td>
            <td>{{ s.completionPercentage }}%</td>
            <td>{{ s.status }}</td>
            <td>
              <button
                v-if="['NOT_STARTED', 'DELAYED', 'REOPENED'].includes(s.status)"
                class="secondary-button"
                @click="stageAction(s, 'START')"
              >
                开始</button
              ><button
                v-if="s.status === 'IN_PROGRESS'"
                class="secondary-button"
                @click="stageAction(s, 'SUBMIT_CONFIRMATION')"
              >
                提交确认</button
              ><button
                v-if="s.status === 'PENDING_CONFIRMATION'"
                class="secondary-button"
                @click="stageAction(s, 'CONFIRM')"
              >
                确认完成
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="riskRecords.length" class="data-panel">
      <h2>问题风险</h2>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>标题</th>
            <th>等级</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in riskRecords" :key="r.id">
            <td>{{ r.projectName }}</td>
            <td>{{ r.title }}</td>
            <td>{{ r.severity }}</td>
            <td>{{ r.status }}</td>
            <td>
              <button
                v-if="['PENDING', 'REOPENED'].includes(r.status)"
                class="secondary-button"
                @click="riskAction(r, 'START')"
              >
                开始处理</button
              ><button
                v-if="r.status === 'IN_PROGRESS'"
                class="secondary-button"
                @click="riskAction(r, 'SUBMIT_VERIFY')"
              >
                提交验证</button
              ><button
                v-if="r.status === 'PENDING_VERIFICATION'"
                class="secondary-button"
                @click="riskAction(r, 'CLOSE')"
              >
                关闭</button
              ><button
                v-if="r.status === 'CLOSED'"
                class="secondary-button"
                @click="riskAction(r, 'REOPEN')"
              >
                重新打开
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
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
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in acceptanceRecords" :key="a.id">
            <td>{{ a.projectName }}</td>
            <td>{{ a.acceptanceType }}</td>
            <td>{{ a.acceptedOn }}</td>
            <td>{{ a.result }}</td>
            <td>{{ a.status }}</td>
            <td>
              <button
                v-if="a.status === 'PENDING_ACCEPTANCE'"
                @click="openAcceptanceResult(a)"
              >
                登记结果
              </button>
            </td>
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
