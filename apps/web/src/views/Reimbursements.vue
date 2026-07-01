<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
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
const { isDesktop } = useBreakpoint()
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<DateRangeState>(parseRouteRange(route.query as Record<string, string>))
const filter = ref({
  expenseType: '',
  businessType: '',
  externalOrderNo: '',
  braceletCode: '',
  customerPaymentStatus: '',
  paySource: '员工垫付',
  reimbursementStatus: 'pending',
  reimbursementPerson: '',
  page: 1,
  pageSize: 30,
})

const businessLabels: Record<string, string> = {
  normal: '普通支出',
  item_cost: '货品成本',
  customer_refund: '客户返款',
  customer_compensation: '客户补偿',
  after_sale_compensation: '售后补偿',
  platform_fee: '平台扣款',
  staff_reimbursement: '员工垫付',
  manual_pending: '待补关联',
}

const statusLabels: Record<string, string> = {
  pending: '未报销',
  reimbursed: '已报销',
  not_required: '不需要报销',
}

function syncRouteQuery() {
  router.replace({
    query: {
      ...toRangeQuery(dateRange.value),
      ...(filter.value.reimbursementStatus ? { reimbursementStatus: filter.value.reimbursementStatus } : {}),
    },
  })
}

function applyDateToFilter() {
  filter.value.page = 1
}

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('startDate', dateRange.value.startDate)
    params.set('endDate', dateRange.value.endDate)
    Object.entries(filter.value).forEach(([k, v]) => {
      if (v) params.set(k, String(v))
    })
    const res = await api.get(`/expenses?${params}`)
    items.value = res.data.data.items
    total.value = res.data.data.total
  } catch {
    showToast('数据没查出来，刷新试试')
  } finally {
    loading.value = false
  }
}

function onRangeChange() {
  syncRouteQuery()
  applyDateToFilter()
  load()
}

watch(
  () => [route.query.range, route.query.startDate, route.query.endDate],
  () => {
    dateRange.value = parseRouteRange(route.query as Record<string, string>)
  },
)

watch(filter, load, { deep: true })

onMounted(() => {
  syncRouteQuery()
  load()
})
</script>

<template>
  <AppShell title="报销列表" :show-back="!isDesktop" data-testid="reimbursements-page" @back="router.back()">
    <PageHero
      title="员工垫付报销"
      subtitle="这段时间员工垫付了多少，一眼看清。"
      test-id="reimburse-hero"
    />

    <div data-testid="reimburse-date-range">
      <DateRangePicker v-model="dateRange" @change="onRangeChange" />
    </div>

    <LuxuryCard>
      <div class="reimburse__range-hint muted">{{ rangeLabel(dateRange) }} · 共 {{ total }} 笔</div>
      <div class="filter-grid">
        <van-field v-model="filter.businessType" label="业务类型" placeholder="选填" />
        <van-field v-model="filter.externalOrderNo" label="小红书订单号" />
        <van-field v-model="filter.braceletCode" label="货品编号" />
        <van-field v-model="filter.reimbursementPerson" label="经手人" />
        <van-field v-model="filter.reimbursementStatus" label="报销状态" placeholder="未报销/已报销" />
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <table v-if="isDesktop && items.length" class="data-table" data-testid="expense-list-table">
        <thead>
          <tr>
            <th>业务类型</th>
            <th>小红书订单号</th>
            <th>货品编号</th>
            <th>日期</th>
            <th>金额</th>
            <th>经手人</th>
            <th>报销</th>
            <th>凭证</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="router.push(`/expense/${item.id}`)">
            <td>{{ businessLabels[item.businessType] || item.businessType || '-' }}</td>
            <td>{{ item.externalOrderNo || '-' }}</td>
            <td>{{ item.braceletCode || '-' }}</td>
            <td>{{ item.occurredAt?.slice(0, 10) }}</td>
            <td class="money">¥{{ Number(item.amount).toFixed(2) }}</td>
            <td>{{ item.reimbursementPerson || '-' }}</td>
            <td>{{ statusLabels[item.reimbursementStatus] || item.reimbursementStatus }}</td>
            <td>{{ item.attachments?.length ? '有' : '无' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="list-card" data-testid="reimburse-list-cards">
        <div v-for="item in items" :key="item.id" class="list-card__item" @click="router.push(`/expense/${item.id}`)">
          <div>{{ item.occurredAt?.slice(0, 10) }} · {{ businessLabels[item.businessType] || item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }}</div>
          <div class="muted">{{ item.reimbursementPerson || '未填经手人' }} · {{ statusLabels[item.reimbursementStatus] || item.reimbursementStatus }}</div>
        </div>
      </div>
      <div v-if="!items.length && !loading" class="muted">这段时间还没有待报销记录。</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.reimbursements-page,
:deep(.app-shell__body) {
  overflow-x: hidden;
  max-width: 100%;
}
.reimburse__range-hint {
  margin-bottom: 12px;
  font-size: 13px;
}
.filter-grid {
  display: grid;
  gap: 0;
}
@media (min-width: 1200px) {
  .filter-grid { grid-template-columns: 1fr 1fr; }
}
</style>
