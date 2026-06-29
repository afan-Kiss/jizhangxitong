<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const items = ref<any[]>([])

onMounted(async () => {
  const res = await api.get('/sales?pageSize=50')
  items.value = res.data.data.items
})
</script>

<template>
  <AppShell title="销售记录">
    <div v-if="isDesktop" class="sales-list__toolbar">
      <ActionButton @click="router.push('/sales/create')">登记销售</ActionButton>
    </div>

    <LuxuryCard>
      <div v-if="!isDesktop" class="sales-list__mobile-action">
        <van-button size="small" type="primary" block @click="router.push('/sales/create')">登记销售</van-button>
      </div>

      <table v-if="isDesktop && items.length" class="data-table" data-testid="sales-table">
        <thead>
          <tr>
            <th>镯子编号</th>
            <th>销售金额</th>
            <th>平台</th>
            <th>客户</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" @click="router.push(`/sales/${item.id}`)">
            <td>{{ item.braceletCode }}</td>
            <td class="money">¥{{ Number(item.saleAmount).toFixed(2) }}</td>
            <td>{{ item.platform }}</td>
            <td>{{ item.customerName || '-' }}</td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="items.length" class="list-card">
        <div
          v-for="item in items"
          :key="item.id"
          class="list-card__item"
          @click="router.push(`/sales/${item.id}`)"
        >
          <div>
            <div>{{ item.braceletCode }} · ¥{{ Number(item.saleAmount).toFixed(2) }}</div>
            <div class="muted">{{ item.platform }} · {{ item.customerName || '-' }} · {{ item.status }}</div>
          </div>
        </div>
      </div>

      <div v-else class="muted">暂无销售记录</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.sales-list__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.sales-list__mobile-action {
  margin-bottom: 12px;
}
</style>
