<script setup lang="ts">
import { onMounted,ref } from 'vue';import { callApi } from '../api';import {useAuthStore} from '../stores/auth'
interface BidRow{id:string;code:string;projectName:string;deadlineAt:string;status:string}
interface Option{id:string;projectName?:string;name?:string};const auth=useAuthStore(),items=ref<BidRow[]>([]),projects=ref<Option[]>([]),customers=ref<Option[]>([]),error=ref<string|null>(null),showForm=ref(false),saving=ref(false)
const form=ref({projectId:'',tendererId:'',tenderNumber:'',projectBudget:null as number|null,bidCeiling:null as number|null,deadlineAt:'',openingAt:'',bidLocation:'',bidMethod:'ONLINE',depositAmount:0,documentFee:0,applicationReason:''})
async function load(){try{const [b,p,c]=await Promise.all([callApi<{items:BidRow[]}>('bid.application.list',{page:1,pageSize:20}),callApi<{items:Option[]}>('project.list',{page:1,pageSize:50}),callApi<{items:Option[]}>('crm.counterparty.list',{page:1,pageSize:50})]);items.value=b.items;projects.value=p.items;customers.value=c.items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}};onMounted(load)
async function createBid(){if(!auth.user)return;saving.value=true;error.value=null;try{await callApi('bid.application.create',{...form.value,agencyId:null,tenderNumber:form.value.tenderNumber||null,registrationAt:null,documentPurchaseAt:null,clarificationAt:null,deadlineAt:new Date(form.value.deadlineAt).toISOString(),openingAt:form.value.openingAt?new Date(form.value.openingAt).toISOString():null,bidLocation:form.value.bidLocation||null,businessOwnerId:auth.user.employeeId,technicalOwnerId:auth.user.employeeId,pricingOwnerId:auth.user.employeeId});showForm.value=false;await load()}catch(e){error.value=e instanceof Error?e.message:'保存失败'}finally{saving.value=false}}
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
    <header class="page-header"><div><p class="eyebrow">BIDDING</p><h1>投标管理</h1></div><button class="primary-action" @click="showForm=!showForm">{{showForm?'取消':'新增投标申请'}}</button></header>
    <form v-if="showForm" class="entity-form" @submit.prevent="createBid"><label>项目<select v-model="form.projectId" required><option value="" disabled>请选择</option><option v-for="p in projects" :key="p.id" :value="p.id">{{p.projectName}}</option></select></label><label>招标人<select v-model="form.tendererId" required><option value="" disabled>请选择</option><option v-for="c in customers" :key="c.id" :value="c.id">{{c.name}}</option></select></label><label>招标编号<input v-model="form.tenderNumber"></label><label>项目预算<input v-model.number="form.projectBudget" type="number" min="0" step="0.01"></label><label>投标限价<input v-model.number="form.bidCeiling" type="number" min="0" step="0.01"></label><label>投标方式<select v-model="form.bidMethod"><option value="ONLINE">线上</option><option value="OFFLINE">线下</option></select></label><label>截止时间<input v-model="form.deadlineAt" type="datetime-local" required></label><label>开标时间<input v-model="form.openingAt" type="datetime-local"></label><label>投标地点<input v-model="form.bidLocation"></label><label>保证金<input v-model.number="form.depositAmount" type="number" min="0" step="0.01"></label><label>标书费<input v-model.number="form.documentFee" type="number" min="0" step="0.01"></label><label class="wide">申请说明<textarea v-model="form.applicationReason" required minlength="2"></textarea></label><button :disabled="saving">{{saving?'保存中…':'保存申请'}}</button></form>
    <section class="module-grid bid-grid">
      <article v-for="([title, detail], index) in areas" :key="title" class="module-card">
        <span class="module-icon">{{ String(index + 1).padStart(2, '0') }}</span><h2>{{ title }}</h2><p>{{ detail }}</p>
      </article>
    </section>
    <section class="data-panel"><h2>最近投标</h2><p v-if="error" class="error">{{error}}</p><table v-else-if="items.length"><thead><tr><th>编号</th><th>项目</th><th>截止时间</th><th>状态</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{item.code}}</td><td>{{item.projectName}}</td><td>{{item.deadlineAt}}</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无投标申请</p></section>
  </main>
</template>
