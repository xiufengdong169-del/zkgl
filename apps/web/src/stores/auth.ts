import { defineStore } from 'pinia'
import type { SessionUser } from '@zkgl/shared'

import { cloudbaseAuth } from '../cloudbase'
import { callApi } from '../api'

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
      try {
        const { error } = await cloudbaseAuth.signInWithPassword({ username, password })
        if (error) throw error
        this.user = await callApi<SessionUser>('session.get')
        this.authenticated = true
      } catch (error) {
        this.authenticated = false
        this.error = error instanceof Error ? error.message : '登录失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async signOut() {
      await cloudbaseAuth.signOut()
      this.authenticated = false
      this.user = null
    },
    async ensureSession() {
      if (this.user && this.authenticated) return this.user
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
