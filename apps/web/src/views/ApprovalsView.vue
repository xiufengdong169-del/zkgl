<script setup lang="ts">
import {onMounted,ref}from'vue';import{callApi}from'../api'
const filters = ['待我审批', '我发起的', '抄送我的', '已处理']
interface Task{id:string;instanceId:string;instanceCode:string;title:string;businessType:string;nodeOrder:number;positionCode:string;assignedAt:string}
const tasks=ref<Task[]>([]),error=ref<string|null>(null),processing=ref<string|null>(null)
async function load(){try{tasks.value=(await callApi<{items:Task[]}>('approval.task.list',{page:1,pageSize:20})).items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}};onMounted(load)
async function act(task:Task,action:'APPROVE'|'RETURN'|'REJECT'){processing.value=task.id;error.value=null;try{await callApi('approval.task.action',{taskId:task.id,action,actionKey:crypto.randomUUID(),comment:null});await load()}catch(e){error.value=e instanceof Error?e.message:'操作失败'}finally{processing.value=null}}
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
    <p v-if="error" class="error">{{error}}</p>
    <section v-if="tasks.length" class="approval-list"><article v-for="task in tasks" :key="task.id"><div><small>{{task.instanceCode}} · {{task.positionCode}}</small><h2>{{task.title}}</h2><p>{{task.businessType}} · {{task.assignedAt}}</p></div><div class="approval-actions"><button :disabled="processing===task.id" @click="act(task,'APPROVE')">同意</button><button class="secondary" :disabled="processing===task.id" @click="act(task,'RETURN')">退回</button><button class="danger" :disabled="processing===task.id" @click="act(task,'REJECT')">驳回</button></div></article></section>
    <section v-else class="empty-state">
      <span>✓</span>
      <h2>当前没有待审批事项</h2>
      <p>新的审批任务会根据岗位配置和金额阈值自动进入这里。</p>
    </section>
  </main>
</template>
