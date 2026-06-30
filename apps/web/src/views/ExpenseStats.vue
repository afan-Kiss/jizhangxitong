<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const period = ref('today')
const summary = ref<any>(null)
const monthly = ref<any>(null)
const items = ref<any[]>([])
const loadError = ref('')

const periods = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: '15days', label: '近15天' },
  { key: 'month', label: '本月' },
  { key: 'custom', label: '自定义' },
]

async function load() {
  loadError.value = ''
  try {
    const res = await api.get(`/expenses/summary?period=${period.value}`)
    summary.value = res.data.data
    const list = await api.get(`/expenses?startDate=${summary.value.period.start.slice(0, 10)}&endDate=${summary.value.period.end.slice(0, 10)}&pageSize=50`)
    items.value = list.data.data.items
    const now = new Date()
    const m = await api.get(`/stats/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
    monthly.value = m.data.data
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  }
}

onMounted(load)
</script>

<template>
  <AppShell title="支出统计" :show-back="!isDesktop" @back="router.back()">
    <p v-if="loadError" class="muted">{{ loadError }}</p>

    <van-tabs v-model:active="period" @change="load">
      <van-tab v-for="p in periods" :key="p.key" :title="p.label" :name="p.key" />
    </van-tabs>

    <LuxuryCard v-if="summary" data-testid="expense-stats-summary">
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">支出总额</div>
          <div class="stat-value">¥{{ summary.totalAmount?.toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">未报销</div>
          <div class="stat-value">¥{{ summary.pendingAmount?.toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">客户补偿</div>
          <div class="stat-value">¥{{ summary.compensationAmount?.toFixed(2) }}</div>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="monthly" gold>
      <div class="section-title">运营月报</div>
      <p class="muted rule-hint">{{ monthly.ruleHint }}</p>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">有效成交金额</div>
          <div class="stat-value">¥{{ Number(monthly.effectiveSaleAmount).toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">有效订单数</div>
          <div class="stat-value">{{ monthly.effectiveOrderCount }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">退款影响</div>
          <div class="stat-value">¥{{ Number(monthly.refundImpact).toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">毛利</div>
          <div class="stat-value">¥{{ Number(monthly.grossProfit).toFixed(2) }}</div>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="summary">
      <h4>按类型</h4>
      <div v-for="(val, key) in summary.byType" :key="key" class="list-item">
        {{ key }}: ¥{{ Number(val).toFixed(2) }}
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <h4>明细列表</h4>
      <div v-for="item in items" :key="item.id" class="list-item" @click="router.push(`/expense/${item.id}`)">
        {{ item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }} · {{ item.paySource }}
      </div>
      <div v-if="!items.length" class="muted">暂无记录</div>
    </LuxuryCard>

    <ActionButton block @click="router.push('/expense/export')">导出报销表</ActionButton>
  </AppShell>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (min-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(4, 1fr); }
}
.stat-label { font-size: 13px; color: var(--color-text-muted); }
.stat-value { font-size: 18px; font-weight: 600; margin-top: 4px; }
.list-item { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06); cursor: pointer; }
.rule-hint { font-size: 13px; line-height: 1.5; margin: 0 0 12px; }
</style>
