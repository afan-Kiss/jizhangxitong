<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  testId?: string
}>()
</script>

<template>
  <header class="page-hero" :data-testid="testId || 'page-hero'">
    <div class="page-hero__glow" aria-hidden="true" />
    <div class="page-hero__accent luxury-pulse" aria-hidden="true" />
    <h1 class="page-hero__title">{{ title }}</h1>
    <p v-if="subtitle" class="page-hero__subtitle">{{ subtitle }}</p>
    <slot />
  </header>
</template>

<style scoped>
.page-hero {
  margin-bottom: 18px;
  padding: 4px 0 12px;
  position: relative;
}
.page-hero__glow {
  position: absolute;
  top: -20px;
  left: -8px;
  width: 120px;
  height: 60px;
  background: radial-gradient(ellipse, rgba(215, 181, 109, 0.12) 0%, transparent 70%);
  pointer-events: none;
}
.page-hero__accent {
  width: 42px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--color-jade-soft), var(--color-gold), var(--color-gold-light));
  margin-bottom: 14px;
}
.page-hero__title {
  margin: 0;
  font-size: clamp(22px, 5vw, 30px);
  font-weight: 600;
  color: var(--color-text-champagne);
  letter-spacing: 0.04em;
  line-height: 1.25;
}
.page-hero__subtitle {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--color-text-sub);
  line-height: 1.55;
  max-width: 36em;
}
@media (min-width: 1200px) {
  .page-hero {
    margin-bottom: 22px;
    padding-bottom: 14px;
  }
  .page-hero__title {
    font-size: 32px;
  }
}
</style>
