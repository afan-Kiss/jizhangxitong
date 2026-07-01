<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import OrderLink from '../components/OrderLink.vue'
import BraceletCard from '../components/BraceletCard.vue'
import XhsOrderPicker from '../components/XhsOrderPicker.vue'
import type { XhsOrderItem } from '../types/xhs-order'
import { loadQianfanConfig } from '../composables/useQianfan'
import { useScanOverlay } from '../composables/useScanOverlay'

const router = useRouter()
const auth = useAuthStore()
const { isDesktop, useScannerGun } = useBreakpoint()
const scanOverlay = useScanOverlay()
const showMobileCameraBtn = computed(() => !useScannerGun.value)

const enabled = ref(true)
const scanInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const recognizing = ref(false)
const result = ref<any>(null)
const profit = ref<any>(null)
const recent = ref<any[]>([])
const scannerOnline = ref(false)
const bindGoodsCode = ref('')
const lastPollCode = ref('')
const inputFocused = ref(false)
const showXhsPicker = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadStatus() {
  try {
    const [st, rec] = await Promise.all([
      api.get('/scan/status'),
      api.get('/scan/recent?limit=20'),
    ])
    enabled.value = st.data.data?.enabled !== false
    scannerOnline.value = !!st.data.data?.scannerOnline
    recent.value = rec.data.data || []
  } catch {
    enabled.value = false
  }
}

async function loadProfit(goodsId: number) {
  try {
    const res = await api.get(`/goods/${goodsId}/profit`)
    profit.value = res.data.data
  } catch {
    profit.value = null
  }
}

async function recognize(code?: string) {
  const raw = (code ?? scanInput.value).trim()
  if (!raw) return
  if (!enabled.value) {
    showToast('扫码工作台未启用')
    return
  }
  recognizing.value = true
  result.value = null
  profit.value = null
  try {
    const res = await api.post('/scan/recognize', { code: raw, source: 'manual' })
    result.value = res.data.data
    scanInput.value = res.data.data.normalizedCode || raw
    if (res.data.data.goods?.id) {
      await loadProfit(res.data.data.goods.id)
    }
    await loadRecent()
  } catch (err: any) {
    showToast(err.response?.data?.message || '识别失败，再试一次')
  } finally {
    recognizing.value = false
  }
}

async function loadRecent() {
  try {
    const res = await api.get('/scan/recent?limit=20')
    recent.value = res.data.data || []
  } catch { /* ignore */ }
}

function onEnter() {
  recognize()
}

async function createGoods() {
  const code = result.value?.normalizedCode || scanInput.value.trim()
  if (!code) return
  try {
    await api.post('/goods', { code })
    showToast('货品已创建')
    await recognize(code)
  } catch (err: any) {
    showToast(err.response?.data?.message || '创建失败')
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
    await recognize(order.orderNo || scanInput.value)
  } catch (err: any) {
    showToast(err.response?.data?.message || '关联失败')
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

function goManualOrderExpense() {
  const code = scanInput.value.trim()
  const query: Record<string, string> = {}
  if (code) query.externalOrderNo = code
  router.push({ path: '/expense/create', query })
}

function onXhsOrderPicked(order: XhsOrderItem) {
  scanInput.value = order.externalOrderNo
  recognize(order.externalOrderNo)
}

function goOrderProfit() {
  const order = result.value?.order
  if (order?.orderNo) {
    router.push({ path: '/expense/create', query: { externalOrderNo: order.orderNo } })
  }
}

async function pollScannerHealth() {
  try {
    const st = await api.get('/scan/status')
    scannerOnline.value = !!st.data.data?.scannerOnline
  } catch { /* ignore */ }
}

onMounted(async () => {
  await auth.fetchWorkerStatus()
  await loadQianfanConfig(api)
  await loadStatus()
  await nextTick()
  inputRef.value?.focus()
  pollTimer = setInterval(pollScannerHealth, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <AppShell title="扫码工作台" :show-back="!isDesktop" no-tab-pad data-testid="scan-workbench-page">
    <div class="scan-workbench" :class="{ 'scan-workbench--desktop': isDesktop }">
      <div class="scan-workbench__main">
        <LuxuryCard v-if="!enabled" gold data-testid="scan-workbench-disabled">
          <div class="section-title">扫码工作台未启用</div>
          <p class="muted">请联系管理员开启。你仍可以直接记支出。</p>
          <ActionButton block data-testid="scan-paused-expense-btn" @click="router.push('/expense/create')">去记支出</ActionButton>
        </LuxuryCard>

        <template v-else>
          <LuxuryCard padding="16px">
            <p class="scan-workbench__hint muted">
              扫货品码、订单号、物流单号都可以。扫到货品或订单后，可以直接记支出、记客户返款/补偿。
            </p>
            <div class="scan-workbench__scanner-status" data-testid="scan-scanner-status">
              <span :class="scannerOnline ? 'ok' : 'warn'">
                <span class="scanner-dot" :class="scannerOnline ? 'scanner-dot--online' : 'scanner-dot--offline'" />
                {{ scannerOnline ? '出入库系统已连接' : '出入库系统未连接，仍可手动输入' }}
              </span>
            </div>
            <div
              class="scan-input-wrap"
              :class="{ 'scan-input-wrap--focused': inputFocused, 'scan-input-wrap--scanning': recognizing }"
              data-testid="scan-input-wrap"
            >
              <div class="scan-workbench__input-row">
                <input
                  ref="inputRef"
                  v-model="scanInput"
                  class="scan-workbench__input"
                  data-testid="scan-input"
                  placeholder="扫码或输入货品码 / 订单号 / 物流单号"
                  @keydown.enter.prevent="onEnter"
                  @focus="inputFocused = true"
                  @blur="inputFocused = false"
                />
                <ActionButton :loading="recognizing" data-testid="scan-recognize-btn" @click="recognize()">识别</ActionButton>
                <ActionButton block plain v-if="showMobileCameraBtn" data-testid="scan-open-camera-btn" @click="scanOverlay.openScan()">打开手机摄像头扫码</ActionButton>
              </div>
              <ActionButton block plain class="scan-workbench__xhs-btn" data-testid="scan-xhs-order-btn" @click="showXhsPicker = true">查询订单</ActionButton>
            </div>
          </LuxuryCard>

          <LuxuryCard v-if="result" gold data-testid="scan-result-card">
            <div class="section-title">识别结果</div>
            <div class="scan-workbench__meta">
              <span>类型：{{ result.scanTypeLabel }}</span>
              <span>编码：{{ result.normalizedCode }}</span>
              <span>{{ result.matched ? '已找到记录' : '未找到记录' }}</span>
            </div>
            <p class="scan-workbench__suggestion">{{ result.suggestion }}</p>

            <div v-if="result.goods" class="scan-workbench__goods" data-testid="scan-goods-card">
              <div class="section-title">货品</div>
              <BraceletCard
                :code="result.goods.code"
                :status="result.goods.status"
                :inbound-cost="result.goods.costTotal"
                show-cost
              />
              <div v-if="profit?.summary" class="scan-workbench__profit-summary">
                <div>当前成本：¥{{ Number(profit.costs?.costTotal ?? 0).toFixed(2) }}</div>
                <div>支出 {{ profit.summary.expenseCount }} 笔</div>
                <div v-if="profit.summary.isSold">
                  最终利润：¥{{ Number(profit.summary.finalProfit).toFixed(2) }}
                </div>
                <div v-if="profit.summary.isLoss" class="loss-tag" data-testid="scan-loss-hint">
                  这件目前是亏的
                </div>
              </div>
              <div class="scan-workbench__actions">
                <ActionButton block data-testid="scan-expense-btn" @click="goExpense()">记一笔支出</ActionButton>
              </div>
            </div>

            <div v-if="result.order" class="scan-workbench__order" data-testid="scan-order-card">
              <div class="section-title">订单</div>
              <OrderLink :order-no="result.order.orderNo" data-testid="scan-order-link" />
              <div v-if="result.order.logisticsNo">物流：{{ result.order.logisticsNo }}</div>
              <div>状态：{{ result.order.orderStatus }}</div>
              <div v-if="result.order.afterSaleStatus">售后：{{ result.order.afterSaleStatus }}</div>
              <div v-if="result.order.braceletCode">关联货品：{{ result.order.braceletCode }}</div>
              <div v-if="result.order.saleAmount != null">销售金额：¥{{ Number(result.order.saleAmount).toFixed(2) }}</div>
              <div v-if="result.order.finalProfit != null">订单利润：¥{{ Number(result.order.finalProfit).toFixed(2) }}</div>
              <div class="scan-workbench__actions">
                <ActionButton block data-testid="scan-customer-refund-btn" @click="goCustomerExpense('customer_refund')">记客户返款</ActionButton>
                <ActionButton block plain data-testid="scan-customer-comp-btn" @click="goCustomerExpense('customer_compensation')">记客户补偿</ActionButton>
                <ActionButton block plain data-testid="scan-after-sale-btn" @click="goCustomerExpense('after_sale_compensation')">记售后补偿</ActionButton>
                <ActionButton block plain data-testid="scan-order-profit-btn" @click="goOrderProfit">按这个订单记账</ActionButton>
              </div>
              <div v-if="result.order.needsGoodsBinding" class="scan-workbench__bind-row">
                <input v-model="bindGoodsCode" class="scan-workbench__bind-input" placeholder="输入货品码关联" />
                <ActionButton data-testid="scan-bind-goods-btn" @click="bindOrderGoods">关联这个货品</ActionButton>
              </div>
            </div>

            <div v-if="!result.matched && result.scanType === 'unknown'" class="scan-workbench__unknown">
              <p>暂时没识别出来，可以手动记账或按订单号查找</p>
              <ActionButton block plain @click="router.push('/expense/create')">手动记账</ActionButton>
              <ActionButton block plain data-testid="scan-manual-order-btn" @click="goManualOrderExpense">按订单号查找并记账</ActionButton>
              <ActionButton block plain @click="createGoods">用这个编码新建货品</ActionButton>
            </div>
          </LuxuryCard>
        </template>
      </div>

      <div v-if="enabled" class="scan-workbench__aside">
        <LuxuryCard>
          <div class="section-title">最近扫码</div>
          <div v-if="!recent.length" class="muted">暂无</div>
          <div
            v-for="item in recent"
            :key="item.id"
            class="scan-workbench__recent-item"
            data-testid="scan-recent-item"
            @click="scanInput = item.scanCode; recognize(item.scanCode)"
          >
            <div>{{ item.scanCode }}</div>
            <div class="muted">{{ item.scanTypeLabel }} · {{ item.statusLabel }}</div>
          </div>
        </LuxuryCard>
      </div>
    </div>
    <XhsOrderPicker v-model="showXhsPicker" @select="onXhsOrderPicked" />
  </AppShell>
</template>

<style scoped>
.scan-workbench {
  overflow-x: hidden;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.scan-workbench--desktop {
  flex-direction: row;
  align-items: flex-start;
}
.scan-workbench__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.scan-workbench__aside { width: 100%; }
@media (min-width: 1200px) {
  .scan-workbench__aside { width: 320px; flex-shrink: 0; }
}
.scan-workbench__hint { margin: 0 0 12px; line-height: 1.5; font-size: 14px; }
.scan-workbench__scanner-status { margin-bottom: 12px; font-size: 13px; }
.scan-workbench__scanner-status .ok { color: var(--color-success); }
.scan-workbench__scanner-status .warn { color: var(--color-warning); }
.scan-workbench__input-row { display: flex; flex-direction: column; gap: 10px; position: relative; }
.scan-workbench__xhs-btn { margin-top: 10px; }
.scan-workbench__input {
  width: 100%;
  font-size: 18px;
  padding: 16px 14px;
  min-height: 52px;
  border: var(--border-glass);
  border-radius: 12px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.35);
  color: var(--color-text-light);
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.scan-workbench__input::placeholder {
  color: rgba(245, 230, 200, 0.55);
}
.scan-workbench__input:focus {
  outline: none;
  border-color: var(--color-gold);
}
.scan-workbench__meta { display: flex; flex-direction: column; gap: 4px; font-size: 14px; margin-bottom: 8px; }
.scan-workbench__suggestion { font-size: 15px; margin: 0 0 16px; line-height: 1.5; }
.scan-workbench__actions { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.scan-workbench__profit-summary { margin: 12px 0; font-size: 14px; line-height: 1.6; }
.loss-tag { color: #ee0a24; font-weight: 600; margin-top: 6px; }
.scan-workbench__bind-row { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.scan-workbench__bind-input {
  padding: 14px 12px;
  min-height: 48px;
  border-radius: 10px;
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  font-size: 16px;
}
.scan-workbench__recent-item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: transform var(--duration-fast);
}
@media (hover: hover) {
  .scan-workbench__recent-item:hover { transform: translateX(3px); }
}
.scan-workbench__recent-item:last-child { border-bottom: none; }
</style>
