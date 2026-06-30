<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { loadQianfanConfig, useQianfan } from '../composables/useQianfan'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const { qianfanEnabled, openQianfan } = useQianfan()
const items = ref<any[]>([])
const filter = ref({
  startDate: '',
  endDate: '',
  platform: '',
  status: '',
})

const statusLabels: Record<string, string> = {
  sold: '已售',
  refunded: '已退款',
  customer_hold: '留货',
}

async function load() {
  const params = new URLSearchParams({ pageSize: '50' })
  Object.entries(filter.value).forEach(([k, v]) => { if (v) params.set(k, v) })
  const res = await api.get(`/sales?${params}`)
  items.value = res.data.data.items
}

onMounted(async () => {
  await loadQianfanConfig(api)
  load()
})
</script>

<template>
  <AppShell title="销售记录">
    <div v-if="isDesktop" class="sales-list__toolbar">
      <ActionButton @click="router.push('/sales/create')">登记销售</ActionButton>
    </div>

    <LuxuryCard>
      <div class="section-title">筛选</div>
      <div class="filter-row">
        <van-field v-model="filter.startDate" label="开始" type="date" @blur="load" />
        <van-field v-model="filter.endDate" label="结束" type="date" @blur="load" />
        <van-field v-model="filter.platform" label="平台" @blur="load" />
        <van-field v-model="filter.status" label="状态" placeholder="sold/refunded" @blur="load" />
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <div v-if="!isDesktop" class="sales-list__mobile-action">
        <van-button size="small" type="primary" block @click="router.push('/sales/create')">登记销售</van-button>
      </div>

      <table v-if="isDesktop && items.length" class="data-table" data-testid="sales-table">
        <thead>
          <tr>
            <th>小红书订单号</th>
            <th>货品编号</th>
            <th>销售金额</th>
            <th>成本</th>
            <th>毛利</th>
            <th>毛利率</th>
            <th>平台</th>
            <th>状态</th>
            <th>日期</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="router.push(`/sales/${item.id}`)">
            <td>{{ item.externalOrderNo || '-' }}</td>
            <td>{{ item.braceletCode }}</td>
            <td class="money">¥{{ Number(item.saleAmount).toFixed(2) }}</td>
            <td>¥{{ Number(item.cost ?? item.totalCostSnapshot).toFixed(2) }}</td>
            <td class="money">¥{{ Number(item.profit ?? item.grossProfit).toFixed(2) }}</td>
            <td>{{ item.profitMargin ?? '-' }}%</td>
            <td>{{ item.platform }}</td>
            <td>{{ statusLabels[item.status] || item.status }}</td>
            <td>{{ item.soldAt?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="items.length" class="list-card">
        <div v-for="item in items" :key="item.id" class="list-card__item" @click="router.push(`/sales/${item.id}`)">
          <div>{{ item.braceletCode }} · ¥{{ Number(item.saleAmount).toFixed(2) }}</div>
          <div class="muted">毛利 ¥{{ Number(item.profit ?? item.grossProfit).toFixed(2) }} · {{ item.platform }} · {{ item.soldAt?.slice(0, 10) }}</div>
        </div>
      </div>

      <div v-else class="muted">暂无销售记录</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.sales-list__toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.sales-list__mobile-action { margin-bottom: 12px; }
.filter-row { display: grid; gap: 0; }
@media (min-width: 1200px) { .filter-row { grid-template-columns: 1fr 1fr; } }
</style>
