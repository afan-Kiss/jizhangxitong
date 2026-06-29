import axios from 'axios'
import { showToast } from 'vant'

const api = axios.create({ baseURL: '/api', timeout: 60000 })

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
        window.location.href = '/login'
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
  return `/api/files/${fileId}/view?token=${token}`
}

export function fileThumbUrl(fileId: number) {
  const token = localStorage.getItem('token')
  return `/api/files/${fileId}/thumb?token=${token}`
}

export function braceletImageUrl(braceletId: number) {
  const token = localStorage.getItem('token')
  return `/api/bracelets/detail/${braceletId}/image?token=${token}`
}
