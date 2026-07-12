<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { callApi } from '../api'
interface ProjectRow{id:string;code:string;projectName:string;status:string}
interface ApplicationRow{id:string;code:string;projectName:string;estimatedProfit:string;status:string}
const projects=ref<ProjectRow[]>([]),applications=ref<ApplicationRow[]>([]),error=ref<string|null>(null)
onMounted(async()=>{try{const [p,a]=await Promise.all([callApi<{items:ProjectRow[]}>('project.list',{page:1,pageSize:20}),callApi<{items:ApplicationRow[]}>('project.application.list',{page:1,pageSize:20})]);projects.value=p.items;applications.value=a.items}catch(e){error.value=e instanceof Error?e.message:'加载失败'}})
const workflow = [
  { number: '01', title: '立项申请', detail: '申请编号独立生成，驳回重提保持不变' },
  { number: '02', title: '审批确认', detail: '经营负责人及公司负责人按配置审批' },
  { number: '03', title: '正式项目', detail: '仅审批通过后生成唯一、不可修改的项目编号' }
]
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div><p class="eyebrow">PROJECT PORTFOLIO</p><h1>项目管理</h1></div>
      <button class="primary-action">发起立项申请</button>
    </header>
    <section class="project-summary">
      <div><strong>0</strong><span>审批中的立项</span></div>
      <div><strong>0</strong><span>实施中的项目</span></div>
      <div><strong>0</strong><span>待处理事项</span></div>
    </section>
    <section class="workflow-card">
      <p class="eyebrow">ESTABLISHMENT WORKFLOW</p>
      <div class="workflow-steps">
        <article v-for="step in workflow" :key="step.number">
          <span>{{ step.number }}</span>
          <h2>{{ step.title }}</h2>
          <p>{{ step.detail }}</p>
        </article>
      </div>
    </section>
    <p v-if="error" class="error">{{error}}</p>
    <section class="data-panel"><h2>正式项目</h2><table v-if="projects.length"><thead><tr><th>编号</th><th>项目名称</th><th>状态</th></tr></thead><tbody><tr v-for="item in projects" :key="item.id"><td>{{item.code}}</td><td>{{item.projectName}}</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无正式项目</p></section>
    <section class="data-panel"><h2>立项申请</h2><table v-if="applications.length"><thead><tr><th>申请编号</th><th>项目名称</th><th>预计利润</th><th>状态</th></tr></thead><tbody><tr v-for="item in applications" :key="item.id"><td>{{item.code}}</td><td>{{item.projectName}}</td><td>{{item.estimatedProfit}}</td><td>{{item.status}}</td></tr></tbody></table><p v-else>暂无立项申请</p></section>
  </main>
</template>
