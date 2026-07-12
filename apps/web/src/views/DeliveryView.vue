<script setup lang="ts">
const modules = [['启动', '正常/提前启动'], ['阶段计划', '目标、工期与交付物'], ['进展', '完成情况与偏差'], ['问题风险', '处理与验证闭环'], ['项目变更', '工期及金额影响'], ['成果', '版本提交与确认'], ['验收', '验收结果与整改']]
</script>
<template>
  <main class="page">
    <header class="page-header"><div><p class="eyebrow">PROJECT DELIVERY</p><h1>项目实施</h1></div><button class="primary-action">记录项目进展</button></header>
    <section class="delivery-timeline">
      <article v-for="([title, detail], index) in modules" :key="title"><span>{{ index + 1 }}</span><div><h2>{{ title }}</h2><p>{{ detail }}</p></div></article>
    </section>
  </main>
</template>
