<script setup lang="ts">
import type { LeadSummary } from '@zkgl/shared'
import { onMounted, ref } from 'vue'
import { callApi } from '../api'
const items=ref<LeadSummary[]>([]),error=ref<string|null>(null),loading=ref(false)
onMounted(async()=>{loading.value=true;try{items.value=(await callApi<{items:LeadSummary[]}>('lead.list',{page:1,pageSize:20})).items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}finally{loading.value=false}})
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
    <section class="data-panel"><h2>最近线索</h2><p v-if="loading">正在加载…</p><p v-else-if="error" class="error">{{error}}</p>
      <table v-else-if="items.length"><thead><tr><th>编号</th><th>项目名称</th><th>成功概率</th><th>状态</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{item.code}}</td><td>{{item.projectName}}</td><td>{{item.successProbability}}%</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无线索</p></section>
  </main>
</template>
