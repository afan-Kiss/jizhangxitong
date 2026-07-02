<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast } from 'vant'
import api, { fileViewUrl, withBase } from '../api'
import AppShell from '../components/AppShell.vue'
import DateRangePicker from '../components/DateRangePicker.vue'
import ImagePreviewModal from '../components/ImagePreviewModal.vue'
import FinanceReportModal from '../components/report-center/FinanceReportModal.vue'
import ExpenseReportTable from '../components/report-center/ExpenseReportTable.vue'
import ExpenseReportMobileList from '../components/report-center/ExpenseReportMobileList.vue'
import { useBreakpoint } from '../composables/useBreakpoint'
import {
  parseRouteRange,
  rangeLabel,
  toRangeQuery,
  type DateRangeState,
} from '../utils/date-range'

const router = useRouter()
const route = useRoute()
const { isDesktop } = useBreakpoint()

const dateRange = ref<DateRangeState>(parseRouteRange(route.query as Record<string, string>))
const summary = ref<any>(null)
const items = ref<any[]>([])
const total = ref(0)
const loadError = ref('')
const loading = ref(false)
const modalOpen = ref(false)
const lastShareUrl = ref('')
const searchQ = ref(String(route.query.q || ''))
const filterStatus = ref(String(route.query.reimbursementStatus || ''))
const filterType = ref(String(route.query.expenseType || ''))
const filterOperator = ref(String(route.query.operator || ''))
const filterPaySource = ref(String(route.query.paySource || ''))
const sortKey = ref<'occurredAt' | 'amount'>('occurredAt')
const sortDir = ref<'asc' | 'desc'>('desc')
const previewOpen = ref(false)
const previewImages = ref<string[]>([])

const activeKpi = computed(() => String(route.query.filter || ''))

const sortedItems = computed(() => {
  const list = [...items.value]
  list.sort((a, b) => {
    let cmp = 0
    if (sortKey.value === 'amount') {
      cmp = Number(a.amount) - Number(b.amount)
    } else {
      cmp = String(a.occurredAt).localeCompare(String(b.occurredAt))
    }
    return sortDir.value === 'asc' ? cmp : -cmp
  })
  return list
})

function syncRouteQuery(extra: Record<string, string | undefined> = {}) {
  const q: Record<string, string> = { ...toRangeQuery(dateRange.value) }
  if (searchQ.value.trim()) q.q = searchQ.value.trim()
  if (filterStatus.value) q.reimbursementStatus = filterStatus.value
  if (filterType.value) q.expenseType = filterType.value
  if (filterOperator.value) q.operator = filterOperator.value
  if (filterPaySource.value) q.paySource = filterPaySource.value
  if (activeKpi.value) q.filter = activeKpi.value
  Object.assign(q, Object.fromEntries(Object.entries(extra).filter(([, v]) => v)))
  router.replace({ query: q })
}

function listParams() {
  const { startDate, endDate } = dateRange.value
  const params: Record<string, string | number> = {
    startDate,
    endDate,
    pageSize: 200,
    page: 1,
  }
  if (searchQ.value.trim()) params.q = searchQ.value.trim()
  if (filterStatus.value) params.reimbursementStatus = filterStatus.value
  if (filterType.value) params.expenseType = filterType.value
  if (filterOperator.value) params.operator = filterOperator.value
  if (filterPaySource.value) params.paySource = filterPaySource.value

  const f = activeKpi.value
  if (f === 'missing-attachment') params.needsAttachment = 1
  if (f === 'pending-reimbursement') params.reimbursementStatus = 'pending_report'
  if (f === 'reimbursed') params.reimbursementStatus = 'reimbursed'
  if (f === 'linked') params.linkedOnly = 1
  return params
}

async function load() {
  loading.value = true
  loadError.value = ''
  const { startDate, endDate } = dateRange.value
  try {
    const [sumRes, listRes] = await Promise.all([
      api.get('/expenses/summary', { params: { period: 'custom', startDate, endDate } }),
      api.get('/expenses', { params: listParams() }),
    ])
    summary.value = sumRes.data.data
    items.value = listRes.data.data.items
    total.value = listRes.data.data.total
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

function setKpiFilter(filter: string) {
  syncRouteQuery({ filter: filter || undefined })
  load()
}

function applyTypeFilter(name: string) {
  filterType.value = filterType.value === name ? '' : name
  syncRouteQuery()
  load()
}

function applyOperatorFilter(name: string) {
  filterOperator.value = filterOperator.value === name ? '' : name
  syncRouteQuery({ operator: filterOperator.value || undefined })
  load()
}

function applyPaySourceFilter(name: string) {
  filterPaySource.value = filterPaySource.value === name ? '' : name
  syncRouteQuery({ paySource: filterPaySource.value || undefined })
  load()
}

function toggleSort(key: 'occurredAt' | 'amount') {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

function exportExcel() {
  const { startDate, endDate } = dateRange.value
  const q = new URLSearchParams({ startDate, endDate, format: 'xlsx', title: '项目资金报账单' })
  const token = localStorage.getItem('token')
  const url = withBase(`/api/finance/export?${q.toString()}`)
  if (!token) {
    window.open(url, '_blank')
    return
  }
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `项目资金报账_${startDate}_${endDate}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    })
    .catch(() => showToast('导出失败'))
}

async function copyShareLink() {
  if (lastShareUrl.value) {
    modalOpen.value = true
    return
  }
  modalOpen.value = true
}

function printPage() {
  window.print()
}

function onShared(url: string) {
  lastShareUrl.value = url
}

async function previewVouchers(item: any) {
  const urls: string[] = []
  for (const att of item.attachments || []) {
    try {
      urls.push(await fileViewUrl(att.fileId))
    } catch { /* skip */ }
  }
  if (!urls.length) {
    showToast('凭证暂时打不开')
    return
  }
  previewImages.value = urls
  previewOpen.value = true
}

const typeRows = computed(() => {
  if (!summary.value?.byType) return []
  const total = summary.value.totalAmount || 0
  return Object.entries(summary.value.byType).map(([name, amount]) => ({
    name,
    amount: Number(amount),
    count: summary.value.byTypeCount?.[name] || 0,
    ratio: total > 0 ? Number(amount) / total : 0,
  }))
})

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
  <AppShell no-tab-pad>
    <div class="report-center" data-testid="expense-stats-page">
      <header class="rc-header">
        <div class="rc-header__text">
          <h1 class="rc-title">项目资金报账中心</h1>
          <p class="rc-subtitle">记录、统计、生成报账表、发给财务</p>
          <p class="rc-range">{{ rangeLabel(dateRange) }}</p>
        </div>
        <div class="rc-header__actions">
          <button type="button" class="rc-btn rc-btn--gold" data-testid="btn-finance-report" @click="modalOpen = true">
            生成报账表
          </button>
          <button type="button" class="rc-btn" @click="exportExcel">导出 Excel</button>
          <button type="button" class="rc-btn" @click="copyShareLink">复制财务外链</button>
          <button type="button" class="rc-btn rc-btn--plain" @click="printPage">打印</button>
        </div>
      </header>

      <div class="rc-date" data-testid="expense-stats-date-range">
        <DateRangePicker v-model="dateRange" theme="light" @change="onRangeChange" />
      </div>

      <p v-if="loadError" class="rc-error">{{ loadError }}</p>
      <p v-else-if="loading && !summary" class="rc-muted">加载中…</p>

      <section v-if="summary" class="rc-kpis" data-testid="expense-stats-summary">
        <button
          type="button"
          class="rc-kpi"
          :class="{ 'rc-kpi--active': activeKpi === '' }"
          @click="setKpiFilter('')"
        >
          <div class="rc-kpi__label">本期支出总额</div>
          <div class="rc-kpi__value">¥{{ summary.totalAmount?.toFixed(2) }}</div>
        </button>
        <button type="button" class="rc-kpi" @click="setKpiFilter('')">
          <div class="rc-kpi__label">支出笔数</div>
          <div class="rc-kpi__value">{{ summary.totalCount }} 笔</div>
        </button>
        <button
          type="button"
          class="rc-kpi"
          :class="{ 'rc-kpi--active': activeKpi === 'missing-attachment' }"
          @click="setKpiFilter('missing-attachment')"
        >
          <div class="rc-kpi__label">待补凭证</div>
          <div class="rc-kpi__value">{{ summary.needsAttachmentCount ?? 0 }} 笔</div>
        </button>
        <button
          type="button"
          class="rc-kpi"
          :class="{ 'rc-kpi--active': activeKpi === 'pending-reimbursement' }"
          @click="setKpiFilter('pending-reimbursement')"
        >
          <div class="rc-kpi__label">待报账金额</div>
          <div class="rc-kpi__value">¥{{ Number(summary.pendingReimbursementAmount || 0).toFixed(2) }}</div>
        </button>
        <button
          type="button"
          class="rc-kpi"
          :class="{ 'rc-kpi--active': activeKpi === 'reimbursed' }"
          @click="setKpiFilter('reimbursed')"
        >
          <div class="rc-kpi__label">已报账金额</div>
          <div class="rc-kpi__value">¥{{ Number(summary.reimbursedAmount || 0).toFixed(2) }}</div>
        </button>
        <button
          type="button"
          class="rc-kpi"
          :class="{ 'rc-kpi--active': activeKpi === 'linked' }"
          @click="setKpiFilter('linked')"
        >
          <div class="rc-kpi__label">已关联订单/货品</div>
          <div class="rc-kpi__value">{{ summary.linkedCount ?? 0 }} 笔</div>
        </button>
      </section>
      <p v-if="summary" class="rc-kpi-note">
        待报账 / 已报账金额仅统计状态为「待报账」「已提交」「已报账」的支出；新建支出默认为「不报账」，需手动标记后才会进入报账池。
      </p>

      <section v-if="summary" class="rc-summary-grid">
        <div class="rc-card rc-card--wide">
          <h3 class="rc-card__title">按支出分类</h3>
          <div v-for="row in typeRows" :key="row.name" class="rc-bar-row">
            <button type="button" class="rc-bar-label" @click="applyTypeFilter(row.name)">{{ row.name }}</button>
            <div class="rc-bar-track">
              <div class="rc-bar-fill" :style="{ width: `${Math.round(row.ratio * 100)}%` }" />
            </div>
            <span class="rc-bar-amount">¥{{ row.amount.toFixed(2) }}</span>
            <span class="rc-bar-pct">{{ (row.ratio * 100).toFixed(1) }}%</span>
          </div>
        </div>
        <div class="rc-card">
          <h3 class="rc-card__title">按经手人</h3>
          <button
            v-for="(val, key) in summary.byOperator"
            :key="key"
            type="button"
            class="rc-mini-row"
            @click="applyOperatorFilter(String(key))"
          >
            <span>{{ key }}</span>
            <span class="rc-mini-amount">¥{{ Number(val).toFixed(2) }}</span>
          </button>
        </div>
        <div class="rc-card">
          <h3 class="rc-card__title">按付款来源</h3>
          <button
            v-for="(val, key) in summary.byPaySource"
            :key="key"
            type="button"
            class="rc-mini-row"
            @click="applyPaySourceFilter(String(key))"
          >
            <span>{{ key }}</span>
            <span class="rc-mini-amount">¥{{ Number(val).toFixed(2) }}</span>
          </button>
        </div>
      </section>

      <section class="rc-detail">
        <div class="rc-detail__toolbar">
          <h3 class="rc-card__title">支出明细（{{ total }} 笔）</h3>
          <input
            v-model="searchQ"
            class="rc-search"
            type="search"
            placeholder="搜索分类、经手人、备注、订单号…"
            @keyup.enter="syncRouteQuery(); load()"
          />
          <select v-model="filterStatus" class="rc-select" @change="syncRouteQuery(); load()">
            <option value="">全部报账状态</option>
            <option value="pending">待报账</option>
            <option value="submitted">已提交</option>
            <option value="reimbursed">已报账</option>
            <option value="rejected">已打回</option>
            <option value="none">不报账</option>
          </select>
        </div>

        <ExpenseReportTable
          v-if="isDesktop"
          :items="sortedItems"
          :sort-key="sortKey"
          :sort-dir="sortDir"
          @sort="toggleSort"
          @view="(id) => router.push(`/expense/${id}`)"
          @preview="previewVouchers"
        />
        <ExpenseReportMobileList
          v-else
          :items="sortedItems"
          @open="(id) => router.push(`/expense/${id}`)"
        />
      </section>

      <FinanceReportModal
        v-model:open="modalOpen"
        :start-date="dateRange.startDate"
        :end-date="dateRange.endDate"
        :share-url="lastShareUrl"
        @shared="onShared"
      />

      <ImagePreviewModal
        v-model:open="previewOpen"
        :images="previewImages"
        alt="凭证图片"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.report-center {
  --rc-bg: transparent;
  --rc-card: #ffffff;
  --rc-text: #1f2933;
  --rc-muted: #667085;
  --rc-gold: #b08d57;
  --rc-border: #e7ddc8;
  min-height: 100%;
  color: var(--rc-text);
}
.rc-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.rc-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--rc-text); }
.rc-subtitle { margin: 4px 0 0; font-size: 14px; color: var(--rc-muted); }
.rc-range { margin: 8px 0 0; font-size: 13px; color: var(--rc-gold); font-weight: 600; }
.rc-header__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.rc-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--rc-border);
  background: var(--rc-card);
  color: var(--rc-text);
  font-size: 13px;
  cursor: pointer;
}
.rc-btn--gold {
  background: linear-gradient(135deg, #c7a45d, var(--rc-gold));
  border-color: var(--rc-gold);
  color: #fff;
}
.rc-btn--plain { background: #f8f7f3; }
.rc-date {
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid var(--rc-border);
  border-radius: 12px;
  padding: 12px;
}
.rc-error { color: #c44; }
.rc-muted { color: var(--rc-muted); }
.rc-kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
@media (min-width: 900px) {
  .rc-kpis { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1200px) {
  .rc-kpis { grid-template-columns: repeat(6, 1fr); }
}
.rc-kpi {
  text-align: left;
  border: 1px solid var(--rc-border);
  border-radius: 12px;
  background: var(--rc-card);
  padding: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(31, 41, 51, 0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rc-kpi--active {
  border-color: var(--rc-gold);
  box-shadow: 0 0 0 2px rgba(176, 141, 87, 0.15);
}
.rc-kpi__label { font-size: 12px; color: var(--rc-muted); }
.rc-kpi__value { font-size: 18px; font-weight: 700; margin-top: 6px; color: var(--rc-gold); }
.rc-kpi-note {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--rc-muted);
}
.rc-summary-grid {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
@media (min-width: 1200px) {
  .rc-summary-grid {
    grid-template-columns: 2fr 1fr 1fr;
    align-items: start;
  }
}
.rc-card {
  background: var(--rc-card);
  border: 1px solid var(--rc-border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(31, 41, 51, 0.04);
}
.rc-card__title { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.rc-bar-row {
  display: grid;
  grid-template-columns: 88px 1fr auto auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
}
.rc-bar-label {
  border: none;
  background: none;
  text-align: left;
  color: var(--rc-text);
  cursor: pointer;
  padding: 0;
}
.rc-bar-track {
  height: 8px;
  background: #f0ebe0;
  border-radius: 999px;
  overflow: hidden;
}
.rc-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #c7a45d, var(--rc-gold));
  border-radius: 999px;
}
.rc-bar-amount { font-weight: 600; color: var(--rc-gold); }
.rc-bar-pct { color: var(--rc-muted); font-size: 12px; min-width: 42px; text-align: right; }
.rc-mini-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: none;
  padding: 8px 0;
  border-bottom: 1px solid #f0ebe0;
  cursor: pointer;
  font-size: 13px;
  color: var(--rc-text);
}
.rc-mini-amount { color: var(--rc-gold); font-weight: 600; }
.rc-detail__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.rc-search, .rc-select {
  min-height: 38px;
  border: 1px solid var(--rc-border);
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: var(--rc-text);
  font-size: 13px;
}
.rc-search { flex: 1; min-width: 180px; }
@media print {
  .rc-header__actions, .rc-date, .rc-detail__toolbar { display: none !important; }
  .report-center { background: #fff; }
}
</style>
