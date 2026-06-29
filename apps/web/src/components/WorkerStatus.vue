<script setup lang="ts">
import StatusPill from './StatusPill.vue'

defineProps<{
  online: boolean
  compact?: boolean
}>()
</script>

<template>
  <div class="worker-status" :class="{ 'worker-status--offline': !online, 'worker-status--compact': compact }">
    <StatusPill :type="online ? 'success' : 'warning'" dot>
      {{ online ? '本地电脑已连接' : '本地电脑未连接，图片和扫码数据暂不可用' }}
    </StatusPill>
  </div>
</template>

<style scoped>
.worker-status {
  margin-bottom: 14px;
}
.worker-status--compact :deep(.status-pill) {
  font-size: 11px;
  padding: 3px 8px;
}
</style>
