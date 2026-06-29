<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const items = ref<any[]>([])

onMounted(async () => {
  const res = await api.get('/sales?pageSize=50')
  items.value = res.data.data.items
})
</script>

<template>
  <div class="page">
    <van-nav-bar title="销售记录">
      <template #right>
        <van-button size="small" type="primary" @click="router.push('/sales/create')">登记销售</van-button>
      </template>
    </van-nav-bar>
    <div class="card">
      <div v-for="item in items" :key="item.id" class="list-item" @click="router.push(`/sales/${item.id}`)">
        <div>{{ item.braceletCode }} · ¥{{ Number(item.saleAmount).toFixed(2) }}</div>
        <div class="muted">{{ item.platform }} · {{ item.customerName || '-' }} · {{ item.status }}</div>
      </div>
      <div v-if="!items.length" class="muted">暂无销售记录</div>
    </div>
  </div>
</template>
