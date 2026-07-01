<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { showToast } from 'vant'
import api from '../api'
import type { XhsOrderItem, XhsShopStatus } from '../types/xhs-order'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  select: [XhsOrderItem]
}>()

const shops = ref<XhsShopStatus[]>([])
const shopKey = ref('all')
const keyword = ref('')
const items = ref<XhsOrderItem[]>([])
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const warnings = ref<string[]>([])
const listRef = ref<HTMLElement | null>(null)
const isDesktop = ref(typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function formatMoney(n: number) {
  return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadShops() {
  try {
    const res = await api.get('/xhs/orders/shops')
    shops.value = res.data.data || []
  } catch {
    shops.value = [
      { key: 'all', name: '全部', canSyncOrders: false, statusLabel: '暂不可用', reason: '店铺状态没查出来' },
    ]
  }
}

async function fetchOrders(append = false) {
  if (append) {
    if (loadingMore.value || !hasMore.value || !nextCursor.value) return
    loadingMore.value = true
  } else {
    loading.value = true
    loadError.value = ''
    warnings.value = []
  }

  try {
    const res = await api.get('/xhs/orders/search', {
      params: {
        shopKey: shopKey.value,
        keyword: keyword.value.trim() || undefined,
        cursor: append ? nextCursor.value : undefined,
        pageSize: 10,
      },
    })
    const data = res.data.data
    const batch: XhsOrderItem[] = data?.items || []
    if (append) {
      const seen = new Set(items.value.map((i) => `${i.shopKey}::${i.externalOrderNo}`))
      for (const row of batch) {
        const k = `${row.shopKey}::${row.externalOrderNo}`
        if (!seen.has(k)) {
          seen.add(k)
          items.value.push(row)
        }
      }
    } else {
      items.value = batch
    }
    nextCursor.value = data?.nextCursor || null
    hasMore.value = !!data?.hasMore
    warnings.value = data?.warnings || []
    if (!append && !batch.length && !warnings.value.length) {
      loadError.value = '这段时间没查到订单，可以换个店铺试试，或者手动输入订单号。'
    }
  } catch {
    if (!append) {
      loadError.value = '订单没拉出来，可以换个店铺试试，或者手动输入订单号。'
      items.value = []
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function selectShop(key: string) {
  if (shopKey.value === key) return
  shopKey.value = key
  nextCursor.value = null
  items.value = []
  fetchOrders(false)
}

function onSearch() {
  nextCursor.value = null
  items.value = []
  fetchOrders(false)
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (loading.value || loadingMore.value || !hasMore.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
    fetchOrders(true)
  }
}

function pickOrder(order: XhsOrderItem) {
  emit('select', order)
  visible.value = false
  showToast(`已带入 ${order.shopName} 的订单 ${order.externalOrderNo}`)
}

function close() {
  visible.value = false
}

function onMedia(e: MediaQueryListEvent | MediaQueryList) {
  isDesktop.value = e.matches
}

let mq: MediaQueryList | null = null
watch(visible, async (open) => {
  if (open) {
    keyword.value = ''
    shopKey.value = 'all'
    nextCursor.value = null
    items.value = []
    loadError.value = ''
    await loadShops()
    await fetchOrders(false)
    await nextTick()
    listRef.value?.scrollTo({ top: 0 })
  }
})

onMounted(() => {
  mq = window.matchMedia('(min-width: 768px)')
  isDesktop.value = mq.matches
  mq.addEventListener('change', onMedia)
})
onUnmounted(() => {
  mq?.removeEventListener('change', onMedia)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="xhs-picker__overlay" data-testid="xhs-order-picker" @click.self="close">
      <div
        class="xhs-picker__modal glass-surface"
        :class="{ 'xhs-picker__modal--drawer': !isDesktop }"
      >
        <header class="xhs-picker__head">
          <h3>选择小红书订单</h3>
          <button type="button" class="xhs-picker__close" aria-label="关闭" @click="close">×</button>
        </header>

        <div class="xhs-picker__search">
          <input
            v-model="keyword"
            type="search"
            placeholder="搜订单号、手机号、收件人、物流单号"
            data-testid="xhs-order-search"
            @keyup.enter="onSearch"
          />
          <button type="button" data-testid="xhs-order-search-btn" @click="onSearch">搜索</button>
        </div>

        <div class="xhs-picker__shops" data-testid="xhs-order-shops">
          <button
            v-for="s in shops"
            :key="s.key"
            type="button"
            class="xhs-picker__shop"
            :class="{ 'xhs-picker__shop--active': shopKey === s.key }"
            :data-testid="`xhs-shop-${s.key}`"
            @click="selectShop(s.key)"
          >
            <span class="xhs-picker__shop-name">{{ s.name }}</span>
            <span
              class="xhs-picker__shop-status"
              :class="{
                'xhs-picker__shop-status--ok': s.canSyncOrders,
                'xhs-picker__shop-status--bad': !s.canSyncOrders,
              }"
            >
              {{ s.statusLabel }}
            </span>
          </button>
        </div>

        <div v-if="warnings.length" class="xhs-picker__warn">
          <p v-for="(w, idx) in warnings" :key="idx">{{ w }}</p>
        </div>

        <div ref="listRef" class="xhs-picker__list" data-testid="xhs-order-list" @scroll="onScroll">
          <p v-if="loading" class="xhs-picker__hint">正在加载订单…</p>
          <p v-else-if="loadError" class="xhs-picker__hint xhs-picker__hint--error">{{ loadError }}</p>

          <button
            v-for="order in items"
            :key="`${order.shopKey}-${order.externalOrderNo}`"
            type="button"
            class="xhs-picker__card"
            data-testid="xhs-order-card"
            @click="pickOrder(order)"
          >
            <div class="xhs-picker__card-head">
              <span class="xhs-picker__shop-tag">{{ order.shopName }}</span>
              <strong>¥{{ formatMoney(order.amount) }}</strong>
            </div>
            <div class="xhs-picker__order-no">{{ order.externalOrderNo }}</div>
            <div class="xhs-picker__meta">
              <span>{{ order.buyerName }}</span>
              <span v-if="order.phoneMasked">{{ order.phoneMasked }}</span>
            </div>
            <div class="xhs-picker__meta muted">
              <span>{{ order.orderStatus }}</span>
              <span v-if="order.afterSaleStatus">{{ order.afterSaleStatus }}</span>
            </div>
            <div v-if="order.logisticsNo" class="xhs-picker__meta muted">物流 {{ order.logisticsNo }}</div>
            <div class="xhs-picker__meta muted">{{ order.payTime }} · {{ order.goodsTitle }}</div>
          </button>

          <p v-if="loadingMore" class="xhs-picker__foot" data-testid="xhs-order-loading-more">正在加载下一批订单…</p>
          <p v-else-if="items.length && !hasMore" class="xhs-picker__foot">已经到底了，没有更多订单。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.xhs-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(6, 9, 8, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.xhs-picker__modal {
  width: min(560px, 100%);
  max-height: min(88vh, 720px);
  border-radius: 18px;
  border: 1px solid rgba(198, 161, 91, 0.35);
  box-shadow: var(--shadow-glow), var(--shadow-card);
  padding: 16px 14px 12px;
  background: linear-gradient(145deg, rgba(22, 30, 27, 0.96), rgba(12, 16, 14, 0.98));
  display: flex;
  flex-direction: column;
}
.xhs-picker__modal--drawer {
  align-self: flex-end;
  width: 100%;
  max-width: 100%;
  max-height: 92vh;
  border-radius: 18px 18px 0 0;
  margin-top: auto;
}
.xhs-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.xhs-picker__head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-light);
}
.xhs-picker__close {
  border: none;
  background: transparent;
  color: var(--color-text-sub);
  font-size: 22px;
  cursor: pointer;
}
.xhs-picker__search {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.xhs-picker__search input {
  flex: 1;
  border: 1px solid rgba(198, 161, 91, 0.28);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-main);
  padding: 10px 12px;
  font-size: 14px;
}
.xhs-picker__search button {
  border: none;
  border-radius: 12px;
  padding: 0 14px;
  background: rgba(198, 161, 91, 0.2);
  color: var(--color-text-light);
  cursor: pointer;
}
.xhs-picker__shops {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.xhs-picker__shop {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid rgba(198, 161, 91, 0.28);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  min-width: 72px;
}
.xhs-picker__shop--active {
  border-color: var(--color-gold);
  background: rgba(198, 161, 91, 0.14);
  box-shadow: var(--shadow-glow);
}
.xhs-picker__shop-name { font-weight: 600; }
.xhs-picker__shop-status { font-size: 10px; opacity: 0.85; }
.xhs-picker__shop-status--ok { color: var(--color-success); }
.xhs-picker__shop-status--bad { color: var(--color-warning); }
.xhs-picker__warn {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.08);
  font-size: 12px;
  color: var(--color-gold-light);
}
.xhs-picker__warn p { margin: 0 0 4px; }
.xhs-picker__list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 120px;
  padding-right: 2px;
}
.xhs-picker__hint {
  text-align: center;
  padding: 24px 12px;
  color: var(--color-text-sub);
  font-size: 13px;
}
.xhs-picker__hint--error { color: var(--color-warning); }
.xhs-picker__card {
  width: 100%;
  text-align: left;
  border: var(--border-glass);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  color: var(--color-text-main);
  transition: transform var(--duration-fast), border-color var(--duration-fast);
}
@media (hover: hover) {
  .xhs-picker__card:hover {
    transform: translateY(-1px);
    border-color: rgba(198, 161, 91, 0.3);
  }
}
.xhs-picker__card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.xhs-picker__shop-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(198, 161, 91, 0.15);
  color: var(--color-gold-light);
}
.xhs-picker__order-no {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-light);
  margin-bottom: 6px;
}
.xhs-picker__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 12px;
  margin-bottom: 2px;
}
.xhs-picker__foot {
  text-align: center;
  padding: 12px;
  font-size: 12px;
  color: var(--color-text-sub);
}
</style>
