import { defineStore } from 'pinia'
import api from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null as { id: number; username: string; name: string } | null,
    permissions: [] as string[],
    workerOnline: false,
  }),
  actions: {
    async login(username: string, password: string) {
      const res = await api.post('/auth/login', { username, password })
      this.token = res.data.data.token
      this.user = res.data.data.user
      localStorage.setItem('token', this.token)
      await this.fetchMe()
    },
    async fetchMe() {
      if (!this.token) return
      const res = await api.get('/auth/me')
      this.user = res.data.data.user
      this.permissions = res.data.data.permissions || []
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
