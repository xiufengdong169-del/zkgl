<script setup lang="ts">
import type { CounterpartySummary } from '@zkgl/shared'
import { onMounted, ref } from 'vue'
import { callApi } from '../api'

const items = ref<CounterpartySummary[]>([])
const loading = ref(false)
const error = ref<string|null>(null)
async function load() {
  loading.value=true; error.value=null
  try { const result=await callApi<{items:CounterpartySummary[]}>('crm.counterparty.list',{page:1,pageSize:20}); items.value=result.items }
  catch (cause) { error.value=cause instanceof Error?cause.message:'加载失败' }
  finally { loading.value=false }
}
onMounted(load)
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
    <section class="data-panel">
      <h2>最近往来单位</h2>
      <p v-if="loading">正在加载…</p><p v-else-if="error" class="error">{{error}}</p>
      <table v-else-if="items.length"><thead><tr><th>编号</th><th>名称</th><th>类型</th><th>合作状态</th></tr></thead>
        <tbody><tr v-for="item in items" :key="item.id"><td>{{item.code}}</td><td>{{item.name}}</td><td>{{item.type}}</td><td>{{item.cooperationStatus}}</td></tr></tbody></table>
      <p v-else>暂无往来单位</p>
    </section>
  </main>
</template>
