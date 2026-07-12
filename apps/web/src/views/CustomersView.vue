<script setup lang="ts">
import type { CounterpartySummary } from '@zkgl/shared'
import { onMounted, ref } from 'vue'
import { callApi } from '../api'
import { useAuthStore } from '../stores/auth'

const items = ref<CounterpartySummary[]>([])
const auth=useAuthStore(),showForm=ref(false),saving=ref(false)
const form=ref({name:'',shortName:'',type:'CUSTOMER',industry:'',region:'',phone:'',remark:''})
const loading = ref(false)
const error = ref<string|null>(null)
async function load() {
  loading.value=true; error.value=null
  try { const result=await callApi<{items:CounterpartySummary[]}>('crm.counterparty.list',{page:1,pageSize:20}); items.value=result.items }
  catch (cause) { error.value=cause instanceof Error?cause.message:'加载失败' }
  finally { loading.value=false }
}
onMounted(load)
async function createCounterparty(){
  if(!auth.user)return
  saving.value=true;error.value=null
  try{await callApi('crm.counterparty.create',{...form.value,shortName:form.value.shortName||null,industry:form.value.industry||null,region:form.value.region||null,phone:form.value.phone||null,remark:form.value.remark||null,ownerId:auth.user.employeeId});showForm.value=false;form.value={name:'',shortName:'',type:'CUSTOMER',industry:'',region:'',phone:'',remark:''};await load()}
  catch(cause){error.value=cause instanceof Error?cause.message:'保存失败'}finally{saving.value=false}
}
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
      <button class="primary-action" @click="showForm=!showForm">{{showForm?'取消':'新增往来单位'}}</button>
    </header>
    <form v-if="showForm" class="entity-form" @submit.prevent="createCounterparty">
      <label>单位名称<input v-model="form.name" required minlength="2" maxlength="255"></label>
      <label>单位简称<input v-model="form.shortName" maxlength="128"></label>
      <label>单位类型<select v-model="form.type"><option value="CUSTOMER">客户</option><option value="SUPPLIER">供应商</option><option value="GENERAL_CONTRACTOR">总包单位</option><option value="PARTNER">合作伙伴</option><option value="OTHER">其他</option></select></label>
      <label>所属行业<input v-model="form.industry" maxlength="128"></label><label>地区<input v-model="form.region" maxlength="128"></label><label>电话<input v-model="form.phone" maxlength="32"></label>
      <label class="wide">备注<textarea v-model="form.remark" maxlength="1000"></textarea></label>
      <button type="submit" :disabled="saving">{{saving?'保存中…':'保存单位'}}</button>
    </form>
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
