import { ref } from 'vue'
import { showToast } from 'vant'
import api, { withBase } from '../api'
import { copyTextToClipboard } from '../utils/clipboard'

const qianfanEnabled = ref(false)

export async function loadQianfanConfig(apiClient: { get: (url: string) => Promise<{ data: any }> }) {
  try {
    const [health, settings] = await Promise.all([
      apiClient.get('/health'),
      apiClient.get('/settings'),
    ])
    qianfanEnabled.value = !!(
      health.data.qianfanOrderLinkEnabled
      || settings.data.data?.qianfanOrderLinkEnabled
    )
  } catch {
    qianfanEnabled.value = false
  }
}

export async function copyOrderNo(orderNo?: string | null) {
  const value = orderNo?.trim()
  if (!value) return
  const ok = await copyTextToClipboard(value)
  if (ok) showToast('已复制订单号')
  else showToast('复制失败，请长按订单号手动复制')
}

export async function openQianfan(orderNo?: string | null, shopKey?: string | null) {
  const value = orderNo?.trim()
  if (!value) return
  try {
    const res = await api.post('/qianfan/order-detail-ticket', {
      orderNo: value,
      shopKey: shopKey?.trim() || undefined,
    }, { skipGlobalToast: true })
    const openUrl = res.data.data?.openUrl
    if (!openUrl) {
      showToast('暂时无法打开千帆订单详情')
      return
    }
    window.open(withBase(openUrl), '_blank', 'noopener,noreferrer')
  } catch (err: unknown) {
    const msg = (err as { userMessage?: string })?.userMessage
      || (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      || '打开千帆失败，可先复制订单号'
    showToast(msg)
  }
}

export function useQianfan() {
  return { qianfanEnabled, loadQianfanConfig, copyOrderNo, openQianfan }
}
