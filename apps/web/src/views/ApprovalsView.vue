<script setup lang="ts">
const filters = ['待我审批', '我发起的', '抄送我的', '已处理']
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div><p class="eyebrow">APPROVAL INBOX</p><h1>审批与待办</h1></div>
      <span class="badge">顺序审批</span>
    </header>
    <nav class="filter-tabs" aria-label="审批筛选">
      <button v-for="(filter, index) in filters" :key="filter" :class="{ active: index === 0 }">{{ filter }}</button>
    </nav>
    <section class="empty-state">
      <span>✓</span>
      <h2>当前没有待审批事项</h2>
      <p>新的审批任务会根据岗位配置和金额阈值自动进入这里。</p>
    </section>
  </main>
</template>
