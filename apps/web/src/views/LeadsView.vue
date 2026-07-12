<script setup lang="ts">
import type { LeadSummary } from '@zkgl/shared'
import { onMounted, ref } from 'vue'
import { callApi } from '../api'
import { useAuthStore } from '../stores/auth'
const items=ref<LeadSummary[]>([]),error=ref<string|null>(null),loading=ref(false)
interface CustomerOption{id:string;name:string}
const auth=useAuthStore(),customers=ref<CustomerOption[]>([]),showForm=ref(false),saving=ref(false)
const form=ref({projectName:'',customerId:'',sourceCode:'VISIT',discoveredOn:new Date().toISOString().slice(0,10),estimatedAmount:null as number|null,estimatedStartOn:null as string|null,projectType:'CONSULTING',requirementSummary:'',successProbability:50,nextFollowUpAt:null as string|null})
async function load(){loading.value=true;try{const [leads,customerResult]=await Promise.all([callApi<{items:LeadSummary[]}>('lead.list',{page:1,pageSize:20}),callApi<{items:CustomerOption[]}>('crm.counterparty.list',{page:1,pageSize:50})]);items.value=leads.items;customers.value=customerResult.items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}finally{loading.value=false}}
onMounted(load)
async function createLead(){if(!auth.user)return;saving.value=true;error.value=null;try{await callApi('lead.create',{...form.value,estimatedStartOn:form.value.estimatedStartOn||null,ownerId:auth.user.employeeId,collaboratorIds:[],sourceDescription:null,projectBackground:null,competition:null,sourceVisitId:null,nextFollowUpAt:form.value.nextFollowUpAt?new Date(form.value.nextFollowUpAt).toISOString():null});showForm.value=false;await load()}catch(e){error.value=e instanceof Error?e.message:'保存失败'}finally{saving.value=false}}
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
      <button class="primary-action" @click="showForm=!showForm">{{showForm?'取消':'新增线索'}}</button>
    </header>
    <form v-if="showForm" class="entity-form" @submit.prevent="createLead">
      <label>项目名称<input v-model="form.projectName" required minlength="2"></label>
      <label>客户<select v-model="form.customerId" required><option value="" disabled>请选择</option><option v-for="customer in customers" :key="customer.id" :value="customer.id">{{customer.name}}</option></select></label>
      <label>来源<select v-model="form.sourceCode"><option value="VISIT">客户拜访</option><option value="REFERRAL">转介绍</option><option value="PUBLIC">公开信息</option><option value="OTHER">其他</option></select></label>
      <label>发现日期<input v-model="form.discoveredOn" type="date" required></label><label>预计金额<input v-model.number="form.estimatedAmount" type="number" min="0" step="0.01"></label><label>预计启动<input v-model="form.estimatedStartOn" type="date"></label>
      <label>项目类型<select v-model="form.projectType"><option value="CONSULTING">信息化咨询</option><option value="SUPERVISION">信息化监理</option><option value="OTHER">其他</option></select></label><label>成功概率<input v-model.number="form.successProbability" type="number" min="0" max="100" required></label><label>下次跟进<input v-model="form.nextFollowUpAt" type="datetime-local"></label>
      <label class="wide">需求概述<textarea v-model="form.requirementSummary" required minlength="2"></textarea></label><button type="submit" :disabled="saving">{{saving?'保存中…':'保存线索'}}</button>
    </form>
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
