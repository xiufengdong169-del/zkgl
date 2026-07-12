<script setup lang="ts">
const modules = [
  { title: '往来单位', description: '客户、供应商、总包单位与合作伙伴统一档案', permission: 'crm.counterparty.read' },
  { title: '联系人', description: '联系人、关键关系与决策角色', permission: 'crm.contact.read' },
  { title: '客户拜访', description: '拜访记录、下一步计划与线索生成', permission: 'crm.visit.read' }
]
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div><p class="eyebrow">CRM</p><h1>客户管理</h1></div>
      <button class="primary-action">新增往来单位</button>
    </header>
    <section class="module-grid">
      <article v-for="item in modules" :key="item.title" class="module-card">
        <span class="module-icon">{{ item.title.slice(0, 1) }}</span>
        <h2>{{ item.title }}</h2>
        <p>{{ item.description }}</p>
        <small>{{ item.permission }}</small>
      </article>
    </section>
  </main>
</template>
