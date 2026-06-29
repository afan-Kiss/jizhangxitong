import { defineStore } from 'pinia'
import api, { resolveApiErrorMessage } from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null as { id: number; username: string; name: string } | null,
    permissions: [] as string[],
    workerOnline: false,
    sessionReady: false,
  }),
  actions: {
    async login(username: string, password: string) {
      const res = await api.post('/auth/login', { username, password })
      if (!res.data?.success || !res.data?.data?.token) {
        const err = new Error('登录失败') as Error & { userMessage?: string }
        err.userMessage = res.data?.message || '登录失败，请重试'
        throw err
      }
      this.token = res.data.data.token
      this.user = res.data.data.user
      localStorage.setItem('token', this.token)
      try {
        await this.fetchMe()
      } catch (e) {
        this.logout()
        const err = new Error('登录状态校验失败') as Error & { userMessage?: string }
        err.userMessage = '登录状态校验失败，请重新登录'
        throw err.userMessage ? err : e
      }
      if (!this.user) {
        this.logout()
        const err = new Error('登录状态校验失败') as Error & { userMessage?: string }
        err.userMessage = '登录状态校验失败，请重新登录'
        throw err
      }
    },
    async fetchMe() {
      if (!this.token) return
      const res = await api.get('/auth/me')
      if (!res.data?.success || !res.data?.data?.user) {
        const err = new Error('获取用户信息失败') as Error & { userMessage?: string }
        err.userMessage = res.data?.message || '登录状态校验失败，请重新登录'
        throw err
      }
      this.user = res.data.data.user
      this.permissions = res.data.data.permissions || []
    },
    async initSession() {
      if (!this.token) {
        this.sessionReady = true
        return
      }
      try {
        await this.fetchMe()
      } catch {
        this.logout()
      } finally {
        this.sessionReady = true
      }
    },
    async fetchWorkerStatus() {
      try {
        const res = await api.get('/local-worker/status')
        this.workerOnline = res.data.data.online
      } catch {
        this.workerOnline = false
      }
    },
    hasPermission(code: string) {
      return this.permissions.includes(code)
    },
    logout() {
      this.token = ''
      this.user = null
      this.permissions = []
      localStorage.removeItem('token')
    },
  },
})

export function formatAuthError(err: unknown): string {
  return resolveApiErrorMessage(err)
}
