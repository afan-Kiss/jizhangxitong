<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../api'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import DateRangePicker from '../components/DateRangePicker.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import {
  parseRouteRange,
  rangeLabel,
  toRangeQuery,
  type DateRangeState,
} from '../utils/date-range'

const router = useRouter()
const route = useRoute()
const dateRange = ref<DateRangeState>(parseRouteRange(route.query as Record<string, string>))
const summary = ref<any>(null)
const monthly = ref<any>(null)
const items = ref<any[]>([])
const loadError = ref('')
const loading = ref(false)

function syncRouteQuery() {
  router.replace({ query: { ...toRangeQuery(dateRange.value) } })
}

async function load() {
  loading.value = true
  loadError.value = ''
  const { startDate, endDate } = dateRange.value
  try {
    const res = await api.get('/expenses/summary', {
      params: { period: 'custom', startDate, endDate },
    })
    summary.value = res.data.data
    const listParams: Record<string, string | number> = {
      startDate,
      endDate,
      pageSize: 50,
      mine: 1,
    }
    if (route.query.filter === 'missing-attachment') listParams.needsAttachment = 1
    const list = await api.get('/expenses', { params: listParams })
    items.value = list.data.data.items
    const now = new Date()
    const m = await api.get(`/stats/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
    monthly.value = m.data.data
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  } finally {
    loading.value = false
  }
}

function onRangeChange() {
  syncRouteQuery()
  load()
}

watch(
  () => [route.query.range, route.query.startDate, route.query.endDate, route.query.filter],
  () => {
    dateRange.value = parseRouteRange(route.query as Record<string, string>)
    load()
  },
)

onMounted(() => {
  syncRouteQuery()
  load()
})
</script>

<template>
  <AppShell title="支出统计">
    <div data-testid="expense-stats-date-range">
      <DateRangePicker v-model="dateRange" @change="onRangeChange" />
    </div>

    <p v-if="loadError" class="muted">{{ loadError }}</p>
    <p v-else-if="loading && !summary" class="muted">加载中…</p>

    <LuxuryCard v-if="summary" data-testid="expense-stats-summary">
      <p class="range-hint muted">{{ rangeLabel(dateRange) }}</p>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">支出总额</div>
          <div class="stat-value">¥{{ summary.totalAmount?.toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">支出笔数</div>
          <div class="stat-value">{{ summary.totalCount }} 笔</div>
        </div>
        <div v-if="summary.myCount != null" class="stat-item">
          <div class="stat-label">我记的笔数</div>
          <div class="stat-value" data-testid="expense-stats-my-count">{{ summary.myCount }} 笔</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">待补凭证</div>
          <div class="stat-value">{{ summary.needsAttachmentCount ?? 0 }} 笔</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">已关联订单</div>
          <div class="stat-value">{{ summary.linkedOrderCount ?? 0 }} 笔</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">未关联订单</div>
          <div class="stat-value">{{ summary.unlinkedOrderCount ?? 0 }} 笔</div>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="monthly" gold data-testid="expense-stats-monthly">
      <div class="section-title">本月支出月报</div>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">本月支出</div>
          <div class="stat-value">¥{{ Number(monthly.expenseTotal).toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">本月笔数</div>
          <div class="stat-value">{{ monthly.expenseCount }} 笔</div>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard v-if="summary?.byType">
      <div class="section-title">按支出分类</div>
      <div class="type-list">
        <div v-for="(val, key) in summary.byType" :key="key" class="type-list__row">
          <span class="type-list__label">{{ key }}</span>
          <span class="type-list__amount money">¥{{ Number(val).toFixed(2) }}</span>
        </div>
      </div>
      <div v-if="!Object.keys(summary.byType || {}).length" class="muted">暂无分类数据</div>
    </LuxuryCard>

    <LuxuryCard v-if="summary?.byPaySource">
      <div class="section-title">按付款来源</div>
      <div class="type-list">
        <div v-for="(val, key) in summary.byPaySource" :key="key" class="type-list__row">
          <span class="type-list__label">{{ key }}</span>
          <span class="type-list__amount money">¥{{ Number(val).toFixed(2) }}</span>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">支出明细</div>
      <div v-if="items.length" class="list-card">
        <div
          v-for="item in items"
          :key="item.id"
          class="list-card__item list-card__item--stacked"
          @click="router.push(`/expense/${item.id}`)"
        >
          <ExpenseItem
            :type="item.expenseType"
            :amount="Number(item.amount)"
            :pay-source="item.paySource"
            :occurred-at="item.occurredAt"
          />
        </div>
      </div>
      <div v-if="!items.length && !loading" class="muted">暂无记录</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.range-hint { margin: 0 0 12px; font-size: 13px; }
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (min-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
}
.stat-label { font-size: 13px; color: var(--color-text-muted); }
.stat-value { font-size: 18px; font-weight: 600; margin-top: 4px; }
.type-list {
  border: var(--border-gold);
  border-radius: var(--radius-card);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}
.type-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
}
.type-list__row:last-child { border-bottom: none; }
.type-list__label { font-size: 14px; color: var(--color-text-light); }
.type-list__amount { font-size: 16px; font-weight: 600; color: var(--color-gold-light); }
.list-card__item--stacked { display: block; padding: 0 16px; }
</style>
