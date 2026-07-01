<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '../api'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'

const logs = ref<any[]>([])

onMounted(async () => {
  const res = await api.get('/operation-logs?pageSize=50')
  logs.value = res.data.data.items
})
</script>

<template>
  <AppShell title="操作日志">
    <LuxuryCard>
      <div v-for="log in logs" :key="log.id" class="log-item">
        <div>{{ log.operatorName }} · {{ log.module }} · {{ log.action }}</div>
        <div class="muted">{{ log.targetCode || log.targetType }} · {{ new Date(log.createdAt).toLocaleString() }}</div>
      </div>
      <div v-if="!logs.length" class="muted">暂无操作记录</div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.log-item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
}
.log-item:last-child {
  border-bottom: none;
}
</style>
