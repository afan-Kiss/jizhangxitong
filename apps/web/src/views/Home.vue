<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import LuxuryCard from '../components/LuxuryCard.vue'
import MoneyCard from '../components/MoneyCard.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import PageHero from '../components/PageHero.vue'
import DateRangePicker from '../components/DateRangePicker.vue'
import {
  parseRouteRange,
  rangeLabel,
  toRangeQuery,
  type DateRangeState,
} from '../utils/date-range'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const dateRange = ref<DateRangeState>(parseRouteRange(route.query as Record<string, string>))
const homeStats = ref<any>(null)
const periodSummary = ref<any>(null)
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
    const { startDate, endDate } = dateRange.value
    const [home, period, expenses, logs] = await Promise.all([
      api.get('/stats/home'),
      api.get('/expenses/summary', {
        params: { period: 'custom', startDate, endDate },
      }),
      api.get('/expenses?pageSize=5'),
      api.get('/operation-logs?pageSize=5'),
    ])
    homeStats.value = home.data.data
    periodSummary.value = period.data.data
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

function goExpenseStats(query: Record<string, string> = {}) {
  router.push({
    path: '/expense/stats',
    query: { ...toRangeQuery(dateRange.value), ...query },
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
    syncRouteQuery()
    await loadDashboard()
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  }
})

const heroSubtitle = () => '记录每一笔项目资金去向，可关联千帆订单'
</script>

<template>
  <div class="home-page page-enter" data-testid="home-page">
    <PageHero title="项目资金支出记录" :subtitle="heroSubtitle()" test-id="home-hero" />

    <DateRangePicker v-model="dateRange" @change="onRangeChange" />

    <p v-if="loadError" class="home-page__error">{{ loadError }}</p>

    <LuxuryCard dark :stagger="0" padding="18px 16px 16px">
      <div class="section-title">{{ rangeLabel(dateRange) }}简况</div>
      <div class="home-page__kpi-grid">
        <button type="button" class="home-page__kpi" data-testid="kpi-today-expense" @click="goExpenseStats()">
          <MoneyCard
            label="今日支出"
            :value="homeStats?.todayExpenseAmount ?? 0"
            sub="今天记的支出"
            :stagger="0"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-period-expense" @click="goExpenseStats()">
          <MoneyCard
            label="本期支出"
            :value="periodSummary?.totalAmount ?? 0"
            sub="按发生日期统计"
            :stagger="1"
          />
        </button>
        <button type="button" class="home-page__kpi" data-testid="kpi-month-expense" @click="goExpenseStats()">
          <MoneyCard
            label="本月支出"
            :value="homeStats?.monthExpenseAmount ?? 0"
            sub="自然月累计"
            :stagger="2"
          />
        </button>
        <button
          type="button"
          class="home-page__kpi"
          data-testid="kpi-missing-attachment"
          @click="goExpenseStats({ filter: 'missing-attachment' })"
        >
          <MoneyCard
            label="待补凭证"
            :value="homeStats?.missingAttachmentCount ?? 0"
            sub="缺少凭证图片"
            :stagger="3"
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
        <button class="home-page__action" data-testid="home-order-btn" @click="router.push('/expense/create?focus=order')">
          <van-icon name="orders-o" size="22" />
          <span>查询/关联订单</span>
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
            :person="item.operatorName || item.reimbursementPerson || undefined"
            :pay-source="item.paySource"
            :occurred-at="item.occurredAt"
          />
        </div>
      </LuxuryCard>

      <LuxuryCard :stagger="7">
        <div class="section-title">最近操作</div>
        <div v-if="!recentLogs.length" class="luxury-empty">暂无记录</div>
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
    grid-template-columns: repeat(4, 1fr);
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
    grid-template-columns: repeat(3, 1fr);
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
