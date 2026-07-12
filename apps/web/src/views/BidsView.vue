<script setup lang="ts">
const areas = [
  ['投标申请', '审批、时间节点与保证金信息'],
  ['任务分工', '商务标、技术标与报价任务'],
  ['文件检查', '检查、整改和复查闭环'],
  ['投标结果', '中标状态与项目复盘'],
  ['友商配合', '报名、报价与配合投标登记']
]
</script>
<template>
  <main class="page">
    <header class="page-header"><div><p class="eyebrow">BIDDING</p><h1>投标管理</h1></div><button class="primary-action">新增投标申请</button></header>
    <section class="module-grid bid-grid">
      <article v-for="([title, detail], index) in areas" :key="title" class="module-card">
        <span class="module-icon">{{ String(index + 1).padStart(2, '0') }}</span><h2>{{ title }}</h2><p>{{ detail }}</p>
      </article>
    </section>
  </main>
</template>
