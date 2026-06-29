import axios from 'axios'
import { showToast } from 'vant'
import { basePath, loginPath, withBase } from '../utils/base-path'

const apiBase = `${basePath}/api`
const api = axios.create({ baseURL: apiBase, timeout: 60000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = loginPath()
      }
    } else {
      showToast(msg)
    }
    return Promise.reject(err)
  },
)

export default api

export async function uploadFile(file: File, fileType: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('fileType', fileType)
  const res = await api.post('/files/upload', form)
  return res.data.data
}

const accessTokenCache = new Map<number, { token: string; expiresAt: number }>()

export async function getFileAccessUrl(fileId: number, kind: 'view' | 'thumb' = 'view') {
  const cached = accessTokenCache.get(fileId)
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return withBase(`/api/files/${fileId}/${kind}?accessToken=${encodeURIComponent(cached.token)}`)
  }
  const res = await api.post(`/files/${fileId}/access-token`)
  const { token, expiresAt } = res.data.data
  accessTokenCache.set(fileId, { token, expiresAt: new Date(expiresAt).getTime() })
  return withBase(`/api/files/${fileId}/${kind}?accessToken=${encodeURIComponent(token)}`)
}

export async function fileViewUrl(fileId: number) {
  return getFileAccessUrl(fileId, 'view')
}

export async function fileThumbUrl(fileId: number) {
  return getFileAccessUrl(fileId, 'thumb')
}

const braceletTokenCache = new Map<number, { token: string; expiresAt: number }>()

export async function braceletImageUrl(braceletId: number) {
  const cached = braceletTokenCache.get(braceletId)
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return withBase(`/api/bracelets/detail/${braceletId}/image?accessToken=${encodeURIComponent(cached.token)}`)
  }
  const res = await api.post(`/bracelets/detail/${braceletId}/image-access-token`)
  const { token, expiresAt } = res.data.data
  braceletTokenCache.set(braceletId, { token, expiresAt: new Date(expiresAt).getTime() })
  return withBase(`/api/bracelets/detail/${braceletId}/image?accessToken=${encodeURIComponent(token)}`)
}

export { withBase, loginPath }
