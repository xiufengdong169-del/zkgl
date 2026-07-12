<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const showNavigation = computed(() => route.name !== 'login')
</script>

<template>
  <div v-if="showNavigation" class="app-frame">
    <aside class="sidebar">
      <div class="brand">众肯科技<small>项目全过程管理</small></div>
      <nav>
        <RouterLink to="/">工作台</RouterLink>
        <RouterLink to="/customers">客户管理</RouterLink>
        <RouterLink to="/leads">市场线索</RouterLink>
        <RouterLink to="/projects">项目管理</RouterLink>
        <RouterLink to="/bids">投标管理</RouterLink>
        <RouterLink to="/contracts">合同管理</RouterLink>
        <RouterLink to="/approvals">审批待办</RouterLink>
      </nav>
    </aside>
    <div class="content"><RouterView /></div>
  </div>
  <RouterView v-else />
</template>
