<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'

const router = useRouter()
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
  <div class="page">
    <van-nav-bar title="未报销列表" left-arrow @click-left="router.back()" />
    <div class="card">
      <div v-for="item in items" :key="item.id" class="list-item">
        <div @click="router.push(`/expense/${item.id}`)">
          {{ item.reimbursementPerson || '-' }} · {{ item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }}
        </div>
        <van-button size="mini" type="primary" @click="markReimbursed(item.id)">标记已报销</van-button>
      </div>
      <div v-if="!items.length" class="muted">暂无未报销记录</div>
    </div>
  </div>
</template>
