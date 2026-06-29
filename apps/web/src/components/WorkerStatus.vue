<script setup lang="ts">
import StatusPill from './StatusPill.vue'

defineProps<{
  online: boolean
  compact?: boolean
}>()
</script>

<template>
  <div
    class="worker-status"
    :class="{ 'worker-status--offline': !online, 'worker-status--compact': compact }"
  >
    <StatusPill :type="online ? 'success' : 'warning'" dot>
      {{ online ? '本地电脑已连接，图片和扫码枪可用' : '本地电脑未连接，暂时不能查看图片或同步镯子' }}
    </StatusPill>
    <p v-if="!online && !compact" class="worker-status__hint muted">
      记账、统计等功能仍可使用；图片上传/导出需等本地电脑上线。
    </p>
  </div>
</template>

<style scoped>
.worker-status {
  margin-bottom: 14px;
}
.worker-status--compact {
  margin-bottom: 8px;
}
.worker-status--compact :deep(.status-pill) {
  font-size: 11px;
  padding: 4px 10px;
  line-height: 1.35;
}
.worker-status__hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
}
</style>
