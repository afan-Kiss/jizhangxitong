<script setup lang="ts">
defineProps<{
  dark?: boolean
  gold?: boolean
  padding?: string
  stagger?: number
  clickable?: boolean
  hoverable?: boolean
}>()
</script>

<template>
  <div
    class="luxury-card"
    :class="{
      'luxury-card--gold': gold,
      'luxury-card--clickable': clickable,
      'luxury-card--hoverable': hoverable !== false,
      'card-stagger': stagger !== undefined,
    }"
    :style="{
      padding: padding || undefined,
      animationDelay: stagger !== undefined ? `${stagger * 45}ms` : undefined,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.luxury-card {
  border-radius: var(--radius-card);
  border: 1px solid #e7ddc8;
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 14px;
  background: #fff;
  position: relative;
  transition:
    transform var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out),
    border-color var(--duration-fast);
}
@media (hover: hover) {
  .luxury-card--hoverable:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-card-hover);
    border-color: var(--color-gold-border-hover);
  }
}
.luxury-card--gold {
  border-color: #d4c4a8;
  background: linear-gradient(180deg, #fffdf8 0%, #fff 100%);
}
.luxury-card--clickable {
  cursor: pointer;
}
.luxury-card--clickable:active {
  transform: scale(0.99);
}
</style>
