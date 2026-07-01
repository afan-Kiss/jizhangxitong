<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import LuxuryCard from '../components/LuxuryCard.vue'
import MoneyCard from '../components/MoneyCard.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import PageHero from '../components/PageHero.vue'
import DateRangePicker from '../components/DateRangePicker.vue'
import {
  parseRouteRange,
  rangeLabel,
  toRangeQuery,
  type DateRangeState,
} from '../utils/date-range'
import { useScanOverlay } from '../composables/useScanOverlay'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const scan = useScanOverlay()

const dateRange = ref<DateRangeState>(parseRouteRange(route.query as Record<string, string>))
const summary = ref<any>(null)
const recentExpenses = ref<any[]>([])
const recentLogs = ref<any[]>([])
const loadError = ref('')
const loading = ref(false)

function formatLog(log: any): string {
  return log.formattedMessage || log.summary || '有操作记录'
}

function syncRouteQuery() {
  router.replace({ query: { ...route.query, ...toRangeQuery(dateRange.value) } })
}

async function loadDashboard() {
  loading.value = true
  loadError.value = ''
  try {
    const [bi, expenses, logs] = await Promise.all([
      api.get('/bi/summary', {
        params: {
          range: dateRange.value.range,
          startDate: dateRange.value.startDate,
          endDate: dateRange.value.endDate,
        },
      }),
      api.get('/expenses?pageSize=5'),
      api.get('/operation-logs?pageSize=5'),
    ])
    summary.value = bi.data.data
    recentExpenses.value = expenses.data.data.items
    recentLogs.value = logs.data.data.items
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  } finally {
    loading.value = false
  }
}

function onRangeChange() {
  syncRouteQuery()
  loadDashboard()
}

function goReimbursements() {
  router.push({
    path: '/reimbursements',
    query: toRangeQuery(dateRange.value),
  })
}

function exportThisMonth() {
  router.push({
    path: '/expense/export',
    query: { startDate: dateRange.value.startDate, endDate: dateRange.value.endDate },
  })
}

watch(
  () => [route.query.range, route.query.startDate, route.query.endDate],
  () => {
    dateRange.value = parseRouteRange(route.query as Record<string, string>)
  },
)

onMounted(async () => {
  try {
    await auth.fetchMe()
    await auth.fetchWorkerStatus()
    syncRouteQuery()
    await loadDashboard()
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  }
})

const heroSubtitle = () => {
  const label = rangeLabel(dateRange.value)
  return `报销总览 · ${label} · 点卡片管理待报销`
}
</script>

<template>
  <div class="home-page page-enter" data-testid="home-page">
    <PageHero title="店里经营情况" :subtitle="heroSubtitle()" test-id="home-hero" />
    <div class="show-mobile-only home-page__worker">
      <WorkerStatus :status="auth.workerStatus" compact />
    </div>

    <DateRangePicker v-model="dateRange" @change="onRangeChange" />

    <p v-if="loadError" class="home-page__error">{{ loadError }}</p>

    <LuxuryCard dark :stagger="0" padding="18px 16px 16px">
      <div class="section-title">{{ rangeLabel(dateRange) }}简况</div>
      <div class="home-page__kpi-grid">
        <button
          type="button"
          class="home-page__kpi home-page__kpi--solo"
          data-testid="kpi-reimbursements"
          @click="goReimbursements"
        >
          <MoneyCard
            label="还有多少没报销"
            :value="summary?.pendingReimbursementAmount ?? 0"
            :sub="`${summary?.pendingReimbursementCount ?? 0} 笔待处理`"
            highlight
            :stagger="1"
          />
          <span class="home-page__kpi-hint">批量处理</span>
        </button>
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="5" data-testid="home-quick-actions">
      <div class="section-title">快捷操作</div>
      <div class="home-page__actions">
        <button class="home-page__action" data-testid="home-expense-btn" @click="router.push('/expense/create')">
          <van-icon name="balance-pay" size="22" />
          <span>记一笔</span>
        </button>
        <button class="home-page__action" data-testid="home-scan-btn" @click="scan.openScan()">
          <van-icon name="scan" size="22" />
          <span>扫码工作台</span>
        </button>
        <button class="home-page__action" @click="exportThisMonth">
          <van-icon name="down" size="22" />
          <span>导出报销</span>
        </button>
        <button class="home-page__action" @click="router.push('/expense/stats')">
          <van-icon name="chart-trending-o" size="22" />
          <span>支出统计</span>
        </button>
      </div>
    </LuxuryCard>

    <div class="desktop-grid-2">
      <LuxuryCard :stagger="6">
        <div class="section-title">最近支出</div>
        <div v-if="!recentExpenses.length" class="muted">暂无记录</div>
        <div
          v-for="item in recentExpenses"
          :key="item.id"
          class="home-page__expense-row"
          @click="router.push(`/expense/${item.id}`)"
        >
          <ExpenseItem
            :type="item.expenseType"
            :amount="Number(item.amount)"
            :person="item.reimbursementPerson"
            :pay-source="item.paySource"
            :bracelet-code="item.braceletCode"
            :occurred-at="item.occurredAt"
          />
        </div>
      </LuxuryCard>

      <LuxuryCard :stagger="7">
        <div class="section-title">最近操作</div>
        <div v-for="log in recentLogs" :key="log.id" class="home-page__log muted">
          {{ formatLog(log) }}
        </div>
      </LuxuryCard>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  overflow-x: hidden;
  max-width: 100%;
}
.home-page__error {
  color: #c45c00;
  font-size: 14px;
  margin: 0 0 12px;
}
.home-page__kpi-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  max-width: 420px;
}
.home-page__kpi--solo {
  max-width: 100%;
}
.home-page__kpi {
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-height: 88px;
  transition: transform var(--duration-fast) var(--ease-out);
}
@media (hover: hover) {
  .home-page__kpi:hover { transform: translateY(-3px); }
}
.home-page__kpi :deep(.money-card) {
  width: 100%;
  height: 100%;
}
.home-page__kpi-hint {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 10px;
  color: var(--color-gold);
  opacity: 0.85;
  pointer-events: none;
}
.home-page__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (min-width: 1200px) {
  .home-page__actions { grid-template-columns: repeat(4, 1fr); }
}
.home-page__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 72px;
  padding: 14px 8px;
  border: var(--border-glass);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  font-size: 12px;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast), box-shadow var(--duration-fast);
}
@media (hover: hover) {
  .home-page__action:hover {
    transform: translateY(-2px);
    border-color: rgba(198, 161, 91, 0.25);
    box-shadow: var(--shadow-glow);
  }
}
.home-page__action:active { transform: scale(0.96); }
.home-page__action :deep(.van-icon) { color: var(--color-gold); }
.home-page__log {
  padding: 10px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  font-size: 13px;
  line-height: 1.5;
}
.home-page__log:last-child { border-bottom: none; }
.home-page__expense-row { cursor: pointer; }
</style>
