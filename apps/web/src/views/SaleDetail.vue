<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { loadQianfanConfig } from '../composables/useQianfan'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import OrderLink from '../components/OrderLink.vue'
import ProfitPanel from '../components/ProfitPanel.vue'
import type { ProfitRow } from '../components/ProfitPanel.vue'

const route = useRoute()
const router = useRouter()
const sale = ref<any>(null)

const profitRows = computed<ProfitRow[]>(() => {
  if (!sale.value) return []
  const s = sale.value
  const refund = Number(s.refundAmount ?? s.confirmedRefundTotal ?? 0)
  const customerPay = Number(s.customerPaymentDeduction ?? s.compensationAmount ?? 0)
  return [
    { label: '销售金额', amount: Number(s.saleAmount), type: 'base' },
    { label: '减：销售时总成本', amount: Number(s.totalCostSnapshot), type: 'deduct' },
    { label: '销售毛利', amount: Number(s.grossProfit), type: 'sub' },
    ...(refund > 0 ? [{ label: '减：已确认退款', amount: refund, type: 'deduct' as const }] : []),
    ...(customerPay > 0 ? [{ label: '减：客户返款/补偿', amount: customerPay, type: 'deduct' as const }] : []),
    { label: '最终到手利润', amount: Number(s.finalProfit), type: 'total', highlight: true },
  ]
})

onMounted(async () => {
  await loadQianfanConfig(api)
  const res = await api.get(`/sales/${route.params.id}`)
  sale.value = res.data.data
})

async function onRefund() {
  const amount = prompt('退款金额', String(sale.value?.saleAmount || ''))
  if (!amount) return
  await api.post(`/sales/${route.params.id}/refund`, {
    refundAmount: Number(amount),
    refundReason: '客户退款',
  })
  showToast('已处理退款')
  const res = await api.get(`/sales/${route.params.id}`)
  sale.value = res.data.data
}
</script>

<template>
  <AppShell v-if="sale" title="销售详情" data-testid="sale-detail-page">
    <LuxuryCard dark gold :stagger="0" padding="20px 18px">
      <div class="sale-detail__amount money">¥{{ Number(sale.saleAmount).toFixed(2) }}</div>
      <div class="sale-detail__meta">
        {{ sale.braceletCode }} · {{ sale.platform }} · {{ sale.status }}
      </div>
      <div class="muted">{{ sale.customerName || '-' }} · {{ sale.soldAt?.slice(0, 10) }}</div>
    </LuxuryCard>

    <LuxuryCard :stagger="1">
      <div class="section-title">登记信息</div>
      <div class="sale-detail__row">
        <span class="muted">登记人</span>
        <span>{{ sale.createdByUser?.displayName || '历史数据，未记录操作人' }}</span>
      </div>
      <div v-for="log in sale.operationLogs || []" :key="log.id" class="muted sale-detail__log">
        {{ log.summary }} · {{ log.createdAt?.slice(0, 16).replace('T', ' ') }}
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="sale.externalOrderNo" :stagger="2" data-testid="sale-order-card">
      <div class="section-title">小红书订单</div>
      <OrderLink :order-no="sale.externalOrderNo" data-testid="sale-detail-order-no" />
    </LuxuryCard>

    <LuxuryCard :stagger="2" data-testid="sale-profit-waterfall">
      <div class="section-title">利润瀑布</div>
      <ProfitPanel :rows="profitRows" />
    </LuxuryCard>

    <LuxuryCard v-if="sale.expenses?.length" :stagger="3">
      <div class="section-title">相关支出</div>
      <div
        v-for="e in sale.expenses"
        :key="e.id"
        class="sale-detail__expense"
        @click="router.push(`/expense/${e.id}`)"
      >
        {{ e.expenseType }} · ¥{{ Number(e.amount).toFixed(2) }}
      </div>
    </LuxuryCard>

    <div class="sale-detail__actions">
      <ActionButton
        v-if="sale.status === 'sold'"
        variant="secondary"
        block
        @click="onRefund"
      >处理退款</ActionButton>
    </div>
  </AppShell>
</template>

<style scoped>
.sale-detail__amount {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-light);
  margin-bottom: 6px;
}
.sale-detail__meta {
  font-size: 15px;
  color: var(--color-gold-light);
}
.sale-detail__expense {
  padding: 12px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  cursor: pointer;
  font-size: 14px;
  color: var(--color-jade-deep);
}
.sale-detail__expense:last-child { border-bottom: none; }
.sale-detail__actions {
  padding: 8px 0 24px;
}
</style>
