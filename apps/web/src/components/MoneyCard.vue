<script setup lang="ts">
import CountUp from './CountUp.vue'

defineProps<{
  label: string
  value: number
  highlight?: boolean
  sub?: string
  light?: boolean
  stagger?: number
}>()
</script>

<template>
  <div
    class="money-card money"
    :class="{
      'money-card--highlight': highlight,
      'card-stagger': stagger !== undefined,
    }"
    :style="{ animationDelay: stagger !== undefined ? `${stagger * 40}ms` : undefined }"
  >
    <div class="money-card__label">{{ label }}</div>
    <div class="money-card__value" :class="{ 'money-card__value--gold': highlight }">
      <CountUp :value="value" :duration="highlight ? 560 : 400" />
    </div>
    <div v-if="sub" class="money-card__sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.money-card {
  padding: 16px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e7ddc8;
  box-shadow: var(--shadow-card);
  min-height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.money-card--highlight {
  background: linear-gradient(180deg, #fffdf8 0%, #fff 100%);
  border-color: #d4c4a8;
}
.money-card__label {
  font-size: 12px;
  color: var(--color-text-sub);
  margin-bottom: 8px;
}
.money-card__value {
  font-size: clamp(20px, 5vw, 26px);
  font-weight: 700;
  color: var(--color-text-main);
  line-height: 1.15;
}
.money-card__value--gold :deep(.count-up) {
  color: var(--color-gold-deep);
}
.money-card__sub {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 6px;
}
</style>
