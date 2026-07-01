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
    class="luxury-card glass-surface"
    :class="{
      'luxury-card--dark': dark,
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
    <div class="luxury-card__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.luxury-card {
  border-radius: var(--radius-card);
  border: var(--border-glass);
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 14px;
  position: relative;
  transition:
    transform var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out),
    border-color var(--duration-fast);
}
.luxury-card__content {
  position: relative;
  z-index: 1;
}
@media (hover: hover) {
  .luxury-card--hoverable:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-card-hover), var(--shadow-glow);
    border-color: var(--color-gold-border-hover);
  }
}
.luxury-card--dark {
  background:
    radial-gradient(ellipse 80% 60% at 100% 0%, rgba(90, 143, 120, 0.14) 0%, transparent 55%),
    linear-gradient(155deg, #1a2621 0%, #1f2e28 42%, #141c19 100%);
  border-color: rgba(215, 181, 109, 0.2);
  color: var(--color-text-light);
  overflow: hidden;
}
.luxury-card--dark::before {
  content: '';
  position: absolute;
  top: -40%;
  right: -20%;
  width: 60%;
  height: 80%;
  background: radial-gradient(circle, rgba(90, 143, 120, 0.2) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
.luxury-card--dark::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 50%;
  height: 60%;
  background: radial-gradient(circle, rgba(215, 181, 109, 0.1) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}
.luxury-card--gold {
  border-color: rgba(215, 181, 109, 0.28);
  box-shadow: var(--shadow-card), var(--shadow-glow);
  background:
    linear-gradient(145deg, rgba(215, 181, 109, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
}
.luxury-card--clickable {
  cursor: pointer;
}
.luxury-card--clickable:active {
  transform: scale(0.985);
}
</style>
