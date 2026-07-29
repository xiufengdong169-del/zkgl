<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth'
import { resolveLoginRedirectTarget } from '../login-redirect'

const username = ref('')
const password = ref('')
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

async function submit() {
  await auth.signIn(username.value.trim(), password.value)
  await router.push(resolveLoginRedirectTarget(route.query.redirect))
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <p class="eyebrow">ZHONGKEN PROJECTS</p>
      <h1>众肯项目管理系统</h1>
      <p class="muted">使用管理员分配的内部账号登录</p>
      <label>用户名<input v-model="username" autocomplete="username" required /></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>
      <button type="submit" :disabled="auth.loading">{{ auth.loading ? '登录中…' : '登录' }}</button>
    </form>
  </main>
</template>
