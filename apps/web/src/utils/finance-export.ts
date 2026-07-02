import { withBase } from '../api'

export async function downloadFinanceExcel(params: {
  startDate: string
  endDate: string
  title?: string
  token?: string
}) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    format: 'xlsx',
    title: params.title || '项目资金支出对账表',
  })
  if (params.token) q.set('token', params.token)
  const url = withBase(`/api/finance/export?${q.toString()}`)
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('token')
  if (token && !params.token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message || '导出失败')
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `项目资金对账_${params.startDate}_${params.endDate}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}
