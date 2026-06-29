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

export function fileViewUrl(fileId: number) {
  const token = localStorage.getItem('token')
  return withBase(`/api/files/${fileId}/view?token=${token}`)
}

export function fileThumbUrl(fileId: number) {
  const token = localStorage.getItem('token')
  return withBase(`/api/files/${fileId}/thumb?token=${token}`)
}

export function braceletImageUrl(braceletId: number) {
  const token = localStorage.getItem('token')
  return withBase(`/api/bracelets/detail/${braceletId}/image?token=${token}`)
}

export { withBase, loginPath }
