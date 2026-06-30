<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { fileThumbUrl } from '../api'
import { useAuthStore } from '../stores/auth'
import { loadQianfanConfig } from '../composables/useQianfan'
import { EXPENSE_BUSINESS_LABELS } from '@jade-account/shared'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import OrderLink from '../components/OrderLink.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const expense = ref<any>(null)
const statusLabels: Record<string, string> = {
  pending: '未报销',
  reimbursed: '已报销',
  not_required: '不需要报销',
  unpaid: '未打款',
  paid: '已打款',
  failed: '打款失败',
}
const thumbUrls = ref<Record<number, string>>({})

const orderNo = computed(() => expense.value?.externalOrderNo || expense.value?.sale?.externalOrderNo || '')

const profitImpactHint = computed(() => {
  if (!expense.value) return ''
  if (expense.value.affectsProfit) return '这笔钱会扣这单利润'
  if (expense.value.paySource === '员工垫付') return '员工垫付，会进报销流程'
  if (expense.value.reimbursementStatus === 'not_required') return '公司直接支出，不进员工报销'
  return ''
})

onMounted(async () => {
  await loadQianfanConfig(api)
  const res = await api.get(`/expenses/${route.params.id}`)
  expense.value = res.data.data
  for (const att of expense.value.attachments || []) {
    thumbUrls.value[att.fileId] = await fileThumbUrl(att.fileId)
  }
})

async function voidExpense() {
  try {
    const reason = prompt('请输入作废原因') || '作废'
    await api.post(`/expenses/${route.params.id}/void`, { voidReason: reason })
    showToast('已作废')
    router.back()
  } catch { /* */ }
}

async function updateReimbursement(status: string) {
  await api.patch(`/expenses/${route.params.id}/reimbursement-status`, { status })
  showToast('已更新报销状态')
  const res = await api.get(`/expenses/${route.params.id}`)
  expense.value = res.data.data
}

async function linkOrder() {
  const no = prompt('输入小红书订单号补关联', orderNo.value || '')
  if (!no?.trim()) return
  try {
    const res = await api.post(`/expenses/${route.params.id}/link`, { externalOrderNo: no.trim() })
    expense.value = res.data.data
    showToast('已补关联')
  } catch (err: any) {
    showToast(err.response?.data?.message || '关联失败')
  }
}
</script>

<template>
  <AppShell v-if="expense" title="支出详情" show-back data-testid="expense-detail-page">
    <LuxuryCard dark gold :stagger="0" padding="20px 18px" data-testid="expense-amount-card">
      <div class="expense-detail__amount money">¥{{ Number(expense.amount).toFixed(2) }}</div>
      <div class="expense-detail__type">
        {{ expense.expenseType }} · {{ expense.paySource }}
      </div>
      <div v-if="expense.businessType" class="muted">
        {{ EXPENSE_BUSINESS_LABELS[expense.businessType as keyof typeof EXPENSE_BUSINESS_LABELS] || expense.businessType }}
      </div>
      <div class="muted">{{ expense.occurredAt?.slice(0, 10) }}</div>
      <div v-if="expense.isVoided" class="expense-detail__void">已作废: {{ expense.voidReason }}</div>
      <div v-if="profitImpactHint" class="expense-detail__impact" data-testid="expense-profit-impact">
        {{ profitImpactHint }}
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="orderNo" :stagger="1" data-testid="expense-order-card">
      <div class="section-title">订单信息</div>
      <OrderLink :order-no="orderNo" data-testid="expense-detail-order-no" />
    </LuxuryCard>

    <LuxuryCard v-else-if="expense.pendingLinkStatus === 'pending_order'" :stagger="1">
      <div class="section-title">关联状态</div>
      <p class="muted">待关联订单，可先保存后补关联</p>
      <ActionButton plain data-testid="expense-link-order" @click="linkOrder">补关联订单号</ActionButton>
    </LuxuryCard>

    <LuxuryCard :stagger="2">
      <div class="section-title">详情</div>
      <div class="expense-detail__row">
        <span class="muted">报销人</span>
        <span>{{ expense.reimbursementPerson || '-' }}</span>
      </div>
      <div class="expense-detail__row">
        <span class="muted">报销状态</span>
        <span>{{ statusLabels[expense.reimbursementStatus] || expense.reimbursementStatus }}</span>
      </div>
      <div v-if="expense.customerPaymentStatus" class="expense-detail__row" data-testid="expense-payment-status">
        <span class="muted">打款状态</span>
        <span>{{ statusLabels[expense.customerPaymentStatus] || expense.customerPaymentStatus }}</span>
      </div>
      <div class="expense-detail__row">
        <span class="muted">货品编号</span>
        <span>{{ expense.braceletCode || '未绑定' }}</span>
      </div>
      <div v-if="expense.saleId" class="expense-detail__row expense-detail__row--link" @click="router.push(`/sales/${expense.saleId}`)">
        <span class="muted">关联销售</span>
        <span>#{{ expense.saleId }} →</span>
      </div>
      <div v-if="expense.expenseSummary" class="expense-detail__row">
        <span class="muted">摘要</span>
        <span>{{ expense.expenseSummary }}</span>
      </div>
      <div v-if="expense.remark" class="expense-detail__row">
        <span class="muted">备注</span>
        <span>{{ expense.remark }}</span>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="auth.hasPermission('expense:attachment:view')" :stagger="3" data-testid="expense-voucher-card">
      <div class="section-title">凭证图片（{{ expense.attachments?.length || 0 }}）</div>
      <div class="expense-detail__thumbs">
        <img
          v-for="att in expense.attachments"
          :key="att.id"
          :src="thumbUrls[att.fileId]"
          alt="凭证"
        />
      </div>
      <div v-if="!expense.attachments?.length" class="muted">暂无凭证</div>
    </LuxuryCard>

    <div class="expense-detail__actions">
      <ActionButton
        v-if="auth.hasPermission('reimbursement:update') && expense.paySource === '员工垫付'"
        variant="secondary"
        @click="updateReimbursement('reimbursed')"
      >标记已报销</ActionButton>
      <ActionButton
        v-if="auth.hasPermission('expense:void') && !expense.isVoided"
        variant="danger"
        @click="voidExpense"
      >作废</ActionButton>
    </div>
  </AppShell>
</template>

<style scoped>
.expense-detail__amount {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-light);
  margin-bottom: 6px;
}
.expense-detail__type {
  font-size: 15px;
  color: var(--color-gold-light);
}
.expense-detail__void {
  color: #ffb4b4;
  font-size: 13px;
  margin-top: 8px;
}
.expense-detail__impact {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(198, 161, 91, 0.15);
  color: var(--color-gold-light);
  font-size: 13px;
}
.expense-detail__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  font-size: 14px;
}
.expense-detail__row:last-child { border-bottom: none; }
.expense-detail__row--link { cursor: pointer; color: var(--color-jade-deep); }
.expense-detail__thumbs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.expense-detail__thumbs img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 10px;
  border: var(--border-gold);
}
.expense-detail__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0 24px;
}
</style>
