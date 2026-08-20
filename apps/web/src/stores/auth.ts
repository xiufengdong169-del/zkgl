import { defineStore } from 'pinia'
import type { SessionUser } from '@zkgl/shared'

import { cloudbaseAuth } from '../cloudbase'
import { callApi, localAuthMode } from '../api'
import { demoMode, demoUser } from '../demo'

interface AuthState {
  loading: boolean
  authenticated: boolean
  error: string | null
  user: SessionUser | null
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
      try {
        if (localAuthMode) {
          if (!username.trim() || !password) throw new Error('请输入本地测试账号和口令')
          this.user = await callApi<SessionUser>('session.get')
          this.authenticated = true
          return
        }
        const { error } = await cloudbaseAuth.signInWithPassword({ username, password })
        if (error) throw error
        cloudbaseSignedIn = true
        this.user = await callApi<SessionUser>('session.get')
        this.authenticated = true
      } catch (error) {
        if (cloudbaseSignedIn) await cloudbaseAuth.signOut().catch(() => undefined)
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
      await cloudbaseAuth.signOut()
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
