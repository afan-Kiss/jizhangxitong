<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import LuxuryCard from '../components/LuxuryCard.vue'
import { parseRouteRange, rangeLabel, type DateRangeState } from '../utils/date-range'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const data = ref<any>(null)
const searchQ = ref('')
const page = ref(1)
const pageSize = 20

const drillType = computed(() => String(route.query.type || 'sales'))
const dateRange = computed(() => parseRouteRange(route.query as Record<string, string>))
const rangeText = computed(() => rangeLabel(dateRange.value))

const TYPE_TITLES: Record<string, string> = {
  sales: '销售明细',
  expenses: '支出明细',
  profit: '利润明细',
  'customer-payments': '客户返款/补偿明细',
  refunds: '退款明细',
  reimbursements: '待报销明细',
  'effective-sales': '有效成交明细',
  inventory: '在库货品明细',
}

function formatMoney(n: number) {
  return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function moneyClass(kind: 'income' | 'expense' | 'refund' | 'compensation' | 'profit') {
  if (kind === 'income') return 'bi-drill__money--income'
  if (kind === 'expense') return 'bi-drill__money--expense'
  if (kind === 'refund') return 'bi-drill__money--refund'
  if (kind === 'compensation') return 'bi-drill__money--compensation'
  return 'bi-drill__money--profit'
}

async function fetchData(resetPage = false) {
  if (resetPage) page.value = 1
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.get('/bi/drilldown', {
      params: {
        type: drillType.value,
        range: dateRange.value.range,
        startDate: dateRange.value.startDate,
        endDate: dateRange.value.endDate,
        page: page.value,
        pageSize,
        q: searchQ.value.trim() || undefined,
      },
    })
    data.value = res.data.data
  } catch {
    loadError.value = '明细没查出来，刷新试试'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({
    path: '/',
    query: {
      range: dateRange.value.range,
      startDate: dateRange.value.startDate,
      endDate: dateRange.value.endDate,
    },
  })
}

function goDetail(path: string) {
  if (!path) return
  if (path.startsWith('/sales') || path.startsWith('/bracelets')) return
  router.push(path)
}

function onSearch() {
  fetchData(true)
}

function loadMore() {
  if (!data.value?.pagination?.hasMore || loading.value) return
  page.value += 1
  loadMoreAppend()
}

async function loadMoreAppend() {
  loading.value = true
  try {
    const res = await api.get('/bi/drilldown', {
      params: {
        type: drillType.value,
        range: dateRange.value.range,
        startDate: dateRange.value.startDate,
        endDate: dateRange.value.endDate,
        page: page.value,
        pageSize,
        q: searchQ.value.trim() || undefined,
      },
    })
    const next = res.data.data
    if (data.value && next?.items?.length) {
      data.value.items = [...(data.value.items || []), ...next.items]
      data.value.pagination = next.pagination
    }
  } catch {
    page.value -= 1
  } finally {
    loading.value = false
  }
}

watch(
  () => [route.query.type, route.query.range, route.query.startDate, route.query.endDate],
  () => {
    searchQ.value = ''
    fetchData(true)
  },
)

onMounted(() => fetchData(true))
</script>

<template>
  <div class="bi-drill page-enter" data-testid="bi-drilldown-page">
    <header class="bi-drill__top">
      <button type="button" class="bi-drill__back" data-testid="bi-drill-back" @click="goBack">
        ← 返回总览
      </button>
      <h1 class="bi-drill__title">{{ data?.title || TYPE_TITLES[drillType] || '经营明细' }}</h1>
      <p class="bi-drill__range" data-testid="bi-drill-range">{{ rangeText }}</p>
    </header>

    <p v-if="data?.ruleHint" class="bi-drill__hint" data-testid="bi-drill-rule-hint">{{ data.ruleHint }}</p>

    <LuxuryCard v-if="data?.summary" dark padding="14px 14px 12px" :stagger="0">
      <div class="bi-drill__summary-grid">
        <template v-if="drillType === 'profit'">
          <div class="bi-drill__summary-item">
            <span>合计收入</span>
            <strong :class="moneyClass('income')">¥{{ formatMoney(data.summary.totalIncome) }}</strong>
          </div>
          <div class="bi-drill__summary-item">
            <span>合计成本</span>
            <strong :class="moneyClass('expense')">¥{{ formatMoney(data.summary.totalCost) }}</strong>
          </div>
          <div class="bi-drill__summary-item">
            <span>合计退款</span>
            <strong :class="moneyClass('refund')">¥{{ formatMoney(data.summary.totalRefund) }}</strong>
          </div>
          <div class="bi-drill__summary-item">
            <span>合计补偿</span>
            <strong :class="moneyClass('compensation')">¥{{ formatMoney(data.summary.totalCompensation) }}</strong>
          </div>
          <div class="bi-drill__summary-item bi-drill__summary-item--wide">
            <span>净利润</span>
            <strong :class="moneyClass('profit')">¥{{ formatMoney(data.summary.netProfit) }}</strong>
          </div>
        </template>
        <template v-else-if="drillType === 'inventory'">
          <div class="bi-drill__summary-item">
            <span>在库数量</span>
            <strong>{{ data.summary.count }} 件</strong>
          </div>
          <div class="bi-drill__summary-item">
            <span>库存成本</span>
            <strong :class="moneyClass('expense')">¥{{ formatMoney(data.summary.totalCost) }}</strong>
          </div>
        </template>
        <template v-else>
          <div class="bi-drill__summary-item bi-drill__summary-item--wide">
            <span>{{ data.summary.label || '合计金额' }}</span>
            <strong :class="moneyClass(drillType === 'expenses' ? 'expense' : 'income')">
              ¥{{ formatMoney(data.summary.totalAmount ?? data.summary.totalCost ?? 0) }}
            </strong>
          </div>
          <div class="bi-drill__summary-item">
            <span>笔数</span>
            <strong>{{ data.summary.count ?? 0 }}</strong>
          </div>
        </template>
      </div>

      <div v-if="data.summary.byBusinessType" class="bi-drill__group-tags">
        <span v-for="(amt, label) in data.summary.byBusinessType" :key="label" class="bi-drill__tag">
          {{ label }} ¥{{ formatMoney(amt as number) }}
        </span>
      </div>
      <div v-if="data.summary.byGroup" class="bi-drill__group-tags">
        <span v-for="(amt, label) in data.summary.byGroup" :key="label" class="bi-drill__tag">
          {{ label }} ¥{{ formatMoney(amt as number) }}
        </span>
      </div>
    </LuxuryCard>

    <div class="bi-drill__search">
      <input
        v-model="searchQ"
        type="search"
        placeholder="搜订单号、货品编号、提交人、备注"
        data-testid="bi-drill-search"
        @keyup.enter="onSearch"
      />
      <button type="button" @click="onSearch">搜索</button>
    </div>

    <p v-if="loadError" class="bi-drill__error">{{ loadError }}</p>
    <p v-else-if="loading && !data?.items?.length" class="bi-drill__loading muted">正在加载...</p>

    <div v-if="!loading && data && !data.items?.length" class="bi-drill__empty" data-testid="bi-drill-empty">
      这段时间还没有这类记录。
    </div>

    <div class="bi-drill__layout">
      <div class="bi-drill__list">
        <!-- 销售 -->
        <template v-if="drillType === 'sales'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.soldAt) }}</span>
              <strong :class="moneyClass('income')">¥{{ formatMoney(item.saleAmount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>订单 {{ item.externalOrderNo || '无' }}</span>
              <span>货品 {{ item.braceletCode }}</span>
            </div>
            <div class="bi-drill__row-meta muted">
              成本 ¥{{ formatMoney(item.cost) }} · 退款 ¥{{ formatMoney(item.refundAmount) }} · 补偿 ¥{{ formatMoney(item.compensationAmount) }} · 利润 ¥{{ formatMoney(item.profit) }}
            </div>
            <div class="bi-drill__row-foot">登记人 {{ item.createdByName }} · 查看详情</div>
          </div>
        </template>

        <!-- 支出 -->
        <template v-else-if="drillType === 'expenses'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.occurredAt) }}</span>
              <strong :class="moneyClass('expense')">¥{{ formatMoney(item.amount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>{{ item.expenseType }}</span>
              <span>{{ item.businessLabel }}</span>
            </div>
            <div class="bi-drill__row-meta muted">
              <span v-if="item.braceletCode">货品 {{ item.braceletCode }}</span>
              <span v-if="item.externalOrderNo">订单 {{ item.externalOrderNo }}</span>
              <span>凭证 {{ item.attachmentCount }} 张</span>
            </div>
            <div class="bi-drill__row-foot">提交人 {{ item.createdByName }} · 查看详情</div>
          </div>
        </template>

        <!-- 利润 -->
        <template v-else-if="drillType === 'profit'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.soldAt) }}</span>
              <strong :class="moneyClass('profit')">¥{{ formatMoney(item.profit) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>订单 {{ item.externalOrderNo || '无' }}</span>
              <span>货品 {{ item.braceletCode }}</span>
            </div>
            <div class="bi-drill__row-meta muted">
              收入 ¥{{ formatMoney(item.income) }} · 成本 ¥{{ formatMoney(item.cost) }} · 退款 ¥{{ formatMoney(item.refund) }} · 补偿 ¥{{ formatMoney(item.compensation) }}
            </div>
            <div class="bi-drill__row-foot muted">订单 {{ item.externalOrderNo || '无' }} · 货品 {{ item.braceletCode }}</div>
          </div>
        </template>

        <!-- 客户返款/补偿 -->
        <template v-else-if="drillType === 'customer-payments'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.occurredAt) }}</span>
              <strong :class="moneyClass('compensation')">¥{{ formatMoney(item.amount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>{{ item.group }}</span>
              <span v-if="item.externalOrderNo">订单 {{ item.externalOrderNo }}</span>
            </div>
            <div v-if="item.remark" class="bi-drill__row-meta muted">{{ item.remark }}</div>
            <div class="bi-drill__row-foot">提交人 {{ item.createdByName }} · 凭证 {{ item.attachmentCount }} 张</div>
          </div>
        </template>

        <!-- 退款 -->
        <template v-else-if="drillType === 'refunds'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.refundedAt) }}</span>
              <strong :class="moneyClass('refund')">¥{{ formatMoney(item.refundAmount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>订单 {{ item.externalOrderNo || '无' }}</span>
              <span>货品 {{ item.braceletCode }}</span>
            </div>
            <div class="bi-drill__row-foot">查看详情</div>
          </div>
        </template>

        <!-- 报销 -->
        <template v-else-if="drillType === 'reimbursements'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.occurredAt) }}</span>
              <strong :class="moneyClass('expense')">¥{{ formatMoney(item.amount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>员工 {{ item.reimbursementPerson || '未填' }}</span>
              <span>{{ item.businessLabel }}</span>
            </div>
            <div class="bi-drill__row-foot">提交人 {{ item.createdByName }} · 凭证 {{ item.attachmentCount }} 张</div>
          </div>
        </template>

        <!-- 有效成交 -->
        <template v-else-if="drillType === 'effective-sales'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ formatTime(item.soldAt) }}</span>
              <strong :class="moneyClass('income')">¥{{ formatMoney(item.effectiveAmount) }}</strong>
            </div>
            <div class="bi-drill__row-meta">
              <span>订单 {{ item.externalOrderNo || '无' }}</span>
              <span>货品 {{ item.braceletCode }}</span>
            </div>
            <div class="bi-drill__row-foot">登记人 {{ item.createdByName }} · 查看详情</div>
          </div>
        </template>

        <!-- 库存 -->
        <template v-else-if="drillType === 'inventory'">
          <div
            v-for="item in data?.items || []"
            :key="item.id"
            class="bi-drill__row"
            data-testid="bi-drill-row"
            @click="goDetail(item.detailPath)"
          >
            <div class="bi-drill__row-head">
              <span>{{ item.code }}</span>
              <strong :class="moneyClass('expense')">¥{{ formatMoney(item.costTotal) }}</strong>
            </div>
            <div class="bi-drill__row-foot">查看详情</div>
          </div>
        </template>

        <button
          v-if="data?.pagination?.hasMore"
          type="button"
          class="bi-drill__more"
          data-testid="bi-drill-load-more"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
      </div>

      <aside v-if="data?.summary && drillType !== 'inventory'" class="bi-drill__aside show-desktop-only">
        <LuxuryCard padding="14px">
          <div class="section-title">摘要</div>
          <p class="muted">当前范围：{{ rangeText }}</p>
          <p v-if="drillType === 'profit'" class="muted">利润口径走系统统一计算，与总览一致。</p>
          <router-link v-if="drillType === 'reimbursements'" to="/expense/export" class="bi-drill__export-link">
            去导出报销表
          </router-link>
        </LuxuryCard>
      </aside>
    </div>

    <LuxuryCard v-if="drillType === 'refunds' && data?.unconfirmed?.length" :stagger="3" padding="14px">
      <div class="section-title">未确认退款</div>
      <p class="muted">这些还没确认，不计入上方合计。</p>
      <div v-for="item in data.unconfirmed" :key="`u-${item.id}`" class="bi-drill__row bi-drill__row--muted">
        <div class="bi-drill__row-head">
          <span>{{ formatTime(item.refundedAt) }} · {{ item.status }}</span>
          <strong :class="moneyClass('refund')">¥{{ formatMoney(item.refundAmount) }}</strong>
        </div>
        <div class="bi-drill__row-meta muted">订单 {{ item.externalOrderNo || '无' }} · 货品 {{ item.braceletCode }}</div>
      </div>
    </LuxuryCard>

    <!-- 桌面表格 -->
    <div class="bi-drill__table-wrap show-desktop-only" data-testid="bi-drill-table">
      <table v-if="data?.items?.length && drillType === 'sales'" class="bi-drill__table">
        <thead>
          <tr>
            <th>销售时间</th><th>订单号</th><th>货品</th><th>金额</th><th>利润</th><th>登记人</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="`t-${item.id}`">
            <td>{{ formatTime(item.soldAt) }}</td>
            <td>{{ item.externalOrderNo || '-' }}</td>
            <td>{{ item.braceletCode }}</td>
            <td :class="moneyClass('income')">¥{{ formatMoney(item.saleAmount) }}</td>
            <td :class="moneyClass('profit')">¥{{ formatMoney(item.profit) }}</td>
            <td>{{ item.createdByName }}</td>
            <td><button type="button" @click="goDetail(item.detailPath)">详情</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.bi-drill {
  overflow-x: hidden;
  max-width: 100%;
}
.bi-drill__top { margin-bottom: 12px; }
.bi-drill__back {
  border: none;
  background: transparent;
  color: var(--color-gold);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}
.bi-drill__title {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--color-text-main);
}
.bi-drill__range {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-sub);
}
.bi-drill__hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(198, 161, 91, 0.08);
  border: 1px solid rgba(198, 161, 91, 0.2);
  font-size: 13px;
  color: var(--color-gold-light);
}
.bi-drill__summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.bi-drill__summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bi-drill__summary-item span { font-size: 12px; color: rgba(248,243,232,0.65); }
.bi-drill__summary-item strong { font-size: 18px; }
.bi-drill__summary-item--wide { grid-column: 1 / -1; }
.bi-drill__group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.bi-drill__tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  color: var(--color-text-light);
}
.bi-drill__search {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.bi-drill__search input {
  flex: 1;
  border: 1px solid rgba(198,161,91,0.25);
  border-radius: 12px;
  background: rgba(255,255,255,0.06);
  color: var(--color-text-main);
  padding: 10px 12px;
  font-size: 14px;
}
.bi-drill__search button {
  border: none;
  border-radius: 12px;
  padding: 0 14px;
  background: rgba(198,161,91,0.2);
  color: var(--color-text-light);
  cursor: pointer;
}
.bi-drill__error { color: var(--color-danger); font-size: 14px; }
.bi-drill__empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--color-text-sub);
  font-size: 14px;
}
.bi-drill__layout {
  display: grid;
  gap: 14px;
}
@media (min-width: 1200px) {
  .bi-drill__layout { grid-template-columns: 1fr 280px; }
}
.bi-drill__row {
  border: var(--border-glass);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: transform var(--duration-fast), border-color var(--duration-fast);
}
@media (hover: hover) {
  .bi-drill__row:hover {
    transform: translateY(-1px);
    border-color: rgba(198,161,91,0.25);
  }
}
.bi-drill__row--muted { cursor: default; opacity: 0.85; }
.bi-drill__row-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}
.bi-drill__row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 12px;
  margin-bottom: 4px;
}
.bi-drill__row-foot {
  font-size: 11px;
  color: var(--color-gold);
  margin-top: 6px;
}
.bi-drill__row-links {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.bi-drill__row-links button {
  border: 1px solid rgba(198,161,91,0.3);
  background: transparent;
  color: var(--color-gold-light);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}
.bi-drill__more {
  width: 100%;
  border: 1px dashed rgba(198,161,91,0.35);
  background: transparent;
  color: var(--color-text-sub);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
}
.bi-drill__money--income { color: var(--color-success); }
.bi-drill__money--expense { color: var(--color-warning); }
.bi-drill__money--refund { color: var(--color-danger); }
.bi-drill__money--compensation { color: #f0a060; }
.bi-drill__money--profit { color: var(--color-gold-light); }
.bi-drill__export-link {
  display: inline-block;
  margin-top: 10px;
  color: var(--color-gold);
  font-size: 13px;
}
.bi-drill__table-wrap { display: none; }
@media (min-width: 1200px) {
  .bi-drill__list { display: none; }
  .bi-drill__table-wrap { display: block; overflow-x: auto; margin-top: 12px; }
}
.bi-drill__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.bi-drill__table th,
.bi-drill__table td {
  padding: 10px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  text-align: left;
  white-space: nowrap;
}
.bi-drill__table th { color: var(--color-text-sub); font-weight: 500; }
.bi-drill__table button {
  border: none;
  background: transparent;
  color: var(--color-gold);
  cursor: pointer;
}
</style>
