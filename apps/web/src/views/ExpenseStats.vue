<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const period = ref('today')
const summary = ref<any>(null)
const items = ref<any[]>([])

const periods = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: '15days', label: '近15天' },
  { key: 'month', label: '本月' },
  { key: 'custom', label: '自定义' },
]

async function load() {
  const res = await api.get(`/expenses/summary?period=${period.value}`)
  summary.value = res.data.data
  const list = await api.get(`/expenses?startDate=${summary.value.period.start.slice(0,10)}&endDate=${summary.value.period.end.slice(0,10)}&pageSize=50`)
  items.value = list.data.data.items
}

onMounted(load)
</script>

<template>
  <div class="page">
    <van-nav-bar title="支出统计" left-arrow @click-left="router.back()" />
    <van-tabs v-model:active="period" @change="load">
      <van-tab v-for="p in periods" :key="p.key" :title="p.label" :name="p.key" />
    </van-tabs>

    <div class="card stat-grid" v-if="summary">
      <div class="stat-item">
        <div class="stat-label">支出总额</div>
        <div class="stat-value">¥{{ summary.totalAmount?.toFixed(2) }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">客户补偿</div>
        <div class="stat-value">¥{{ summary.compensationAmount?.toFixed(2) }}</div>
      </div>
    </div>

    <div class="card" v-if="summary">
      <h4>按类型</h4>
      <div v-for="(val, key) in summary.byType" :key="key" class="list-item">
        {{ key }}: ¥{{ Number(val).toFixed(2) }}
      </div>
      <h4>按付款来源</h4>
      <div v-for="(val, key) in summary.byPaySource" :key="key" class="list-item">
        {{ key }}: ¥{{ Number(val).toFixed(2) }}
      </div>
    </div>

    <div class="card">
      <h4>明细列表</h4>
      <div v-for="item in items" :key="item.id" class="list-item" @click="router.push(`/expense/${item.id}`)">
        {{ item.expenseType }} · ¥{{ Number(item.amount).toFixed(2) }} · {{ item.paySource }}
      </div>
    </div>

    <van-button type="primary" block style="margin:16px;" @click="router.push('/expense/export')">导出当前筛选 Excel</van-button>
  </div>
</template>
