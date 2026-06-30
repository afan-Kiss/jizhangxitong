<script setup lang="ts">
import { computed } from 'vue'

export interface ProfitRow {
  label: string
  amount: number
  type?: 'base' | 'deduct' | 'total' | 'sub'
  highlight?: boolean
}

const props = defineProps<{
  rows: ProfitRow[]
  title?: string
}>()

const finalRow = computed(() => props.rows.find((r) => r.type === 'total'))
</script>

<template>
  <div class="profit-panel" data-testid="profit-panel">
    <div v-if="title" class="profit-panel__title">{{ title }}</div>
    <div class="profit-panel__waterfall">
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="profit-panel__row"
        :class="{
          'profit-panel__row--deduct': row.type === 'deduct',
          'profit-panel__row--total': row.type === 'total',
          'profit-panel__row--sub': row.type === 'sub',
          'profit-panel__row--highlight': row.highlight,
          'profit-panel__row--first': i === 0,
        }"
        :style="{ animationDelay: `${i * 50}ms` }"
      >
        <span class="profit-panel__connector" v-if="i > 0" aria-hidden="true" />
        <span class="profit-panel__label">{{ row.label }}</span>
        <span class="profit-panel__amount money">
          <template v-if="row.type === 'deduct' && row.amount > 0">−</template>
          ¥{{ Number(row.amount).toFixed(2) }}
        </span>
      </div>
    </div>
    <div v-if="finalRow" class="profit-panel__final" :class="{ 'profit-panel__final--loss': finalRow.amount < 0 }">
      {{ finalRow.amount >= 0 ? '这单还能赚' : '这单目前是亏的' }}
    </div>
  </div>
</template>

<style scoped>
.profit-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.profit-panel__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-light);
}
.profit-panel__waterfall {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}
.profit-panel__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 6px;
  position: relative;
  animation: card-stagger var(--duration-normal) var(--ease-out) both;
  transition: transform var(--duration-fast), border-color var(--duration-fast);
}
@media (hover: hover) {
  .profit-panel__row:hover {
    transform: translateX(2px);
    border-color: rgba(198, 161, 91, 0.18);
  }
}
.profit-panel__row--first {
  margin-top: 0;
}
.profit-panel__connector {
  position: absolute;
  left: 22px;
  top: -7px;
  width: 2px;
  height: 6px;
  background: linear-gradient(180deg, rgba(198, 161, 91, 0.35), rgba(78, 125, 105, 0.25));
  border-radius: 1px;
}
.profit-panel__row--deduct {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.06);
  border-color: rgba(251, 191, 36, 0.12);
}
.profit-panel__row--sub {
  font-size: 13px;
  opacity: 0.92;
  background: rgba(78, 125, 105, 0.08);
}
.profit-panel__row--total {
  background: linear-gradient(135deg, rgba(31, 77, 58, 0.28) 0%, rgba(198, 161, 91, 0.14) 100%);
  border: 1px solid rgba(198, 161, 91, 0.28);
  font-weight: 600;
  font-size: 16px;
  box-shadow: var(--shadow-glow);
  margin-top: 10px;
}
.profit-panel__row--highlight .profit-panel__amount {
  color: var(--color-gold-light);
}
.profit-panel__label {
  font-size: 14px;
  color: var(--color-text-sub);
}
.profit-panel__row--total .profit-panel__label {
  color: var(--color-text-light);
}
.profit-panel__amount {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-success);
}
.profit-panel__row--deduct .profit-panel__amount {
  color: var(--color-warning);
}
.profit-panel__row--total .profit-panel__amount {
  font-size: 20px;
  color: var(--color-gold-light);
}
.profit-panel__final {
  font-size: 13px;
  color: var(--color-success);
  text-align: center;
  padding: 8px;
  border-radius: 10px;
  background: rgba(74, 222, 128, 0.08);
}
.profit-panel__final--loss {
  color: var(--color-danger);
  background: rgba(248, 113, 113, 0.08);
}
@media (prefers-reduced-motion: reduce) {
  .profit-panel__row { animation: none; }
}
</style>
