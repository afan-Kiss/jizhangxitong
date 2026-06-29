import type { AxiosError } from 'axios'

export function isLoginRoute(): boolean {
  const path = window.location.pathname
  return path.endsWith('/login') || path.includes('/login')
}

/** 将 axios / 网络错误转为用户可读的大白话 */
export function resolveApiErrorMessage(err: unknown): string {
  const e = err as AxiosError<{ message?: string }> & { userMessage?: string }
  if (e.userMessage) return e.userMessage

  if (!e.response) {
    if (e.code === 'ECONNABORTED') return '请求超时，请重试。'
    return '连接服务器失败，请检查网络或稍后再试。'
  }

  const status = e.response.status
  const msg = e.response.data?.message?.trim()

  if (status === 401) {
    if (isLoginRoute()) return msg || '用户名或密码错误'
    return msg || '登录已过期，请重新登录'
  }
  if (status === 403) return msg || '没有权限执行此操作'
  if (status >= 500) return '服务器开小差了，稍后再试。'
  return msg || '操作失败，请重试'
}
