<script setup lang="ts">import {onMounted,ref} from 'vue';import {callApi} from '../api';interface Row{id:string;code:string;contractName:string;contractType:string;taxExclusiveAmount:string;amountStatus:string;status:string};const items=ref<Row[]>([]),error=ref<string|null>(null);onMounted(async()=>{try{items.value=(await callApi<{items:Row[]}>('contract.list',{page:1,pageSize:20})).items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}})</script>
<template>
  <main class="page">
    <header class="page-header"><div><p class="eyebrow">CONTRACTS</p><h1>合同管理</h1></div><button class="primary-action">新增合同</button></header>
    <section class="contract-panels">
      <article><p>收入合同</p><strong>¥ 0.00</strong><small>确认不含税金额</small></article>
      <article><p>支出合同</p><strong>¥ 0.00</strong><small>有效履约金额</small></article>
      <article><p>临期提醒</p><strong>0</strong><small>未来 30 天到期</small></article>
    </section>
    <section v-if="!items.length && !error" class="empty-state"><span>合</span><h2>暂无合同记录</h2><p>合同审批、变更、履约节点和到期提醒将在这里统一管理。</p></section>
    <section class="data-panel"><h2>最近合同</h2><p v-if="error" class="error">{{error}}</p><table v-else-if="items.length"><thead><tr><th>编号</th><th>名称</th><th>类型</th><th>不含税金额</th><th>状态</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{item.code}}</td><td>{{item.contractName}}</td><td>{{item.contractType}}</td><td>{{item.taxExclusiveAmount}}</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无合同</p></section>
  </main>
</template>
