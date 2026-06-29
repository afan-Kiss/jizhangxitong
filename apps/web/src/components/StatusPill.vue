<script setup lang="ts">
defineProps<{
  type?: 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'default'
  dot?: boolean
}>()
</script>

<template>
  <span class="status-pill" :class="`status-pill--${type || 'default'}`">
    <span v-if="dot" class="status-pill__dot" />
    <slot />
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}
.status-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill--success { background: rgba(47, 125, 87, 0.12); color: var(--color-success); }
.status-pill--warning { background: rgba(201, 130, 43, 0.12); color: var(--color-warning); }
.status-pill--danger { background: rgba(185, 74, 72, 0.1); color: var(--color-danger); }
.status-pill--info { background: rgba(62, 108, 140, 0.12); color: var(--color-info); }
.status-pill--gold { background: rgba(198, 161, 91, 0.15); color: var(--color-gold); }
.status-pill--default { background: rgba(111, 119, 114, 0.1); color: var(--color-text-sub); }
</style>
