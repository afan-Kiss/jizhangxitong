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
  if (status.value.uploadChannelReady && status.value.scanChannelReady) {
    return '公司电脑已连接，扫码枪和图片可正常使用。'
  }
  if (status.value.uploadChannelReady && !status.value.scanChannelReady) {
    return '图片上传可用，扫码枪未连接；可手动输入编号。'
  }
  if (status.value.socketOpen && !status.value.uploadChannelReady) {
    return '公司电脑已连接，但图片上传通道超时，请重启本地助手。'
  }
  return '公司电脑本地助手未连接，图片上传和扫码枪暂不可用。你仍可以先手动记账。'
})

const pillType = computed(() => {
  if (status.value.uploadChannelReady && status.value.scanChannelReady) return 'success'
  if (status.value.uploadChannelReady || status.value.socketOpen) return 'warning'
  return 'warning'
})

const fullyReady = computed(() => Boolean(status.value.uploadChannelReady && status.value.scanChannelReady))
</script>

<template>
  <div
    class="worker-status"
    :class="{ 'worker-status--offline': !fullyReady, 'worker-status--compact': compact }"
    data-testid="worker-status"
  >
    <div class="worker-status__title muted">公司电脑本地助手状态</div>
    <StatusPill :type="pillType" dot>
      {{ displayMessage }}
    </StatusPill>
    <p v-if="!fullyReady && !compact" class="worker-status__hint muted">
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
