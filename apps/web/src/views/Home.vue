<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import DateRangePicker from '../components/DateRangePicker.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import EmptyState from '../components/EmptyState.vue'
import { resolveDateRange } from '../utils/date-range'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const homeStats = ref<any>(null)
const recentExpenses = ref<any[]>([])
const loadError = ref('')
const loading = ref(false)

async function loadDashboard() {
  loading.value = true
  loadError.value = ''
  try {
    const [home, expenses] = await Promise.all([
      api.get('/stats/home'),
      api.get('/expenses?pageSize=5'),
    ])
    homeStats.value = home.data.data
    recentExpenses.value = expenses.data.data.items
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  } finally {
    loading.value = false
  }
}

function goExpenseStats(query: Record<string, string> = {}, rangeKey: 'today' | 'this_month' = 'this_month') {
  const range = resolveDateRange(rangeKey)
  router.push({
    path: '/expense/stats',
    query: { range: rangeKey, startDate: range.startDate, endDate: range.endDate, ...query },
  })
}

watch(() => route.path, () => {
  if (route.path === '/') loadDashboard()
})

onMounted(async () => {
  try {
    await auth.fetchMe()
    await loadDashboard()
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  }
})

const hasData = () => (homeStats.value?.todayExpenseCount ?? 0) > 0 || recentExpenses.value.length > 0
</script>

<template>
  <div class="home-page page-enter" data-testid="home-page">
    <header class="home-hero">
      <div>
        <h1 class="home-hero__title">今日项目资金概览</h1>
        <p class="home-hero__sub">记录每一笔支出，自动生成统计与对账表</p>
      </div>
      <div class="home-hero__actions">
        <button type="button" class="ui-btn ui-btn--gold" data-testid="home-expense-btn" @click="router.push('/expense/create')">
          记一笔支出
        </button>
        <button type="button" class="ui-btn" @click="router.push('/expense/stats')">进入资金对账中心</button>
      </div>
    </header>

    <p v-if="loadError" class="home-page__error">{{ loadError }}</p>
    <p v-else-if="loading && !homeStats" class="muted">加载中…</p>

    <template v-if="homeStats">
      <section v-if="!hasData()" class="home-welcome">
        <EmptyState
          title="欢迎回来"
          description="今天还没有支出，记第一笔后这里会自动生成统计。"
          action-label="去记支出"
          secondary-label="查看资金对账中心"
          @action="router.push('/expense/create')"
          @secondary="router.push('/expense/stats')"
        />
      </section>

      <section class="home-kpis" data-testid="home-kpi-grid">
        <button type="button" class="home-kpi" data-testid="kpi-today-expense" @click="goExpenseStats({}, 'today')">
          <span class="home-kpi__label">今日支出金额</span>
          <span class="home-kpi__value money">¥{{ Number(homeStats.todayExpenseAmount || 0).toFixed(2) }}</span>
        </button>
        <button type="button" class="home-kpi" @click="goExpenseStats({}, 'today')">
          <span class="home-kpi__label">今日支出笔数</span>
          <span class="home-kpi__value">{{ homeStats.todayExpenseCount ?? 0 }} 笔</span>
        </button>
        <button type="button" class="home-kpi" data-testid="kpi-missing-attachment" @click="goExpenseStats({ filter: 'missing-attachment' }, 'today')">
          <span class="home-kpi__label">待补凭证</span>
          <span class="home-kpi__value">{{ homeStats.missingAttachmentCount ?? 0 }} 笔</span>
        </button>
        <button type="button" class="home-kpi" data-testid="kpi-with-voucher" @click="goExpenseStats({ filter: 'with-voucher' }, 'this_month')">
          <span class="home-kpi__label">有凭证笔数</span>
          <span class="home-kpi__value">{{ homeStats.withVoucherCount ?? 0 }} 笔</span>
        </button>
      </section>

      <section class="home-quick ui-card">
        <h2 class="section-title">快捷操作</h2>
        <div class="home-quick__grid">
          <button type="button" class="home-quick__btn" @click="router.push('/expense/create')">
            <van-icon name="balance-pay" size="22" />
            <span>记一笔支出</span>
          </button>
          <button type="button" class="home-quick__btn" @click="router.push('/expense/create?focus=upload')">
            <van-icon name="photograph" size="22" />
            <span>上传凭证</span>
          </button>
          <button type="button" class="home-quick__btn" @click="router.push('/expense/stats')">
            <van-icon name="chart-trending-o" size="22" />
            <span>资金对账中心</span>
          </button>
        </div>
      </section>

      <section class="home-recent ui-card">
        <div class="home-recent__head">
          <h2 class="section-title">最近 5 条支出</h2>
          <button type="button" class="home-recent__more" @click="router.push('/expense/stats')">查看全部</button>
        </div>
        <EmptyState
          v-if="!recentExpenses.length"
          title="还没有支出记录"
          description="记一笔支出后，最近记录会显示在这里。"
          action-label="去记支出"
          @action="router.push('/expense/create')"
        />
        <div
          v-for="item in recentExpenses"
          :key="item.id"
          class="home-recent__row"
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
      </section>
    </template>
  </div>
</template>

<style scoped>
.home-hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.home-hero__title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-main);
}
.home-hero__sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-sub);
}
.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.home-page__error {
  color: var(--color-danger);
  margin-bottom: 12px;
}
.home-welcome {
  margin-bottom: 16px;
}
.home-kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
@media (min-width: 768px) {
  .home-kpis { grid-template-columns: repeat(4, 1fr); }
}
.home-kpi {
  text-align: left;
  padding: 16px;
  border: 1px solid #e7ddc8;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.home-kpi:hover {
  border-color: var(--color-gold-border-hover);
  box-shadow: var(--shadow-glow);
}
.home-kpi__label {
  display: block;
  font-size: 12px;
  color: var(--color-text-sub);
  margin-bottom: 8px;
}
.home-kpi__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-gold-deep);
}
.home-quick {
  margin-bottom: 16px;
}
.home-quick__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (max-width: 480px) {
  .home-quick__grid { grid-template-columns: 1fr; }
}
.home-quick__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 72px;
  padding: 14px;
  border: 1px solid #e7ddc8;
  border-radius: 12px;
  background: #fbf8f1;
  color: var(--color-text-main);
  font-size: 13px;
  cursor: pointer;
}
.home-quick__btn :deep(.van-icon) {
  color: var(--color-gold);
}
.home-recent__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.home-recent__head .section-title { margin: 0; }
.home-recent__more {
  border: none;
  background: none;
  color: var(--color-gold);
  font-size: 13px;
  cursor: pointer;
}
.home-recent__row {
  cursor: pointer;
  border-radius: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #f0ebe0;
}
.home-recent__row:last-child { border-bottom: none; }
</style>
