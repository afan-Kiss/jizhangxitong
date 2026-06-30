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
        }"
        :style="{ animationDelay: `${i * 40}ms` }"
      >
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
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-main);
}
.profit-panel__waterfall {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.profit-panel__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(198, 161, 91, 0.1);
  animation: card-stagger var(--duration-normal) var(--ease-out) both;
}
.profit-panel__row--deduct {
  color: var(--color-warning);
  background: rgba(201, 130, 43, 0.06);
}
.profit-panel__row--sub {
  font-size: 13px;
  opacity: 0.9;
}
.profit-panel__row--total {
  background: linear-gradient(135deg, rgba(31, 77, 58, 0.12) 0%, rgba(198, 161, 91, 0.12) 100%);
  border: var(--border-gold);
  font-weight: 600;
  font-size: 16px;
}
.profit-panel__row--highlight .profit-panel__amount {
  color: var(--color-gold);
}
.profit-panel__label {
  font-size: 14px;
  color: var(--color-text-sub);
}
.profit-panel__row--total .profit-panel__label {
  color: var(--color-text-main);
}
.profit-panel__amount {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-jade-deep);
}
.profit-panel__row--total .profit-panel__amount {
  font-size: 18px;
  color: var(--color-jade-deep);
}
.profit-panel__final {
  font-size: 13px;
  color: var(--color-success);
  text-align: center;
  padding: 6px;
}
.profit-panel__final--loss {
  color: var(--color-danger);
}
@media (prefers-reduced-motion: reduce) {
  .profit-panel__row { animation: none; }
}
</style>
