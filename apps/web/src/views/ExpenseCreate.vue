<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useQianfan } from '../composables/useQianfan'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ActionButton from '../components/ActionButton.vue'
import XhsOrderPicker from '../components/XhsOrderPicker.vue'
import type { XhsOrderItem } from '../types/xhs-order'
import { resolveApiErrorMessage } from '../utils/api-errors'
import { DEFAULT_PAY_SOURCE, PROJECT_EXPENSE_CATEGORIES, EXPENSE_OPERATORS } from '@jade-account/shared'

const STORAGE_KEY = 'jade-expense-prefs'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { isDesktop } = useBreakpoint()
const { qianfanEnabled, loadQianfanConfig, copyOrderNo, openQianfan } = useQianfan()

const settings = ref<any>({})
const matchedOrder = ref<{ externalOrderNo: string; logisticsNo?: string; orderAmount?: number } | null>(null)
const lookupLoading = ref(false)
const form = ref({
  amount: '',
  expenseType: '',
  paySource: '',
  operatorName: EXPENSE_OPERATORS[0] as string,
  externalOrderNo: '',
  logisticsNo: '',
  occurredAt: new Date().toISOString().slice(0, 10),
  remark: '',
})
const uploadedFiles = ref<Array<{ fileId: number; fileType: string; name: string; preview?: string }>>([])
const uploadFailCount = ref(0)
const loading = ref(false)
const pageRef = ref<HTMLElement | null>(null)
const uploaderRef = ref<{ bindPageRoot: (el: HTMLElement | null) => void; unbindPageRoot: () => void } | null>(null)
const amountFocused = ref(false)
const showXhsPicker = ref(false)

const categoryOptions = computed(() => {
  const fromSettings = (settings.value.expenseTypes || []).map((t: { value: string; label: string }) => t.value)
  const merged = [...new Set([...PROJECT_EXPENSE_CATEGORIES, ...fromSettings])]
  return merged
})

const paySourceOptions = computed(() => {
  const list = settings.value.paySources || []
  return list.filter((s: { value: string }) => !['员工垫付', '专属经费'].includes(s.value))
})

function resolveDefaultPaySource() {
  const opts = paySourceOptions.value
  const preferred = opts.find((s: { value: string }) => s.value === DEFAULT_PAY_SOURCE)
  if (preferred) return preferred.value
  if (opts[0]?.value) return opts[0].value
  return DEFAULT_PAY_SOURCE
}

const displayAmount = computed(() => {
  const v = form.value.amount
  if (!v) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
})

onMounted(async () => {
  await loadQianfanConfig(api)
  const res = await api.get('/settings')
  settings.value = res.data.data

  const orderNo = route.query.externalOrderNo as string
  if (orderNo) form.value.externalOrderNo = orderNo

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (saved.expenseType) form.value.expenseType = saved.expenseType
    else if (categoryOptions.value.length) form.value.expenseType = categoryOptions.value[0]
    if (saved.paySource && !['员工垫付', '专属经费'].includes(saved.paySource)) {
      form.value.paySource = saved.paySource
    } else {
      form.value.paySource = resolveDefaultPaySource()
    }
    if (saved.operatorName && (EXPENSE_OPERATORS as readonly string[]).includes(saved.operatorName)) {
      form.value.operatorName = saved.operatorName
    }
  } catch {
    form.value.expenseType = categoryOptions.value[0] || '其他支出'
    form.value.paySource = resolveDefaultPaySource()
  }

  if (route.query.focus === 'order' || orderNo) {
    showXhsPicker.value = route.query.focus === 'order'
    if (orderNo) await lookupOrder()
  }

  await bindUploaderPageScope()
})

async function bindUploaderPageScope() {
  await nextTick()
  if (isDesktop.value && pageRef.value && uploaderRef.value) {
    uploaderRef.value.bindPageRoot(pageRef.value)
  }
}

watch(isDesktop, () => {
  void bindUploaderPageScope()
})

onUnmounted(() => {
  uploaderRef.value?.unbindPageRoot()
})

function savePrefs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    expenseType: form.value.expenseType,
    paySource: form.value.paySource,
    operatorName: form.value.operatorName,
  }))
}

async function lookupOrder() {
  const orderNo = form.value.externalOrderNo?.trim()
  const logisticsNo = form.value.logisticsNo?.trim()
  if (!orderNo && !logisticsNo) {
    showToast('请输入小红书订单号或物流单号')
    return
  }
  lookupLoading.value = true
  matchedOrder.value = null
  try {
    const params: Record<string, string> = { pageSize: '10' }
    if (orderNo) params.keyword = orderNo
    else params.keyword = logisticsNo
    const res = await api.get('/xhs/orders/search', { params })
    const rows = res.data.data?.items || []
    const hit = rows.find((r: XhsOrderItem) => r.externalOrderNo === orderNo) || rows[0]
    if (hit) {
      matchedOrder.value = {
        externalOrderNo: hit.externalOrderNo,
        logisticsNo: hit.logisticsNo,
        orderAmount: hit.amount,
      }
      form.value.externalOrderNo = hit.externalOrderNo
      if (hit.logisticsNo) form.value.logisticsNo = hit.logisticsNo
    } else {
      showToast('暂未查到该订单，可先保存订单号')
    }
  } catch {
    showToast('查订单失败，稍后再试')
  } finally {
    lookupLoading.value = false
  }
}

function onXhsOrderPicked(order: XhsOrderItem) {
  form.value.externalOrderNo = order.externalOrderNo
  if (order.logisticsNo) form.value.logisticsNo = order.logisticsNo
  matchedOrder.value = {
    externalOrderNo: order.externalOrderNo,
    logisticsNo: order.logisticsNo,
    orderAmount: order.amount,
  }
  if (order.amount && !form.value.amount) {
    form.value.amount = String(order.amount)
  }
}

async function onSubmit() {
  if (!form.value.amount) {
    showToast('金额得填一下')
    return
  }
  if (!form.value.expenseType) {
    showToast('选一下支出分类')
    return
  }
  if (!form.value.paySource) {
    showToast('选一下付款来源')
    return
  }
  if (!form.value.operatorName) {
    showToast('请选择经手人')
    return
  }
  const amount = Number(form.value.amount)
  if (Number.isNaN(amount) || amount <= 0) {
    showToast('支出金额必须大于 0')
    return
  }

  let needsAttachment = false
  if (!uploadedFiles.value.length) {
    try {
      await showConfirmDialog({
        title: '无图保存',
        message: '未上传凭证，将标记为待补充凭证，是否继续？',
        confirmButtonColor: '#1F4D3A',
      })
      needsAttachment = true
    } catch {
      return
    }
  }

  loading.value = true
  try {
    const res = await api.post('/expenses', {
      businessType: 'normal',
      amount,
      expenseType: form.value.expenseType,
      paySource: form.value.paySource,
      operatorName: form.value.operatorName,
      occurredAt: form.value.occurredAt,
      remark: form.value.remark,
      externalOrderNo: form.value.externalOrderNo || undefined,
      logisticsNo: form.value.logisticsNo || undefined,
      attachments: uploadedFiles.value.map((f) => ({ fileId: f.fileId, fileType: f.fileType })),
      needsAttachment,
    })
    savePrefs()
    showToast('已保存')
    router.push(`/expense/${res.data.data.id}`)
  } catch (err: unknown) {
    showToast(resolveApiErrorMessage(err))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppShell title="记支出" no-tab-pad :fixed-bottom="!isDesktop">
    <div ref="pageRef" class="desktop-two-column expense-create" data-testid="expense-create-page">
      <div class="desktop-two-column__main">
        <LuxuryCard gold padding="20px 16px">
          <div class="amount-zone" :class="{ 'amount-zone--focus': amountFocused }">
            <div class="amount-zone__label">支出金额</div>
            <div class="amount-zone__input-row">
              <span class="amount-zone__prefix">¥</span>
              <input
                v-model="form.amount"
                type="number"
                inputmode="decimal"
                class="amount-zone__input money"
                data-testid="expense-amount-input"
                placeholder="0.00"
                @focus="amountFocused = true"
                @blur="amountFocused = false"
              />
            </div>
            <div v-if="displayAmount && form.amount" class="amount-zone__hint muted">{{ displayAmount }}</div>
          </div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">支出分类</div>
          <div class="pill-row">
            <button
              v-for="t in categoryOptions"
              :key="t"
              class="pill"
              :class="{ 'pill--active': form.expenseType === t }"
              :data-testid="`expense-category-${t}`"
              @click="form.expenseType = t"
            >{{ t }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard data-testid="expense-order-section">
          <div class="section-title">千帆/小红书订单</div>
          <van-field v-model="form.externalOrderNo" label="订单号" placeholder="可手动输入或查询选择" class="field-custom" data-testid="expense-order-no" />
          <van-field v-model="form.logisticsNo" label="物流单号" placeholder="可选" class="field-custom" />
          <div class="expense-order-actions">
            <ActionButton block plain data-testid="expense-xhs-order-btn" @click="showXhsPicker = true">查询订单</ActionButton>
            <ActionButton block plain :loading="lookupLoading" data-testid="expense-lookup-order" @click="lookupOrder">按订单号查询</ActionButton>
          </div>
          <div v-if="matchedOrder" class="order-card" data-testid="expense-matched-order">
            <div>已关联订单：{{ matchedOrder.externalOrderNo }}</div>
            <div v-if="matchedOrder.orderAmount" class="muted">订单金额：¥{{ Number(matchedOrder.orderAmount).toFixed(2) }}</div>
            <div class="muted">可打开千帆查看订单详情</div>
            <div class="order-card__actions">
              <ActionButton size="md" plain @click="copyOrderNo(matchedOrder.externalOrderNo)">复制订单号</ActionButton>
              <ActionButton v-if="qianfanEnabled" size="md" plain @click="openQianfan(matchedOrder.externalOrderNo)">打开千帆</ActionButton>
            </div>
          </div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">付款来源</div>
          <div class="pay-grid">
            <button
              v-for="s in paySourceOptions"
              :key="s.value"
              class="pay-card"
              :class="{ 'pay-card--active': form.paySource === s.value }"
              @click="form.paySource = s.value"
            >{{ s.label }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">经手人</div>
          <div class="pay-grid">
            <button
              v-for="name in EXPENSE_OPERATORS"
              :key="name"
              type="button"
              class="pay-card"
              :class="{ 'pay-card--active': form.operatorName === name }"
              :data-testid="`expense-operator-${name}`"
              @click="form.operatorName = name"
            >{{ name }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard>
          <van-field v-model="form.occurredAt" label="支出时间" type="date" class="field-custom" />
          <van-field v-model="form.remark" label="备注" type="textarea" rows="2" class="field-custom" />
        </LuxuryCard>
      </div>

      <div class="desktop-two-column__aside">
        <LuxuryCard>
          <div class="section-title">凭证图片</div>
          <ImageUploader
            ref="uploaderRef"
            v-model="uploadedFiles"
            desktop-page-shortcuts
            @upload-failures="uploadFailCount = $event"
          />
        </LuxuryCard>

        <div v-if="isDesktop" class="expense-create__save-desktop">
          <ActionButton block size="lg" :loading="loading" data-testid="expense-save-btn" @click="onSubmit">保存支出</ActionButton>
        </div>
      </div>
    </div>

    <template v-if="!isDesktop" #footer>
      <ActionButton block size="lg" :loading="loading" data-testid="expense-save-btn" @click="onSubmit">保存支出</ActionButton>
    </template>

    <XhsOrderPicker v-model="showXhsPicker" @select="onXhsOrderPicked" />
  </AppShell>
</template>

<style scoped>
.expense-create { overflow-x: hidden; max-width: 100%; }
.expense-create.external-image-drop-target--active {
  outline: 2px dashed rgba(198, 161, 91, 0.55);
  outline-offset: 4px;
  border-radius: var(--radius-card);
}
.expense-create__save-desktop { padding-top: 4px; }
.expense-order-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.order-card {
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(78, 125, 105, 0.1);
  border: var(--border-glass);
  font-size: 14px;
  line-height: 1.6;
}
.order-card__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.amount-zone__label { font-size: 13px; color: var(--color-text-sub); margin-bottom: 8px; }
.amount-zone__input-row { display: flex; align-items: baseline; gap: 4px; }
.amount-zone__prefix { font-size: 28px; font-weight: 600; color: var(--color-gold); }
.amount-zone__input {
  flex: 1; border: none; background: transparent;
  font-size: 36px; font-weight: 600; color: var(--color-text-light);
  outline: none; min-width: 0;
}
.pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
.pill {
  padding: 10px 14px;
  min-height: 44px;
  border-radius: var(--radius-pill);
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  color: var(--color-text-sub);
}
.pill--active {
  background: rgba(78, 125, 105, 0.18);
  border-color: rgba(198, 161, 91, 0.3);
  color: var(--color-gold-light);
}
.pay-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.pay-card {
  padding: 16px 14px;
  min-height: 52px;
  border-radius: 14px;
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.03);
  font-size: 14px;
  color: var(--color-text-main);
}
.pay-card--active {
  border-color: rgba(198, 161, 91, 0.35);
  background: rgba(198, 161, 91, 0.1);
  color: var(--color-gold-light);
}
:deep(.field-custom) { background: transparent; }
</style>
