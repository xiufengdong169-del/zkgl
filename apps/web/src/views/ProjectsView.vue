<script setup lang="ts">
const workflow = [
  { number: '01', title: '立项申请', detail: '申请编号独立生成，驳回重提保持不变' },
  { number: '02', title: '审批确认', detail: '经营负责人及公司负责人按配置审批' },
  { number: '03', title: '正式项目', detail: '仅审批通过后生成唯一、不可修改的项目编号' }
]
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div><p class="eyebrow">PROJECT PORTFOLIO</p><h1>项目管理</h1></div>
      <button class="primary-action">发起立项申请</button>
    </header>
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
  </main>
</template>
