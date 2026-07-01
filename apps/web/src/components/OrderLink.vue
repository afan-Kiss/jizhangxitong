<script setup lang="ts">
import ActionButton from './ActionButton.vue'
import { useQianfan } from '../composables/useQianfan'

defineProps<{
  orderNo?: string | null
  shopKey?: string | null
  compact?: boolean
  hideHint?: boolean
}>()

const { qianfanEnabled, copyOrderNo, openQianfan } = useQianfan()
</script>

<template>
  <div v-if="orderNo?.trim()" class="order-link" data-testid="order-link">
    <div class="order-link__no">{{ orderNo }}</div>
    <div class="order-link__actions">
      <ActionButton
        :size="compact ? 'md' : 'md'"
        variant="secondary"
        data-testid="order-copy-btn"
        @click="copyOrderNo(orderNo)"
      >复制订单号</ActionButton>
      <ActionButton
        v-if="qianfanEnabled"
        variant="secondary"
        data-testid="order-open-qianfan-btn"
        @click="openQianfan(orderNo, shopKey)"
      >千帆订单详情</ActionButton>
    </div>
    <p v-if="!qianfanEnabled && !hideHint" class="order-link__hint muted" data-testid="qianfan-hint">
      千帆 Cookie 未就绪，可先复制订单号去千帆查
    </p>
  </div>
</template>

<style scoped>
.order-link {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.order-link__no {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-gold-light);
  word-break: break-all;
}
.order-link__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.order-link__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
