import { ref } from 'vue'
import { showToast } from 'vant'
import { buildQianfanOrderUrl } from '@jade-account/shared'

const qianfanTemplate = ref('')
const qianfanEnabled = ref(false)

export async function loadQianfanConfig(api: { get: (url: string) => Promise<{ data: any }> }) {
  try {
    const [health, settings] = await Promise.all([
      api.get('/health'),
      api.get('/settings'),
    ])
    qianfanEnabled.value = !!(
      health.data.qianfanOrderLinkEnabled
      || settings.data.data?.qianfanOrderLinkEnabled
    )
    const tpl = settings.data.data?.settings?.qianfan_order_detail_url_template
    if (tpl) qianfanTemplate.value = tpl
  } catch {
    qianfanEnabled.value = false
  }
}

export function orderDetailUrl(orderNo?: string | null): string | null {
  if (!orderNo?.trim()) return null
  if (qianfanTemplate.value) {
    return buildQianfanOrderUrl(qianfanTemplate.value, orderNo)
  }
  return buildQianfanOrderUrl(
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_QIANFAN_ORDER_DETAIL_URL_TEMPLATE) || '',
    orderNo,
  )
}

export function copyOrderNo(orderNo?: string | null) {
  if (!orderNo?.trim()) return
  navigator.clipboard?.writeText(orderNo.trim()).then(() => {
    showToast('已复制订单号')
  }).catch(() => {
    showToast(orderNo.trim())
  })
}

export function openQianfan(orderNo?: string | null) {
  const url = orderDetailUrl(orderNo)
  if (url) window.open(url, '_blank', 'noopener')
  else copyOrderNo(orderNo)
}

export function useQianfan() {
  return { qianfanEnabled, qianfanTemplate, loadQianfanConfig, orderDetailUrl, copyOrderNo, openQianfan }
}
