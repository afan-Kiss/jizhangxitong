<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const filter = ref({
  startDate: '',
  endDate: '',
  expenseType: '',
  paySource: '',
  reimbursementStatus: '',
  reimbursementPerson: '',
  page: 1,
  pageSize: 30,
})

const statusLabels: Record<string, string> = {
  pending: '未报销',
  reimbursed: '已报销',
  not_required: '不需要报销',
}

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
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

onMounted(load)
watch(filter, load, { deep: true })
</script>

<template>
  <AppShell title="支出列表" :show-back="!isDesktop" @back="router.back()">
    <LuxuryCard>
      <div class="section-title">筛选</div>
      <div class="filter-grid">
        <van-field v-model="filter.startDate" label="开始日期" type="date" />
        <van-field v-model="filter.endDate" label="结束日期" type="date" />
        <van-field v-model="filter.expenseType" label="分类" placeholder="全部" />
        <van-field v-model="filter.paySource" label="账户" placeholder="全部" />
        <van-field v-model="filter.reimbursementStatus" label="报销状态" placeholder="pending/reimbursed" />
        <van-field v-model="filter.reimbursementPerson" label="经手人" />
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <div class="muted">共 {{ total }} 笔</div>
      <table v-if="isDesktop && items.length" class="data-table" data-testid="expense-list-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>金额</th>
            <th>分类</th>
            <th>账户</th>
            <th>经手人</th>
            <th>报销</th>
            <th>凭证</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="router.push(`/expense/${item.id}`)">
            <td>{{ item.occurredAt?.slice(0, 10) }}</td>
            <td class="money">¥{{ Number(item.amount).toFixed(2) }}</td>
            <td>{{ item.expenseType }}</td>
            <td>{{ item.paySource }}</td>
            <td>{{ item.reimbursementPerson || '-' }}</td>
            <td>{{ statusLabels[item.reimbursementStatus] || item.reimbursementStatus }}</td>
            <td>{{ item.attachments?.length ? '有' : '无' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="list-card">
        <div v-for="item in items" :key="item.id" class="list-card__item" @click="router.push(`/expense/${item.id}`)">
          <div>{{ item.occurredAt?.slice(0, 10) }} · {{ item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }}</div>
          <div class="muted">{{ item.paySource }} · {{ statusLabels[item.reimbursementStatus] || item.reimbursementStatus }}</div>
        </div>
      </div>
      <div v-if="!items.length" class="muted">暂无记录</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.filter-grid {
  display: grid;
  gap: 0;
}
@media (min-width: 1200px) {
  .filter-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
