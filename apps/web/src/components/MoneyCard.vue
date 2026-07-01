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
      'money-card--light': light,
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
  border-radius: 16px;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  min-height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.money-card--highlight {
  background:
    radial-gradient(ellipse 90% 70% at 100% 0%, rgba(215, 181, 109, 0.12) 0%, transparent 55%),
    linear-gradient(155deg, rgba(31, 77, 58, 0.35) 0%, rgba(255, 255, 255, 0.05) 100%);
  border-color: rgba(215, 181, 109, 0.28);
}
.money-card--light {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(215, 181, 109, 0.12);
}
.money-card__label {
  font-size: 12px;
  color: rgba(248, 244, 234, 0.72);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.money-card--light .money-card__label {
  color: var(--color-text-sub);
}
.money-card__value {
  font-size: clamp(20px, 5vw, 26px);
  font-weight: 650;
  color: var(--color-text-light);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.money-card--light .money-card__value {
  color: var(--color-text-main);
  font-size: 20px;
}
.money-card__value--gold :deep(.count-up) {
  color: var(--color-gold-light);
  text-shadow: 0 0 24px rgba(215, 181, 109, 0.2);
}
.money-card__sub {
  font-size: 11px;
  color: rgba(248, 244, 234, 0.52);
  margin-top: 6px;
}
.money-card--light .money-card__sub {
  color: var(--color-text-sub);
}
</style>
