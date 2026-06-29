<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const logs = ref<any[]>([])

onMounted(async () => {
  const res = await api.get('/operation-logs?pageSize=50')
  logs.value = res.data.data.items
})
</script>

<template>
  <div class="page">
    <van-nav-bar title="操作日志" left-arrow @click-left="router.back()" />
    <div class="card">
      <div v-for="log in logs" :key="log.id" class="list-item">
        <div>{{ log.operatorName }} · {{ log.module }} · {{ log.action }}</div>
        <div class="muted">{{ log.targetCode || log.targetType }} · {{ new Date(log.createdAt).toLocaleString() }}</div>
      </div>
    </div>
  </div>
</template>
