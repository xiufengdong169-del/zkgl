<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { demoBannerText, shouldShowDemoBanner } from "./demo-banner";
import { visibleNavigation } from "./navigation";
import { useAuthStore } from "./stores/auth";

const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const showNavigation = computed(() => route.name !== "login");
const showDemoBanner = computed(() => showNavigation.value && shouldShowDemoBanner());
const menuItems = computed(() =>
  visibleNavigation(auth.user?.permissionCodes ?? []),
);

const roleNameMap: Record<string, string> = {
  ADMIN: "系统管理员",
  COMPANY_PRINCIPAL: "公司负责人",
  MARKET_BUSINESS: "市场商务",
  PROJECT_MANAGER: "项目经理",
  PROJECT_MEMBER: "项目成员",
  BID_STAFF: "投标人员",
  BIDDER: "投标人员",
  FINANCE: "商务财务",
  EMPLOYEE: "普通员工",
  HR_ADMINISTRATION: "人事行政",
};

const currentUserText = computed(() => {
  const roles = auth.user?.roleCodes ?? [];
  if (!roles.length) return "未分配角色";
  const roleNames = auth.user?.roleNames ?? [];
  return roles
    .map((role, index) => roleNames[index] || roleNameMap[role] || role)
    .join("、");
});

async function signOut() {
  if (
    typeof window !== "undefined" &&
    !window.confirm("确认退出当前系统吗？")
  )
    return;
  await auth.signOut();
  await router.push({ name: "login" });
}
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
      <div v-if="auth.authenticated" class="sidebar-footer">
        <span>当前登录：{{ currentUserText }}</span>
        <button type="button" @click="signOut">退出系统</button>
      </div>
    </aside>
    <div class="content">
      <div v-if="showDemoBanner" class="demo-banner">{{ demoBannerText }}</div>
      <RouterView />
    </div>
  </div>
  <RouterView v-else />
</template>
