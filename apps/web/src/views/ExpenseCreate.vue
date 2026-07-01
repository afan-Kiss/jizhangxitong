<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useQianfan } from '../composables/useQianfan'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ActionButton from '../components/ActionButton.vue'
import XhsOrderPicker from '../components/XhsOrderPicker.vue'
import type { XhsOrderItem } from '../types/xhs-order'
import { resolveApiErrorMessage } from '../utils/api-errors'

const STORAGE_KEY = 'jade-expense-prefs'

const BUSINESS_OPTIONS = [
  { v: 'normal', l: '普通支出' },
  { v: 'item_cost', l: '货品成本' },
  { v: 'customer_refund', l: '客户返款/退差价' },
  { v: 'customer_compensation', l: '客户补偿/安抚打款' },
  { v: 'after_sale_compensation', l: '售后补偿' },
  { v: 'platform_fee', l: '平台扣款' },
  { v: 'staff_reimbursement', l: '员工垫付' },
  { v: 'manual_pending', l: '先记账后补关联' },
]

const PAYMENT_STATUS_OPTIONS = [
  { v: 'unpaid', l: '未打款' },
  { v: 'paid', l: '已打款' },
  { v: 'failed', l: '打款失败' },
]

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { isDesktop } = useBreakpoint()
const { qianfanEnabled, loadQianfanConfig, copyOrderNo, openQianfan } = useQianfan()

const settings = ref<any>({})
const linkedGoods = ref<any>(null)
const matchedSale = ref<any>(null)
const lookupLoading = ref(false)
const form = ref({
  businessType: 'normal',
  amount: '',
  expenseType: '',
  paySource: '',
  reimbursementPerson: '',
  reimbursementStatus: 'pending',
  braceletCode: '',
  externalOrderNo: '',
  logisticsNo: '',
  saleId: undefined as number | undefined,
  occurredAt: new Date().toISOString().slice(0, 10),
  expenseSummary: '',
  remark: '',
  customerPaymentStatus: 'unpaid',
  payeeName: '',
  linkNote: '',
  includeFreightRefund: false,
})
const uploadedFiles = ref<Array<{ fileId: number; fileType: string; name: string; preview?: string }>>([])
const uploadFailCount = ref(0)
const loading = ref(false)
const amountFocused = ref(false)
const showXhsPicker = ref(false)

const needsOrder = computed(() => ['customer_refund', 'customer_compensation', 'after_sale_compensation', 'platform_fee'].includes(form.value.businessType))
const needsGoods = computed(() => form.value.businessType === 'item_cost')
const isCustomerPayment = computed(() => ['customer_refund', 'customer_compensation', 'after_sale_compensation'].includes(form.value.businessType))

const displayAmount = computed(() => {
  const v = form.value.amount
  if (!v) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
})

watch(() => form.value.businessType, (bt) => {
  if (bt === 'staff_reimbursement' && !form.value.paySource) form.value.paySource = '员工垫付'
  if (bt === 'customer_refund' && !form.value.expenseType) form.value.expenseType = '客户返款'
  if (bt === 'customer_compensation' && !form.value.expenseType) form.value.expenseType = '客户心理落差补偿'
  if (bt === 'after_sale_compensation' && !form.value.expenseType) form.value.expenseType = '售后补偿'
  if (bt === 'platform_fee' && !form.value.expenseType) form.value.expenseType = '平台扣款'
})

onMounted(async () => {
  await auth.fetchWorkerStatus()
  await loadQianfanConfig(api)
  const res = await api.get('/settings')
  settings.value = res.data.data

  const goodsId = route.query.goodsId as string
  const goodsCode = route.query.goodsCode as string
  if (goodsId || goodsCode) {
    try {
      const gRes = goodsId
        ? await api.get(`/goods/${goodsId}`)
        : await api.get(`/goods/by-code/${encodeURIComponent(goodsCode)}`)
      linkedGoods.value = gRes.data.data
      form.value.braceletCode = linkedGoods.value.code
      form.value.businessType = 'item_cost'
    } catch { /* optional */ }
  }

  const bt = route.query.businessType as string
  if (bt) form.value.businessType = bt
  const orderNo = route.query.externalOrderNo as string
  if (orderNo) {
    form.value.externalOrderNo = orderNo
    await lookupOrder()
  }
  const saleId = route.query.saleId as string
  if (saleId) form.value.saleId = Number(saleId)

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (saved.expenseType) form.value.expenseType = saved.expenseType
    else if (settings.value.expenseTypes?.length) form.value.expenseType = settings.value.expenseTypes[0].value
    if (saved.paySource) form.value.paySource = saved.paySource
    else if (settings.value.paySources?.length) form.value.paySource = settings.value.paySources[0].value
  } catch {
    if (settings.value.expenseTypes?.length) form.value.expenseType = settings.value.expenseTypes[0].value
    if (settings.value.paySources?.length) form.value.paySource = settings.value.paySources[0].value
  }
})

function savePrefs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    expenseType: form.value.expenseType,
    paySource: form.value.paySource,
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
  matchedSale.value = null
  try {
    const params = new URLSearchParams()
    if (orderNo) params.set('externalOrderNo', orderNo)
    if (logisticsNo) params.set('logisticsNo', logisticsNo)
    const res = await api.get(`/sales/lookup?${params}`)
    const rows = res.data.data || []
    if (rows.length) {
      matchedSale.value = rows[0]
      form.value.saleId = rows[0].saleId
      if (rows[0].braceletCode) form.value.braceletCode = rows[0].braceletCode
      if (rows[0].externalOrderNo) form.value.externalOrderNo = rows[0].externalOrderNo
    } else {
      showToast('系统里还没有这个订单，可以先保存为待关联')
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
  if (order.amount) {
    if (!form.value.amount) form.value.amount = String(order.amount)
  } else {
    showToast('这单没读到金额，请手动补一下')
  }
  lookupOrder()
}

async function onSubmit() {
  if (!form.value.amount) {
    showToast('金额得填一下')
    return
  }
  if (!form.value.expenseType && form.value.businessType === 'normal') {
    showToast('选一下花在哪一类')
    return
  }
  if (!form.value.paySource) {
    showToast('选一下用哪个账户付的')
    return
  }
  const amount = Number(form.value.amount)
  if (Number.isNaN(amount) || amount <= 0) {
    showToast('支出金额必须大于 0')
    return
  }

  let needsAttachment = false
  const skipAttachmentPrompt = ['customer_refund', 'customer_compensation', 'after_sale_compensation', 'platform_fee'].includes(form.value.businessType)
  if (!uploadedFiles.value.length && !skipAttachmentPrompt) {
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
    const payload: Record<string, unknown> = {
      businessType: form.value.businessType,
      amount,
      expenseType: form.value.expenseType || undefined,
      paySource: form.value.paySource,
      occurredAt: form.value.occurredAt,
      remark: form.value.remark,
      expenseSummary: form.value.expenseSummary,
      braceletId: linkedGoods.value?.id,
      braceletCode: linkedGoods.value?.code || form.value.braceletCode || undefined,
      saleId: form.value.saleId,
      externalOrderNo: form.value.externalOrderNo || undefined,
      logisticsNo: form.value.logisticsNo || undefined,
      customerPaymentStatus: isCustomerPayment.value ? form.value.customerPaymentStatus : undefined,
      payeeName: form.value.payeeName || undefined,
      linkNote: form.value.linkNote || undefined,
      attachments: uploadedFiles.value.map((f) => ({ fileId: f.fileId, fileType: f.fileType })),
      needsAttachment,
      reimbursementStatus: form.value.paySource === '员工垫付' ? form.value.reimbursementStatus : 'not_required',
      reimbursementPerson: form.value.reimbursementPerson || undefined,
    }
    if (form.value.businessType === 'after_sale_compensation' && form.value.includeFreightRefund) {
      payload.remark = [payload.remark, '含退货运费补偿'].filter(Boolean).join('；')
      if (!payload.expenseType) payload.expenseType = '退货运费补偿'
    }

    const res = await api.post('/expenses', payload)
    savePrefs()
    const expenseId = res.data.data.id
    const pending = res.data.data.pendingLinkStatus
    const recorder = auth.user?.name || auth.user?.username || '当前用户'
    if (uploadFailCount.value > 0) {
      showToast(`已保存，记录人为：${recorder}；有 ${uploadFailCount.value} 张图没传上，可稍后补传。`)
    } else if (pending === 'pending_order') {
      showToast(`已保存，待关联订单；记录人为：${recorder}`)
    } else {
      showToast(`已保存，记录人为：${recorder}`)
    }
    router.push(`/expense/${expenseId}`)
  } catch (err: unknown) {
    showToast(resolveApiErrorMessage(err))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppShell title="记支出" show-back no-tab-pad :fixed-bottom="!isDesktop" @back="router.back()">
    <LuxuryCard v-if="linkedGoods" gold data-testid="expense-linked-goods">
      <div class="section-title">已带入货品</div>
      <div>{{ linkedGoods.name || linkedGoods.code }}（{{ linkedGoods.code }}）</div>
    </LuxuryCard>
    <div class="desktop-two-column expense-create" data-testid="expense-create-page">
      <div class="desktop-two-column__main">
        <LuxuryCard gold padding="16px">
          <div class="section-title">这笔钱属于什么</div>
          <div class="biz-card-grid" data-testid="expense-business-cards">
            <button
              v-for="opt in BUSINESS_OPTIONS"
              :key="opt.v"
              class="biz-card"
              :class="{ 'biz-card--active': form.businessType === opt.v }"
              :data-testid="`expense-biz-${opt.v}`"
              @click="form.businessType = opt.v"
            >
              <span class="biz-card__label">{{ opt.l }}</span>
            </button>
          </div>
        </LuxuryCard>

        <LuxuryCard gold padding="20px 16px">
          <div class="amount-zone" :class="{ 'amount-zone--focus': amountFocused }">
            <div class="amount-zone__label">这笔花了多少钱</div>
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

        <LuxuryCard data-testid="expense-order-section">
          <div class="section-title">小红书订单号</div>
          <van-field v-model="form.externalOrderNo" label="订单号" placeholder="可先填订单号，找不到也能先记账" class="field-custom" data-testid="expense-order-no" />
          <van-field v-model="form.logisticsNo" label="物流单号" placeholder="可选" class="field-custom" />
          <div class="expense-order-actions">
            <ActionButton block plain data-testid="expense-xhs-order-btn" @click="showXhsPicker = true">查询订单</ActionButton>
            <ActionButton block plain :loading="lookupLoading" data-testid="expense-lookup-order" @click="lookupOrder">查本地订单</ActionButton>
          </div>
          <div v-if="matchedSale" class="order-card" data-testid="expense-matched-sale">
            <div>已找到订单：{{ matchedSale.externalOrderNo }}</div>
            <div class="muted">货品 {{ matchedSale.braceletCode || '暂无编号' }} · 销售 ¥{{ Number(matchedSale.saleAmount).toFixed(2) }}</div>
            <div class="muted">当前利润 ¥{{ Number(matchedSale.profit).toFixed(2) }}</div>
            <div class="order-card__actions">
              <ActionButton size="md" plain @click="copyOrderNo(matchedSale.externalOrderNo)">复制订单号</ActionButton>
              <ActionButton v-if="qianfanEnabled && matchedSale.externalOrderNo" size="md" plain @click="openQianfan(matchedSale.externalOrderNo)">打开千帆</ActionButton>
            </div>
          </div>
          <p v-else-if="form.externalOrderNo && !lookupLoading" class="muted lookup-hint">找不到订单也可以先保存，后续再补关联</p>
        </LuxuryCard>

        <LuxuryCard v-if="needsGoods || form.businessType === 'normal' || form.businessType === 'manual_pending'">
          <div class="section-title">货品编号</div>
          <van-field v-model="form.braceletCode" placeholder="可不填；货品成本建议填写" class="field-custom" data-testid="expense-bracelet-code" />
        </LuxuryCard>

        <LuxuryCard v-if="form.businessType === 'normal' || form.businessType === 'item_cost' || form.businessType === 'staff_reimbursement'">
          <div class="section-title">支出分类</div>
          <div class="pill-row">
            <button
              v-for="t in settings.expenseTypes || []"
              :key="t.value"
              class="pill"
              :class="{ 'pill--active': form.expenseType === t.value }"
              @click="form.expenseType = t.value"
            >{{ t.label }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard v-if="isCustomerPayment">
          <van-field v-model="form.expenseSummary" label="原因" placeholder="返款/补偿原因" class="field-custom" />
          <van-field v-model="form.payeeName" label="客户姓名" class="field-custom" />
          <div class="section-title">打款状态</div>
          <div class="segment">
            <button
              v-for="opt in PAYMENT_STATUS_OPTIONS"
              :key="opt.v"
              class="segment__item"
              :class="{ 'segment__item--active': form.customerPaymentStatus === opt.v }"
              @click="form.customerPaymentStatus = opt.v"
            >{{ opt.l }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard v-if="form.businessType === 'after_sale_compensation'">
          <van-field v-model="form.expenseSummary" label="售后说明" class="field-custom" />
          <van-cell title="是否退运费" center>
            <template #right-icon>
              <van-switch v-model="form.includeFreightRefund" size="20px" />
            </template>
          </van-cell>
        </LuxuryCard>

        <LuxuryCard v-if="form.businessType === 'manual_pending'">
          <van-field v-model="form.linkNote" label="大概说明" type="textarea" rows="2" class="field-custom" />
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">付款来源</div>
          <div class="pay-grid">
            <button
              v-for="s in settings.paySources || []"
              :key="s.value"
              class="pay-card"
              :class="{ 'pay-card--active': form.paySource === s.value }"
              @click="form.paySource = s.value"
            >{{ s.label }}</button>
          </div>
        </LuxuryCard>

        <LuxuryCard v-if="form.paySource === '员工垫付'">
          <div class="section-title">报销状态</div>
          <div class="segment">
            <button
              v-for="opt in [{ v: 'pending', l: '未报销' }, { v: 'reimbursed', l: '已报销' }, { v: 'not_required', l: '不需要' }]"
              :key="opt.v"
              class="segment__item"
              :class="{ 'segment__item--active': form.reimbursementStatus === opt.v }"
              @click="form.reimbursementStatus = opt.v"
            >{{ opt.l }}</button>
          </div>
          <van-field v-model="form.reimbursementPerson" label="报销人" placeholder="填谁垫付的" class="field-custom" />
        </LuxuryCard>

        <LuxuryCard>
          <van-field v-model="form.occurredAt" label="支出时间" type="date" class="field-custom" />
          <van-field v-model="form.remark" label="备注" type="textarea" rows="2" class="field-custom" />
        </LuxuryCard>
      </div>

      <div class="desktop-two-column__aside">
        <LuxuryCard>
          <WorkerStatus :status="auth.workerStatus" />
          <p class="aside-tip muted">记客户返款/补偿不必扫码，填订单号即可。</p>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">凭证图片</div>
          <ImageUploader v-model="uploadedFiles" @upload-failures="uploadFailCount = $event" />
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
.expense-create__save-desktop { padding-top: 4px; }
.aside-tip { margin: 8px 0 0; font-size: 12px; line-height: 1.45; }
.lookup-hint { margin: 8px 0 0; font-size: 13px; }
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
.amount-zone { transition: transform var(--duration-fast); }
.amount-zone--focus { transform: scale(1.01); }
.amount-zone__label { font-size: 13px; color: var(--color-text-sub); margin-bottom: 8px; }
.amount-zone__input-row { display: flex; align-items: baseline; gap: 4px; }
.amount-zone__prefix { font-size: 28px; font-weight: 600; color: var(--color-gold); }
.amount-zone__input {
  flex: 1; border: none; background: transparent;
  font-size: 36px; font-weight: 600; color: var(--color-text-light);
  outline: none; min-width: 0;
}
.amount-zone__input::placeholder { color: rgba(232, 237, 233, 0.25); font-size: 28px; }
.amount-zone__hint { margin-top: 6px; }
.biz-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (min-width: 768px) {
  .biz-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1200px) {
  .biz-card-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.biz-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 12px 10px;
  border-radius: 14px;
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  color: var(--color-text-sub);
  text-align: center;
  cursor: pointer;
  transition: transform var(--duration-fast), border-color var(--duration-fast), box-shadow var(--duration-fast), background var(--duration-fast);
}
@media (hover: hover) {
  .biz-card:hover {
    transform: translateY(-2px);
    border-color: rgba(198, 161, 91, 0.22);
  }
}
.biz-card--active {
  background: rgba(78, 125, 105, 0.18);
  border-color: rgba(198, 161, 91, 0.35);
  color: var(--color-gold-light);
  font-weight: 600;
  box-shadow: var(--shadow-glow);
}
.biz-card__label { line-height: 1.35; }
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
  font-weight: 500;
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
  box-shadow: var(--shadow-glow);
  color: var(--color-gold-light);
}
.segment {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 12px;
  border: var(--border-glass);
}
.segment__item {
  flex: 1;
  padding: 12px 10px;
  min-height: 44px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 13px;
  color: var(--color-text-sub);
}
.segment__item--active {
  background: rgba(78, 125, 105, 0.2);
  color: var(--color-gold-light);
  font-weight: 500;
}
:deep(.field-custom) { background: transparent; }
:deep(.field-custom .van-cell) { background: transparent; padding-left: 0; padding-right: 0; }
</style>
