import { defineStore } from 'pinia'

import { cloudbaseAuth } from '../cloudbase'

interface AuthState {
  loading: boolean
  authenticated: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ loading: false, authenticated: false, error: null }),
  actions: {
    async signIn(username: string, password: string) {
      this.loading = true
      this.error = null
      try {
        const { error } = await cloudbaseAuth.signInWithPassword({ username, password })
        if (error) throw error
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
    }
  }
})
