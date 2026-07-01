<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** @deprecated use variant="secondary" */
  plain?: boolean
  block?: boolean
  loading?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
}>()

const resolvedVariant = computed(() => props.variant || (props.plain ? 'secondary' : 'primary'))
</script>

<template>
  <button
    class="action-btn"
    :class="[
      `action-btn--${resolvedVariant}`,
      { 'action-btn--block': block, 'action-btn--lg': size === 'lg' },
    ]"
    :disabled="disabled || loading"
    type="button"
  >
    <span v-if="loading" class="action-btn__spinner" />
    <slot />
  </button>
</template>

<style scoped>
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 20px;
  border-radius: var(--radius-btn);
  font-size: 15px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-out),
    opacity var(--duration-fast),
    border-color var(--duration-fast),
    box-shadow var(--duration-normal);
  font-family: inherit;
}
.action-btn--lg { height: 52px; font-size: 16px; }
.action-btn--block { width: 100%; }
.action-btn:active:not(:disabled) { transform: scale(0.97); }
.action-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.action-btn--primary {
  background: linear-gradient(135deg, var(--color-jade-deep) 0%, #2a5a45 55%, rgba(215, 181, 109, 0.75) 130%);
  color: var(--color-text-light);
  box-shadow: 0 8px 24px rgba(31, 77, 58, 0.28);
}
@media (hover: hover) {
  .action-btn--primary:hover:not(:disabled) {
    border-color: var(--color-gold-border-hover);
    box-shadow: 0 8px 28px rgba(31, 77, 58, 0.32), var(--shadow-glow);
    transform: translateY(-1px);
  }
}
.action-btn--secondary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-light);
  border: var(--border-glass);
  backdrop-filter: var(--blur-glass);
}
@media (hover: hover) {
  .action-btn--secondary:hover:not(:disabled),
  .action-btn--ghost:hover:not(:disabled) {
    border-color: var(--color-gold-border-hover);
    box-shadow: var(--shadow-glow);
    transform: translateY(-1px);
  }
}
.action-btn--ghost {
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.action-btn--danger {
  background: rgba(232, 138, 132, 0.08);
  color: var(--color-danger);
  border: 1px solid rgba(232, 138, 132, 0.25);
}
@media (hover: hover) {
  .action-btn--danger:hover:not(:disabled) {
    border-color: rgba(232, 138, 132, 0.45);
    box-shadow: 0 0 16px rgba(232, 138, 132, 0.12);
  }
}

.action-btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(215, 181, 109, 0.2);
  border-top-color: var(--color-gold);
  border-right-color: var(--color-gold-light);
  border-radius: 50%;
  animation: spin-soft 0.7s linear infinite;
}
.action-btn--secondary .action-btn__spinner,
.action-btn--ghost .action-btn__spinner {
  border-color: rgba(31, 77, 58, 0.2);
  border-top-color: var(--color-jade-deep);
}
</style>
