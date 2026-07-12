<script setup lang="ts">
import { onMounted,ref } from 'vue';import { callApi } from '../api'
interface BidRow{id:string;code:string;projectName:string;deadlineAt:string;status:string}
const items=ref<BidRow[]>([]),error=ref<string|null>(null)
onMounted(async()=>{try{items.value=(await callApi<{items:BidRow[]}>('bid.application.list',{page:1,pageSize:20})).items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}})
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
    <section class="data-panel"><h2>最近投标</h2><p v-if="error" class="error">{{error}}</p><table v-else-if="items.length"><thead><tr><th>编号</th><th>项目</th><th>截止时间</th><th>状态</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{item.code}}</td><td>{{item.projectName}}</td><td>{{item.deadlineAt}}</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无投标申请</p></section>
  </main>
</template>
