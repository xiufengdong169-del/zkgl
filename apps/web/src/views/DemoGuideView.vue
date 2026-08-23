<script setup lang="ts">
import { RouterLink } from "vue-router";

const businessFlow = [
  {
    title: "1. 客户与线索",
    text: "查看客户、联系人、拜访记录、市场线索和跟进计划，确认商机来源能进入项目立项。",
    to: "/customers",
    action: "看客户台账",
  },
  {
    title: "2. 立项与审批",
    text: "查看立项申请、驳回重提、审批待办和通过后生成正式项目编号的闭环。",
    to: "/projects",
    action: "看项目立项",
  },
  {
    title: "3. 投标与合同",
    text: "查看投标申请、任务检查项、友商配合、合同、变更和履约节点。",
    to: "/bids",
    action: "看投标过程",
  },
  {
    title: "4. 项目实施交付",
    text: "查看项目阶段、进展、风险、成果提交、验收和异常提醒。",
    to: "/delivery",
    action: "看实施交付",
  },
  {
    title: "5. 财务与结算",
    text: "查看开票、收款、核销、付款、报销、合作方结算、保证金和项目结项。",
    to: "/finance",
    action: "看财务闭环",
  },
  {
    title: "6. 文件、报表、管理",
    text: "查看项目文件版本、敏感资料权限、经营报表、系统参数和基础资料。",
    to: "/reports",
    action: "看统计报表",
  },
];

const deliveryScope = [
  "工作台经营指标、待办、提醒、导出任务",
  "客户、线索、项目、投标、合同、交付、财务、结算、文件、审批、报表、系统管理页面",
  "样例数据演示主流程，不访问远程服务器，不连接生产数据库",
  "权限菜单、路由守卫、敏感字段、审计、数据范围由自动化测试覆盖",
  "本地完整联调脚本已准备，等待本机 MySQL 8.0 和数据库密码后可跑真实 API",
];

const verificationItems = [
  "npm run verify:acceptance：类型检查、API/Web 测试、构建、安全扫描、需求一致性、部署资产、备份资产、演示包校验",
  "API 当前基线：90 个测试文件 / 482 条测试",
  "Web 当前基线：10 个测试文件 / 63 条测试",
  "npm audit --omit=dev：生产依赖漏洞扫描",
  "npm run verify:local-demo：全部声明 SPA 路由和静态资源可访问",
];

const pendingItems = [
  "正式服务器部署、HTTPS、真实认证 verifier、生产 MySQL 初始化暂未执行",
  "30 用户现场性能压测需在真实服务器和企业网络下完成",
  "数据库、附件、导出文件恢复演练需在非生产验证环境归档",
];
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">DEMO CENTER</p>
        <h1>演示测试中心</h1>
        <p class="muted">
          面向用户演示与测试的主入口：先按下面 6 步走一遍主体流程，再查看自动化测试和剩余真实环境事项。
        </p>
      </div>
      <RouterLink class="secondary-button" to="/">返回工作台</RouterLink>
    </header>

    <section class="hero demo-hero">
      <h2>本地演示版已具备主体流程和界面展示能力</h2>
      <p>
        适合先让业务用户看菜单结构、页面布局、字段口径、样例流程和关键管理闭环；
        当前演示版不冒充正式上线环境，也不会连接生产 MySQL。
      </p>
    </section>

    <section class="demo-flow">
      <article v-for="step in businessFlow" :key="step.title" class="module-card">
        <div class="module-icon">{{ step.title.slice(0, 1) }}</div>
        <h2>{{ step.title }}</h2>
        <p>{{ step.text }}</p>
        <RouterLink class="secondary-button" :to="step.to">{{ step.action }}</RouterLink>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="data-list">
        <h2>本次可演示范围</h2>
        <div v-for="item in deliveryScope" :key="item" class="check-row">
          <span>✓</span>
          <p>{{ item }}</p>
        </div>
      </article>

      <article class="data-list">
        <h2>自动化复核口径</h2>
        <div v-for="item in verificationItems" :key="item" class="check-row">
          <span>✓</span>
          <p>{{ item }}</p>
        </div>
      </article>
    </section>

    <section class="data-list">
      <h2>还不能冒充完成的事项</h2>
      <div v-for="item in pendingItems" :key="item" class="check-row pending">
        <span>!</span>
        <p>{{ item }}</p>
      </div>
    </section>

    <section class="workflow-card">
      <h2>建议用户测试顺序</h2>
      <div class="workflow-steps">
        <article>
          <span>01</span>
          <h2>先看界面</h2>
          <p>从本页按 6 步进入各模块，确认名称、字段、流程表达是否符合业务习惯。</p>
        </article>
        <article>
          <span>02</span>
          <h2>再走主流程</h2>
          <p>客户线索 → 立项审批 → 投标合同 → 项目实施 → 财务结算 → 文件报表。</p>
        </article>
        <article>
          <span>03</span>
          <h2>最后提反馈</h2>
          <p>把界面文案、字段缺漏、流程不顺、角色权限疑问整理成测试意见。</p>
        </article>
      </div>
    </section>
  </main>
</template>
