<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import LuxuryCard from '../components/LuxuryCard.vue'
import MoneyCard from '../components/MoneyCard.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import PageHero from '../components/PageHero.vue'

const router = useRouter()
const auth = useAuthStore()
const dashboard = ref<any>(null)
const weekAmount = ref(0)
const monthAmount = ref(0)
const recentExpenses = ref<any[]>([])
const recentLogs = ref<any[]>([])
const loadError = ref('')

function formatLog(log: any): string {
  const name = log.operatorName || '有人'
  const actionMap: Record<string, string> = {
    create_expense: '新增支出',
    update_expense: '修改支出',
    void_expense: '作废支出',
    create_sale: '登记销售',
    sync_bracelet: '同步镯子',
    export_reimbursement_excel: '导出报销表',
  }
  const action = actionMap[log.action] || log.action
  const code = log.targetCode ? `，${log.targetCode}` : ''
  return `${name}${action}${code}`
}

onMounted(async () => {
  try {
    await auth.fetchMe()
    await auth.fetchWorkerStatus()
    const [dash, week, month, expenses, logs] = await Promise.all([
      api.get('/stats/home'),
      api.get('/expenses/summary?period=week'),
      api.get('/expenses/summary?period=month'),
      api.get('/expenses?pageSize=5'),
      api.get('/operation-logs?pageSize=5'),
    ])
    dashboard.value = dash.data.data
    weekAmount.value = week.data.data.totalAmount || 0
    monthAmount.value = month.data.data.totalAmount || 0
    recentExpenses.value = expenses.data.data.items
    recentLogs.value = logs.data.data.items
  } catch {
    loadError.value = '数据没查出来，刷新试试'
  }
})

function exportThisMonth() {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const end = now.toISOString().slice(0, 10)
  router.push({ path: '/expense/export', query: { startDate: start, endDate: end } })
}
</script>

<template>
  <div class="home-page page-enter" data-testid="home-page">
    <PageHero title="今天店里情况" subtitle="一眼看清今天花了多少、卖了多少、大概赚了多少" test-id="home-hero" />
    <div class="show-mobile-only home-page__worker">
      <WorkerStatus :status="auth.workerStatus" compact />
    </div>

    <p v-if="loadError" class="home-page__error">{{ loadError }}</p>

    <LuxuryCard dark :stagger="0" padding="18px 16px 16px">
      <div class="section-title">今日简况</div>
      <div class="home-page__today-grid">
        <MoneyCard label="今天花了多少钱" :value="dashboard?.todayExpenseAmount ?? 0" :stagger="1" />
        <MoneyCard label="今天卖了多少钱" :value="dashboard?.todaySaleAmount ?? 0" :stagger="2" />
        <MoneyCard label="今天大概赚了多少" :value="dashboard?.todayProfit ?? 0" :stagger="3" />
        <div class="home-page__pending" @click="router.push('/reimbursements')">
          <MoneyCard
            label="还有多少没报销"
            :value="dashboard?.pendingReimbursementAmount ?? 0"
            :sub="`${dashboard?.pendingReimbursementCount ?? 0} 笔待处理`"
            highlight
            :stagger="4"
          />
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="2" padding="16px">
      <div class="home-page__period-grid">
        <MoneyCard label="本周支出" :value="weekAmount" compact />
        <MoneyCard label="本月支出" :value="monthAmount" compact />
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="5" data-testid="home-quick-actions">
      <div class="section-title">快捷操作</div>
      <div class="home-page__actions">
        <button class="home-page__action" data-testid="home-expense-btn" @click="router.push('/expense/create')">
          <van-icon name="balance-pay" size="22" />
          <span>记一笔</span>
        </button>
        <button class="home-page__action" data-testid="home-scan-btn" @click="router.push('/scan')">
          <van-icon name="scan" size="22" />
          <span>扫码工作台</span>
        </button>
        <button class="home-page__action" @click="router.push('/sales/create')">
          <van-icon name="shopping-cart-o" size="22" />
          <span>销售登记</span>
        </button>
        <button class="home-page__action" @click="router.push('/bracelets')">
          <van-icon name="gem-o" size="22" />
          <span>查镯子</span>
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
.home-page__header { margin-bottom: 4px; }
.home-page__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-main);
}
.home-page__error {
  color: #c45c00;
  font-size: 14px;
  margin: 0 0 12px;
}
.home-page__today-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (min-width: 1200px) {
  .home-page__today-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.home-page__period-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.home-page__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (min-width: 1200px) {
  .home-page__actions {
    grid-template-columns: repeat(6, 1fr);
  }
}
.home-page__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 4px;
  border: var(--border-gold);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.45);
  color: var(--color-jade-deep);
  font-size: 12px;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out);
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
.home-page__pending { cursor: pointer; }
.home-page__expense-row { cursor: pointer; }
</style>
