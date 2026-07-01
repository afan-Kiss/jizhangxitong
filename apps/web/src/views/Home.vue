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
const todayStats = ref<any>(null)
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
    const [bi, today, expenses, logs] = await Promise.all([
      api.get('/bi/summary', {
        params: {
          range: dateRange.value.range,
          startDate: dateRange.value.startDate,
          endDate: dateRange.value.endDate,
        },
      }),
      api.get('/stats/home'),
      api.get('/expenses?pageSize=5'),
      api.get('/operation-logs?pageSize=5'),
    ])
    summary.value = bi.data.data
    todayStats.value = today.data.data
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

function goDrilldown(type: string) {
  router.push({
    path: '/bi/drilldown',
    query: { type, ...toRangeQuery(dateRange.value) },
  })
}

function goExpenseStats() {
  router.push({
    path: '/expense/stats',
    query: toRangeQuery(dateRange.value),
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
  return `${label}经营简况 · 专属经费记支出 · 点卡片看明细`
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
        <button type="button" class="home-page__kpi" data-testid="kpi-today-expense" @click="goExpenseStats">
          <MoneyCard
            label="今日支出"
            :value="todayStats?.todayExpenseAmount ?? 0"
            sub="今天记的经费支出"
            :stagger="0"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-expenses" @click="goExpenseStats">
          <MoneyCard
            label="本期经费支出"
            :value="summary?.expenseAmount ?? 0"
            sub="按发生日期统计"
            :stagger="1"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-customer-payments" @click="goDrilldown('customer-payments')">
          <MoneyCard
            label="客户返款/补偿"
            :value="summary?.customerPaymentAmount ?? 0"
            sub="影响利润的客户打款"
            :stagger="2"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-refunds" @click="goDrilldown('refunds')">
          <MoneyCard
            label="退款金额"
            :value="summary?.refundAmount ?? 0"
            sub="已确认退款"
            :stagger="3"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-effective-sales" @click="goDrilldown('effective-sales')">
          <MoneyCard
            label="有效成交金额"
            :value="summary?.effectiveSaleAmount ?? 0"
            :sub="`${summary?.effectiveOrderCount ?? 0} 单`"
            highlight
            :stagger="4"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-inventory" @click="goDrilldown('inventory')">
          <MoneyCard
            label="在库货品"
            :value="summary?.inventoryCost ?? 0"
            :sub="`${summary?.inventoryCount ?? 0} 件在库`"
            :stagger="5"
          />
        </button>
        <button type="button" class="home-page__kpi home-page__kpi--wide" data-testid="kpi-profit" @click="goDrilldown('profit')">
          <MoneyCard
            label="净利润"
            :value="summary?.netProfit ?? 0"
            sub="销售额 - 成本 - 退款 - 客户补偿"
            :stagger="6"
          />
        </button>
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="5" data-testid="home-quick-actions">
      <div class="section-title">快捷操作</div>
      <div class="home-page__actions">
        <button class="home-page__action" data-testid="home-expense-btn" @click="router.push('/expense/create')">
          <van-icon name="balance-pay" size="22" />
          <span>记一笔支出</span>
        </button>
        <button class="home-page__action" data-testid="home-scan-btn" @click="scan.openScan()">
          <van-icon name="scan" size="22" />
          <span>扫码工作台</span>
        </button>
        <button class="home-page__action" @click="router.push('/expense/stats')">
          <van-icon name="chart-trending-o" size="22" />
          <span>支出统计</span>
        </button>
        <button class="home-page__action" data-testid="home-bi-btn" @click="goDrilldown('expenses')">
          <van-icon name="orders-o" size="22" />
          <span>经营明细</span>
        </button>
      </div>
    </LuxuryCard>

    <div class="desktop-grid-2">
      <LuxuryCard :stagger="6">
        <div class="section-title">最近支出</div>
        <div v-if="!recentExpenses.length" class="luxury-empty">暂无记录</div>
        <div
          v-for="item in recentExpenses"
          :key="item.id"
          class="home-page__expense-row"
          @click="router.push(`/expense/${item.id}`)"
        >
          <ExpenseItem
            :type="item.expenseType"
            :amount="Number(item.amount)"
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
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (min-width: 768px) {
  .home-page__kpi-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.home-page__kpi--wide {
  grid-column: 1 / -1;
}
@media (min-width: 768px) {
  .home-page__kpi--wide {
    grid-column: span 1;
  }
}
.home-page__kpi {
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-height: 88px;
  border-radius: var(--radius-card);
}
.home-page__kpi :deep(.money-card) {
  width: 100%;
  height: 100%;
}
.home-page__actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 480px) {
  .home-page__actions {
    grid-template-columns: repeat(4, 1fr);
  }
}
.home-page__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 76px;
  padding: 14px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-light);
  font-size: 12px;
  cursor: pointer;
}
.home-page__action :deep(.van-icon) {
  color: var(--color-gold);
}
.home-page__log {
  padding: 12px 4px;
  border-bottom: 1px solid rgba(215, 181, 109, 0.08);
  font-size: 13px;
  line-height: 1.5;
}
.home-page__log:last-child { border-bottom: none; }
.home-page__expense-row {
  cursor: pointer;
  border-radius: 10px;
}
</style>
