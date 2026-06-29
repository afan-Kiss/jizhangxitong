<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import LuxuryCard from '../components/LuxuryCard.vue'
import MoneyCard from '../components/MoneyCard.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const auth = useAuthStore()
const todayAmount = ref(0)
const weekAmount = ref(0)
const monthAmount = ref(0)
const pendingAmount = ref(0)
const pendingCount = ref(0)
const recentExpenses = ref<any[]>([])
const recentLogs = ref<any[]>([])
const trialModeEnabled = ref(false)

async function loadTrialStatus() {
  try {
    const res = await api.get('/trial/status')
    trialModeEnabled.value = res.data.data.enabled
  } catch { trialModeEnabled.value = false }
}

function formatLog(log: any): string {
  const name = log.operatorName || '有人'
  const actionMap: Record<string, string> = {
    create_expense: '新增支出',
    update_expense: '修改支出',
    void_expense: '作废支出',
    create_sale: '登记销售',
    sync_bracelet: '同步镯子',
    export_reimbursement_excel: '导出报销表',
    cleanup_trial_data: '清理试用数据',
    promote_trial_to_formal: '试用转正式',
  }
  const action = actionMap[log.action] || log.action
  const code = log.targetCode ? `，${log.targetCode}` : ''
  return `${name}${action}${code}`
}

onMounted(async () => {
  await auth.fetchMe()
  await auth.fetchWorkerStatus()
  await loadTrialStatus()
  const [today, week, month, expenses, logs] = await Promise.all([
    api.get('/expenses/summary?period=today'),
    api.get('/expenses/summary?period=week'),
    api.get('/expenses/summary?period=month'),
    api.get('/expenses?pageSize=5'),
    api.get('/operation-logs?pageSize=5'),
  ])
  todayAmount.value = today.data.data.totalAmount || 0
  weekAmount.value = week.data.data.totalAmount || 0
  monthAmount.value = month.data.data.totalAmount || 0
  pendingAmount.value = today.data.data.pendingAmount || 0
  pendingCount.value = today.data.data.pendingCount || 0
  recentExpenses.value = expenses.data.data.items
  recentLogs.value = logs.data.data.items
})

function exportThisMonth() {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const end = now.toISOString().slice(0, 10)
  router.push({ path: '/expense/export', query: { startDate: start, endDate: end } })
}
</script>

<template>
  <div class="home page-enter">
    <div v-if="trialModeEnabled" class="trial-banner" @click="router.push('/trial-guide')">
      <span class="trial-banner__text">试用模式 · 数据可清理</span>
    </div>
    <header class="home__header">
      <h1 class="home__title">经营总览</h1>
      <WorkerStatus :online="auth.workerOnline" compact />
    </header>

    <LuxuryCard dark :stagger="0" padding="18px 16px 16px">
      <div class="home__cockpit">
        <div class="home__cockpit-grid">
          <MoneyCard label="今日支出" :value="todayAmount" :stagger="1" />
          <MoneyCard label="本周支出" :value="weekAmount" :stagger="2" />
          <MoneyCard label="本月支出" :value="monthAmount" :stagger="3" />
          <div class="home__pending" @click="router.push('/reimbursements')">
            <MoneyCard
              label="未报销"
              :value="pendingAmount"
              :sub="`${pendingCount} 笔待处理`"
              highlight
              :stagger="4"
            />
          </div>
        </div>
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="5">
      <div class="section-title">快捷操作</div>
      <div class="home__actions">
        <button class="home__action" @click="router.push('/expense/create')">
          <van-icon name="balance-pay" size="22" />
          <span>记一笔</span>
        </button>
        <button class="home__action" @click="router.push('/bracelets')">
          <van-icon name="scan" size="22" />
          <span>扫镯子</span>
        </button>
        <button class="home__action" @click="exportThisMonth">
          <van-icon name="down" size="22" />
          <span>导出报销</span>
        </button>
        <button class="home__action" @click="router.push('/sales/create')">
          <van-icon name="shopping-cart-o" size="22" />
          <span>销售登记</span>
        </button>
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="6">
      <div class="section-title">最近支出</div>
      <div v-if="!recentExpenses.length" class="muted">暂无记录</div>
      <div
        v-for="item in recentExpenses"
        :key="item.id"
        class="home__expense-row"
        @click="router.push(`/expense/${item.id}`)"
      >
        <ExpenseItem
          :type="item.expenseType"
          :amount="Number(item.amount)"
          :person="item.reimbursementPerson"
          :pay-source="item.paySource"
          :bracelet-code="item.braceletCode"
          :occurred-at="item.occurredAt"
          :is-trial-run="item.isTrialRun"
        />
      </div>
    </LuxuryCard>

    <LuxuryCard :stagger="7">
      <div class="section-title">最近操作</div>
      <div v-for="log in recentLogs" :key="log.id" class="home__log muted">
        {{ formatLog(log) }}
      </div>
    </LuxuryCard>
  </div>
</template>

<style scoped>
.home {
  padding: 16px 16px 80px;
  min-height: 100vh;
}
.home__header { margin-bottom: 4px; }
.home__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-main);
}
.home__cockpit { position: relative; z-index: 1; }
.home__cockpit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.home__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.home__action {
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
.home__action:active { transform: scale(0.96); }
.home__action :deep(.van-icon) { color: var(--color-gold); }
.home__log {
  padding: 10px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  font-size: 13px;
  line-height: 1.5;
}
.home__log:last-child { border-bottom: none; }
.home__pending { cursor: pointer; }
.home__expense-row { cursor: pointer; }
.trial-banner {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: -4px 0 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(237,108,2,0.1), rgba(198,161,91,0.12));
  border: 1px solid rgba(237,108,2,0.2);
  color: #b85a00;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.trial-banner__text { display: block; }
</style>
