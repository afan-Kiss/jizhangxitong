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
  border: none;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out), opacity var(--duration-fast);
  font-family: inherit;
}
.action-btn--lg { height: 52px; font-size: 16px; }
.action-btn--block { width: 100%; }
.action-btn:active:not(:disabled) { transform: scale(0.97); }
.action-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.action-btn--primary {
  background: linear-gradient(135deg, var(--color-jade-deep) 0%, #2A5A45 55%, rgba(198, 161, 91, 0.85) 130%);
  color: var(--color-text-light);
  box-shadow: 0 8px 20px rgba(31, 77, 58, 0.25);
}
.action-btn--secondary {
  background: var(--color-card);
  color: var(--color-jade-deep);
  border: var(--border-gold);
  backdrop-filter: var(--blur-glass);
}
.action-btn--ghost {
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid rgba(111, 119, 114, 0.2);
}
.action-btn--danger {
  background: rgba(185, 74, 72, 0.08);
  color: var(--color-danger);
  border: 1px solid rgba(185, 74, 72, 0.25);
}

.action-btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin-soft 0.7s linear infinite;
}
.action-btn--secondary .action-btn__spinner,
.action-btn--ghost .action-btn__spinner {
  border-color: rgba(31, 77, 58, 0.2);
  border-top-color: var(--color-jade-deep);
}
</style>
