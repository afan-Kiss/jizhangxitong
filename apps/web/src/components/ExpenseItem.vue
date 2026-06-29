<script setup lang="ts">
defineProps<{
  type: string
  amount: number
  person?: string
  paySource?: string
  braceletCode?: string
  imageCount?: number
  occurredAt?: string
  isTrialRun?: boolean
}>()
</script>

<template>
  <div class="expense-item">
    <div class="expense-item__main">
      <div class="expense-item__type">
        {{ type }}
        <span v-if="isTrialRun" class="trial-tag">试用</span>
      </div>
      <div class="expense-item__amount money">¥{{ amount.toFixed(2) }}</div>
    </div>
    <div class="expense-item__meta muted">
      <span v-if="person">{{ person }}</span>
      <span v-if="paySource"> · {{ paySource }}</span>
      <span v-if="braceletCode"> · {{ braceletCode }}</span>
      <span v-if="imageCount !== undefined"> · {{ imageCount }} 张凭证</span>
    </div>
    <div v-if="occurredAt" class="expense-item__date muted">{{ occurredAt.slice(0, 10) }}</div>
  </div>
</template>

<style scoped>
.expense-item {
  padding: 14px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.1);
}
.expense-item:last-child { border-bottom: none; }
.expense-item__main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.expense-item__type {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-main);
  display: flex; align-items: center; gap: 6px;
}
.trial-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(237, 108, 2, 0.15); color: #ed6c02; font-weight: 500;
}
.expense-item__amount {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-jade-deep);
  flex-shrink: 0;
}
.expense-item__meta { margin-top: 4px; }
.expense-item__date { margin-top: 2px; font-size: 11px; }
</style>
