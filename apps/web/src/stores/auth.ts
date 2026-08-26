import { defineStore } from 'pinia'
import type { SessionUser } from '@zkgl/shared'

import { getCloudbaseAuth } from '../cloudbase'
import {
  callApi,
  clearLocalAuthTokenOverride,
  localAuthMode,
  setLocalAuthTokenOverride,
} from '../api'
import { demoMode, demoUser } from '../demo'

interface AuthState {
  loading: boolean
  authenticated: boolean
  error: string | null
  user: SessionUser | null
}

const localAuthTokensByUsername: Record<string, string> = {
  admin: 'local-admin-token-0001',
  管理员: 'local-admin-token-0001',
  ceo: 'local-ceo-token-0001',
  公司负责人: 'local-ceo-token-0001',
  biz: 'local-biz-token-0001',
  市场商务: 'local-biz-token-0001',
  pm: 'local-pm-token-0001',
  项目经理: 'local-pm-token-0001',
  finance: 'local-fin-token-0001',
  财务: 'local-fin-token-0001',
  bid: 'local-bid-token-0001',
  投标人员: 'local-bid-token-0001',
  member: 'local-member-token-0001',
  项目成员: 'local-member-token-0001',
  none: 'local-none-token-0001',
  无权用户: 'local-none-token-0001',
}

function localAuthTokenFor(username: string) {
  return localAuthTokensByUsername[username.trim().toLowerCase()] ?? 'local-admin-token-0001'
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ loading: false, authenticated: false, error: null, user: null }),
  actions: {
    async signIn(username: string, password: string) {
      this.loading = true
      this.error = null
      if (demoMode) {
        this.user = demoUser
        this.authenticated = true
        this.loading = false
        return
      }
      let cloudbaseSignedIn = false
      let cloudbaseAuth: ReturnType<typeof getCloudbaseAuth> | null = null
      try {
        if (localAuthMode) {
          if (!username.trim() || !password) throw new Error('请输入本地测试账号和口令')
          setLocalAuthTokenOverride(localAuthTokenFor(username))
          this.user = await callApi<SessionUser>('session.get')
          this.authenticated = true
          return
        }
        cloudbaseAuth = getCloudbaseAuth()
        const { error } = await cloudbaseAuth.signInWithPassword({ username, password })
        if (error) throw error
        cloudbaseSignedIn = true
        this.user = await callApi<SessionUser>('session.get')
        this.authenticated = true
      } catch (error) {
        if (cloudbaseSignedIn && cloudbaseAuth) await cloudbaseAuth.signOut().catch(() => undefined)
        this.authenticated = false
        this.user = null
        this.error = error instanceof Error ? error.message : '登录失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async signOut() {
      if (demoMode) {
        this.authenticated = false
        this.user = null
        return
      }
      if (!localAuthMode) await getCloudbaseAuth().signOut()
      else clearLocalAuthTokenOverride()
      this.authenticated = false
      this.user = null
    },
    async ensureSession() {
      if (this.user && this.authenticated) return this.user
      if (demoMode) {
        this.user = demoUser
        this.authenticated = true
        return this.user
      }
      try {
        this.user = await callApi<SessionUser>('session.get')
        this.authenticated = true
        return this.user
      } catch {
        this.user = null
        this.authenticated = false
        throw new Error('需要登录')
      }
    }
  }
})
