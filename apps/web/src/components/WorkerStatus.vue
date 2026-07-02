<script setup lang="ts">
import { computed } from 'vue'
import StatusPill from './StatusPill.vue'

export type WorkerStatusView = {
  online?: boolean
  workerOnline?: boolean
  socketOpen?: boolean
  uploadChannelReady?: boolean
  scanChannelReady?: boolean
  reason?: string
  message?: string
}

const props = defineProps<{
  online?: boolean
  status?: WorkerStatusView | null
  compact?: boolean
}>()

const status = computed(() => props.status || {})
const displayMessage = computed(() => {
  if (status.value.message) return status.value.message
  if (status.value.uploadChannelReady) {
    return '公司电脑已连接，图片可正常上传。'
  }
  if (status.value.socketOpen && !status.value.uploadChannelReady) {
    return '公司电脑已连接，但图片上传通道异常，请重启本地 Worker 窗口。'
  }
  return '公司电脑本地 Worker 未连接，图片暂无法上传。你仍可以先手动记账。'
})

const pillType = computed(() => {
  if (status.value.uploadChannelReady) return 'success'
  if (status.value.socketOpen) return 'warning'
  return 'warning'
})

const fullyReady = computed(() => Boolean(status.value.uploadChannelReady))
</script>

<template>
  <div
    class="worker-status"
    :class="{ 'worker-status--offline': !fullyReady, 'worker-status--compact': compact }"
    data-testid="worker-status"
  >
    <div class="worker-status__title muted" v-if="!compact">本地 Worker 状态</div>
    <StatusPill :type="pillType" dot>
      {{ displayMessage }}
    </StatusPill>
    <p v-if="!fullyReady && !compact" class="worker-status__hint muted">
      普通记账、统计仍可使用；需要上传报销截图时，请在公司电脑打开「一键启动本地Worker.bat」。
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
