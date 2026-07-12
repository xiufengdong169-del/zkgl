<script setup lang="ts">
const statusColumns = [
  { label: '草稿', code: 'DRAFT' },
  { label: '待报备', code: 'PENDING_REGISTRATION' },
  { label: '跟进中', code: 'FOLLOWING' },
  { label: '已转项目', code: 'CONVERTED' }
]
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div><p class="eyebrow">MARKET PIPELINE</p><h1>项目线索</h1></div>
      <button class="primary-action">新增线索</button>
    </header>
    <section class="pipeline">
      <article v-for="column in statusColumns" :key="column.code" class="pipeline-column">
        <div><h2>{{ column.label }}</h2><span>0</span></div>
        <p>暂无记录</p>
        <small>{{ column.code }}</small>
      </article>
    </section>
  </main>
</template>
