<script setup lang="ts">
import { computed } from 'vue'
import StatusPill from './StatusPill.vue'

export type WorkerStatusView = {
  online?: boolean
  reason?: string
  message?: string
}

const props = defineProps<{
  online?: boolean
  status?: WorkerStatusView | null
  compact?: boolean
}>()

const isOnline = computed(() => props.status?.online ?? props.online ?? false)
const reason = computed(() => props.status?.reason || '')
const displayMessage = computed(() => {
  if (props.status?.message) return props.status.message
  if (isOnline.value && reason.value === 'SCANNER_API_UNAVAILABLE') {
    return '本地助手在线，但扫码枪接口没开。'
  }
  if (isOnline.value) return '公司电脑已连接，扫码枪和图片可正常使用。'
  return '公司电脑开着，但本地助手没有连上。请在公司电脑运行「一键修复本地Worker连接」。'
})
const pillType = computed(() => {
  if (isOnline.value && reason.value === 'SCANNER_API_UNAVAILABLE') return 'warning'
  return isOnline.value ? 'success' : 'warning'
})
</script>

<template>
  <div
    class="worker-status"
    :class="{ 'worker-status--offline': !isOnline, 'worker-status--compact': compact }"
  >
    <div class="worker-status__title muted">公司电脑本地助手状态</div>
    <StatusPill :type="pillType" dot>
      {{ displayMessage }}
    </StatusPill>
    <p v-if="!isOnline && !compact" class="worker-status__hint muted">
      普通记账、统计仍可使用；需要扫码枪或本地图片时会受影响。
    </p>
  </div>
</template>

<style scoped>
.worker-status {
  margin-bottom: 14px;
}
.worker-status__title {
  font-size: 11px;
  margin-bottom: 4px;
  letter-spacing: 0.04em;
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
