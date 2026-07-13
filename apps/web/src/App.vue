<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { visibleNavigation } from "./navigation";
import { useAuthStore } from "./stores/auth";

const route = useRoute(),
  auth = useAuthStore();
const showNavigation = computed(() => route.name !== "login");
const menuItems = computed(() =>
  visibleNavigation(auth.user?.permissionCodes ?? []),
);
</script>

<template>
  <div v-if="showNavigation" class="app-frame">
    <aside class="sidebar">
      <div class="brand">众肯科技<small>项目全过程管理</small></div>
      <nav>
        <RouterLink v-for="item in menuItems" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <div class="content"><RouterView /></div>
  </div>
  <RouterView v-else />
</template>
