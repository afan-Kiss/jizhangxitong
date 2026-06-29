/** 生产部署在 /account/ 子路径时的 URL 辅助 */
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

export function withBase(path: string): string {
  if (!path || path.startsWith('http://') || path.startsWith('https://')) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${normalized}`.replace(/([^:]\/)\/+/g, '$1')
}

export function loginPath(): string {
  return withBase('/login')
}
