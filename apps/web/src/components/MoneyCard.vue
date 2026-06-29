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
    class="money-card"
    :class="{ 'money-card--highlight': highlight, 'money-card--light': light, 'card-stagger': stagger !== undefined }"
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
  padding: 14px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.money-card--light {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(198, 161, 91, 0.12);
}
.money-card__label {
  font-size: 12px;
  color: rgba(248, 243, 232, 0.72);
  margin-bottom: 6px;
}
.money-card--light .money-card__label {
  color: var(--color-text-sub);
}
.money-card__value {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-light);
  line-height: 1.2;
}
.money-card--light .money-card__value {
  color: var(--color-text-main);
  font-size: 20px;
}
.money-card__value--gold :deep(.count-up) {
  color: var(--color-gold-light);
}
.money-card__sub {
  font-size: 11px;
  color: rgba(248, 243, 232, 0.55);
  margin-top: 4px;
}
.money-card--light .money-card__sub {
  color: var(--color-text-sub);
}
</style>
