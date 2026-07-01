import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'

const enabled = ref(true)
const recognizing = ref(false)
const result = ref<any>(null)
const profit = ref<any>(null)
const bindGoodsCode = ref('')

export function useScanWorkbench() {
  const router = useRouter()

  async function loadStatus() {
    try {
      const st = await api.get('/scan/status')
      enabled.value = st.data.data?.enabled !== false
    } catch {
      enabled.value = false
    }
    return enabled.value
  }

  async function loadProfit(goodsId: number) {
    try {
      const res = await api.get(`/goods/${goodsId}/profit`)
      profit.value = res.data.data
    } catch {
      profit.value = null
    }
  }

  async function recognize(code: string, source: 'manual' | 'camera' = 'manual') {
    const raw = String(code || '').trim()
    if (!raw) return false
    if (!enabled.value) {
      showToast('扫码工作台未启用')
      return false
    }
    recognizing.value = true
    result.value = null
    profit.value = null
    try {
      const res = await api.post('/scan/recognize', { code: raw, source })
      result.value = res.data.data
      if (res.data.data.goods?.id) {
        await loadProfit(res.data.data.goods.id)
      }
      return true
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg || '识别失败，再试一次')
      return false
    } finally {
      recognizing.value = false
    }
  }

  async function createGoods(code: string) {
    const normalized = String(code || '').trim()
    if (!normalized) return
    try {
      await api.post('/goods', { code: normalized })
      showToast('货品已创建')
      await recognize(normalized)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg || '创建失败')
    }
  }

  async function bindOrderGoods() {
    const order = result.value?.order
    const code = bindGoodsCode.value.trim().toUpperCase()
    if (!order || !code) {
      showToast('请输入货品码')
      return
    }
    try {
      await api.post('/scan/orders/bind-goods', {
        orderId: order.id || undefined,
        draftId: order.draftId || undefined,
        orderNo: order.orderNo,
        goodsCode: code,
      })
      showToast('已关联货品')
      bindGoodsCode.value = ''
      await recognize(order.orderNo || code)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg || '关联失败')
    }
  }

  function goExpense(goods?: { id: number; code: string }) {
    const g = goods || result.value?.goods
    if (!g?.id) return
    router.push({ path: '/expense/create', query: { goodsId: String(g.id), goodsCode: g.code } })
  }

  function goCustomerExpense(businessType: string) {
    const order = result.value?.order
    const query: Record<string, string> = { businessType }
    if (order?.orderNo) query.externalOrderNo = order.orderNo
    if (order?.saleId) query.saleId = String(order.saleId)
    router.push({ path: '/expense/create', query })
  }

  function goManualOrderExpense(fallbackCode?: string) {
    const code = result.value?.normalizedCode || fallbackCode || ''
    const query: Record<string, string> = {}
    if (code) query.externalOrderNo = code
    router.push({ path: '/expense/create', query })
  }

  function goOrderProfit() {
    const order = result.value?.order
    if (order?.orderNo) {
      router.push({ path: '/expense/create', query: { externalOrderNo: order.orderNo } })
    }
  }

  function resetResult() {
    result.value = null
    profit.value = null
    bindGoodsCode.value = ''
  }

  return {
    enabled,
    recognizing,
    result,
    profit,
    bindGoodsCode,
    loadStatus,
    recognize,
    createGoods,
    bindOrderGoods,
    goExpense,
    goCustomerExpense,
    goManualOrderExpense,
    goOrderProfit,
    resetResult,
  }
}
