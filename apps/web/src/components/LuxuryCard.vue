<script setup lang="ts">
defineProps<{
  dark?: boolean
  gold?: boolean
  padding?: string
  stagger?: number
  clickable?: boolean
}>()
</script>

<template>
  <div
    class="luxury-card"
    :class="{
      'luxury-card--dark': dark,
      'luxury-card--gold': gold,
      'luxury-card--clickable': clickable,
      'card-stagger': stagger !== undefined,
    }"
    :style="{
      padding: padding || undefined,
      animationDelay: stagger !== undefined ? `${stagger * 40}ms` : undefined,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.luxury-card {
  background: var(--color-card);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-card);
  border: var(--border-gold);
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 14px;
}
.luxury-card--dark {
  background: linear-gradient(145deg, #141C19 0%, #1A2822 45%, #0F1614 100%);
  border-color: rgba(198, 161, 91, 0.22);
  color: var(--color-text-light);
  position: relative;
  overflow: hidden;
}
.luxury-card--dark::before {
  content: '';
  position: absolute;
  top: -40%;
  right: -20%;
  width: 60%;
  height: 80%;
  background: radial-gradient(circle, rgba(78, 125, 105, 0.25) 0%, transparent 70%);
  pointer-events: none;
}
.luxury-card--dark::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 50%;
  height: 60%;
  background: radial-gradient(circle, rgba(198, 161, 91, 0.12) 0%, transparent 65%);
  pointer-events: none;
}
.luxury-card--gold {
  border-color: rgba(198, 161, 91, 0.35);
  box-shadow: var(--shadow-glow);
}
.luxury-card--clickable {
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out);
}
.luxury-card--clickable:active {
  transform: scale(0.985);
}
</style>
