<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()

const inputCode = ref('')
const loading = ref(false)
const result = ref<any>(null)
const recent = ref<any[]>([])
const bindOrderNo = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

async function loadRecent() {
  try {
    const res = await api.get('/scan/recent?limit=20')
    recent.value = res.data.data || []
  } catch {
    recent.value = []
  }
}

async function recognize(source: 'scanner' | 'manual' | 'paste' = 'manual') {
  const code = inputCode.value.trim()
  if (!code) {
    showToast('请先扫码或输入编码')
    return
  }
  loading.value = true
  try {
    const res = await api.post('/scan/recognize', { code, source })
    result.value = res.data.data
    await loadRecent()
  } catch (err: any) {
    showToast(err.userMessage || err.response?.data?.message || '识别失败')
  } finally {
    loading.value = false
  }
}

function onPaste() {
  recognize('paste')
}

function onEnter() {
  recognize('manual')
}

async function createGoods() {
  if (!result.value?.normalizedCode) return
  loading.value = true
  try {
    await api.post('/goods', { code: result.value.normalizedCode })
    showToast('货品已创建')
    await recognize('manual')
  } catch (err: any) {
    showToast(err.userMessage || err.response?.data?.message || '创建失败')
  } finally {
    loading.value = false
  }
}

async function createSimpleOrder() {
  const orderNo = result.value?.normalizedCode
  if (!orderNo) return
  loading.value = true
  try {
    const body: Record<string, unknown> = { orderNo }
    if (result.value?.goods?.id) body.goodsId = result.value.goods.id
    await api.post('/scan/orders/simple', body)
    showToast('订单已创建')
    await recognize('manual')
  } catch (err: any) {
    showToast(err.userMessage || err.response?.data?.message || '创建订单失败')
  } finally {
    loading.value = false
  }
}

async function bindOrderToGoods() {
  const orderNo = bindOrderNo.value.trim() || result.value?.normalizedCode
  const goodsId = result.value?.goods?.id
  if (!orderNo || !goodsId) {
    showToast('请先识别货品，并填写订单号')
    return
  }
  loading.value = true
  try {
    await api.post('/scan/orders/simple', { orderNo, goodsId })
    showToast('已绑定订单')
    bindOrderNo.value = ''
    await recognize('manual')
  } catch (err: any) {
    showToast(err.userMessage || err.response?.data?.message || '绑定失败')
  } finally {
    loading.value = false
  }
}

function goExpense() {
  const q: Record<string, string> = {}
  if (result.value?.goods?.code) q.braceletCode = result.value.goods.code
  router.push({ path: '/expense/create', query: q })
}

function viewCost() {
  if (result.value?.goods?.id) {
    router.push(`/bracelets/${encodeURIComponent(result.value.goods.code)}`)
  }
}

function viewGoods() {
  if (result.value?.goods?.code) {
    router.push(`/bracelets/${encodeURIComponent(result.value.goods.code)}`)
  } else if (result.value?.order?.braceletCode) {
    router.push(`/bracelets/${encodeURIComponent(result.value.order.braceletCode)}`)
  }
}

function viewOrder() {
  if (result.value?.order?.id) {
    router.push(`/sales/${result.value.order.id}`)
  }
}

async function saveUnknownBinding() {
  if (!result.value?.normalizedCode) return
  loading.value = true
  try {
    await api.post('/scan/bind', {
      scanCode: result.value.normalizedCode,
      scanType: result.value.scanType,
      note: '未知编码手动保存',
      source: 'manual',
    })
    showToast('扫码记录已保存')
    await loadRecent()
  } catch (err: any) {
    showToast(err.userMessage || '保存失败')
  } finally {
    loading.value = false
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

onMounted(async () => {
  await loadRecent()
  await nextTick()
  inputRef.value?.focus()
})
</script>

<template>
  <div class="scan-page page-enter" data-testid="scan-binding-page">
    <header class="scan-page__header">
      <h1 class="scan-page__title">扫码绑定中心</h1>
      <p class="scan-page__subtitle muted">扫货品码、订单号或物流单号，先识别再操作，不会乱跳页</p>
    </header>

    <div class="scan-page__layout desktop-two-column">
      <div class="scan-page__main desktop-two-column__main">
        <LuxuryCard padding="16px">
          <label class="scan-page__label" for="scan-input">扫码 / 输入</label>
          <input
            id="scan-input"
            ref="inputRef"
            v-model="inputCode"
            class="scan-page__input"
            data-testid="scan-input"
            placeholder="扫码或输入货品码/订单号/物流单号"
            autocomplete="off"
            @keyup.enter="onEnter"
            @paste="onPaste"
          />
          <div class="scan-page__actions-row">
            <ActionButton
              data-testid="scan-recognize-btn"
              block
              :loading="loading"
              @click="recognize('manual')"
            >
              识别
            </ActionButton>
          </div>
          <p class="scan-page__hint muted">扫码枪对准焦点输入框即可；支持手动输入和粘贴后点识别</p>
        </LuxuryCard>

        <LuxuryCard v-if="result" padding="16px" data-testid="scan-result-card">
          <div class="scan-page__result-title">识别结果</div>
          <div class="scan-page__result-line">
            <span class="muted">类型</span>
            <strong>{{ result.scanTypeLabel }}</strong>
          </div>
          <div class="scan-page__result-line">
            <span class="muted">编码</span>
            <strong>{{ result.normalizedCode }}</strong>
          </div>
          <div class="scan-page__result-message">{{ result.message }}</div>
          <div class="scan-page__result-status" :class="{ ok: result.matched }">
            {{ result.matched ? '已找到记录' : '暂未找到记录' }}
          </div>
          <p class="scan-page__suggestion">{{ result.suggestion }}</p>

          <div v-if="result.goods" class="scan-page__info-block">
            <div class="section-title">货品信息</div>
            <div>{{ result.goods.name }}（{{ result.goods.code }}）</div>
            <div class="muted">状态：{{ result.goods.statusLabel }} · 累计成本 ¥{{ result.goods.costTotal }}</div>
          </div>
          <div v-if="result.order" class="scan-page__info-block">
            <div class="section-title">订单信息</div>
            <div>订单号：{{ result.order.orderNo }}</div>
            <div v-if="result.order.logisticsNo" class="muted">物流：{{ result.order.logisticsNo }}</div>
          </div>

          <div class="scan-page__ops">
            <ActionButton v-if="result.nextActions?.includes('create_goods')" block plain @click="createGoods">
              新建货品
            </ActionButton>
            <ActionButton v-if="result.nextActions?.includes('create_order')" block plain @click="createSimpleOrder">
              新建订单
            </ActionButton>
            <template v-if="result.nextActions?.includes('bind_order') && result.goods">
              <input
                v-model="bindOrderNo"
                class="scan-page__input scan-page__input--sm"
                placeholder="输入要绑定的订单号"
              />
              <ActionButton block plain @click="bindOrderToGoods">绑定订单</ActionButton>
            </template>
            <ActionButton v-if="result.nextActions?.includes('create_expense')" block @click="goExpense">
              记一笔支出
            </ActionButton>
            <ActionButton v-if="result.nextActions?.includes('view_cost')" block plain @click="viewCost">
              查看货品成本
            </ActionButton>
            <ActionButton v-if="result.nextActions?.includes('view_goods')" block plain @click="viewGoods">
              查看货品
            </ActionButton>
            <ActionButton v-if="result.nextActions?.includes('view_order')" block plain @click="viewOrder">
              查看订单
            </ActionButton>
            <ActionButton v-if="result.scanType === 'unknown'" block plain @click="saveUnknownBinding">
              保存扫码记录
            </ActionButton>
          </div>
        </LuxuryCard>
      </div>

      <aside class="scan-page__aside desktop-two-column__aside">
        <LuxuryCard padding="16px">
          <div class="section-title">最近扫码</div>
          <div v-if="!recent.length" class="muted">暂无记录</div>
          <div
            v-for="item in recent"
            :key="item.id"
            class="scan-page__recent-item"
            :class="{ 'scan-page__recent-item--desktop': isDesktop }"
          >
            <div class="scan-page__recent-code">{{ item.scanCode }}</div>
            <div class="muted">{{ item.scanTypeLabel }} · {{ item.bound ? '已绑定' : '未绑定' }}</div>
            <div class="scan-page__recent-time">{{ formatTime(item.createdAt) }}</div>
          </div>
        </LuxuryCard>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.scan-page__header {
  margin-bottom: 16px;
}

.scan-page__title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
}

.scan-page__subtitle {
  margin: 0;
  font-size: 13px;
}

.scan-page__label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.scan-page__input {
  width: 100%;
  box-sizing: border-box;
  min-height: 52px;
  padding: 14px 16px;
  font-size: 18px;
  border: 1px solid var(--color-border, #e8e0d4);
  border-radius: 12px;
  background: #fff;
}

.scan-page__input--sm {
  min-height: 44px;
  font-size: 16px;
  margin-bottom: 8px;
}

.scan-page__actions-row {
  margin-top: 12px;
}

.scan-page__hint {
  margin: 10px 0 0;
  font-size: 12px;
}

.scan-page__result-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}

.scan-page__result-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 15px;
}

.scan-page__result-message {
  margin: 12px 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary, #8b6914);
}

.scan-page__result-status {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #f5f0e8;
  color: #8a7a62;
}

.scan-page__result-status.ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.scan-page__suggestion {
  margin: 12px 0;
  font-size: 14px;
  line-height: 1.5;
}

.scan-page__info-block {
  margin: 12px 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--color-bg-soft, #faf7f2);
}

.scan-page__ops {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.scan-page__recent-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border, #eee);
}

.scan-page__recent-item:last-child {
  border-bottom: none;
}

.scan-page__recent-code {
  font-weight: 600;
  word-break: break-all;
}

.scan-page__recent-time {
  font-size: 12px;
  color: var(--color-muted, #999);
  margin-top: 4px;
}

@media (min-width: 1200px) {
  .scan-page__recent-item--desktop {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 16px;
    align-items: center;
  }

  .scan-page__recent-time {
    grid-column: 2;
    text-align: right;
    margin: 0;
  }
}
</style>
