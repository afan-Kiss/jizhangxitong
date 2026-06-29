<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const items = ref<any[]>([])

onMounted(async () => {
  const res = await api.get('/expenses/pending-reimbursements')
  items.value = res.data.data
})

async function markReimbursed(id: number) {
  await api.patch(`/expenses/${id}/reimbursement-status`, { status: 'reimbursed' })
  showToast('已标记报销')
  const res = await api.get('/expenses/pending-reimbursements')
  items.value = res.data.data
}
</script>

<template>
  <AppShell title="未报销列表" :show-back="!isDesktop" @back="router.back()">
    <LuxuryCard>
      <div v-if="!items.length" class="muted">暂无未报销记录</div>

      <table v-else-if="isDesktop" class="data-table" data-testid="reimburse-table">
        <thead>
          <tr>
            <th>报销人</th>
            <th>类型</th>
            <th>金额</th>
            <th>日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="router.push(`/expense/${item.id}`)">
            <td>{{ item.reimbursementPerson || '-' }}</td>
            <td>{{ item.expenseType }}</td>
            <td class="money">¥{{ Number(item.amount).toFixed(2) }}</td>
            <td>{{ item.occurredAt?.slice(0, 10) || '-' }}</td>
            <td @click.stop>
              <van-button size="small" type="primary" @click="markReimbursed(item.id)">标记已报销</van-button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="list-card">
        <div v-for="item in items" :key="item.id" class="list-card__item">
          <div @click="router.push(`/expense/${item.id}`)">
            {{ item.reimbursementPerson || '-' }} · {{ item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }}
          </div>
          <van-button size="mini" type="primary" @click="markReimbursed(item.id)">标记已报销</van-button>
        </div>
      </div>
    </LuxuryCard>
  </AppShell>
</template>
