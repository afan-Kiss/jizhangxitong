<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  testId?: string
}>()
</script>

<template>
  <header class="page-hero" :data-testid="testId || 'page-hero'">
    <div class="page-hero__accent" aria-hidden="true" />
    <h1 class="page-hero__title">{{ title }}</h1>
    <p v-if="subtitle" class="page-hero__subtitle">{{ subtitle }}</p>
    <slot />
  </header>
</template>

<style scoped>
.page-hero {
  margin-bottom: 18px;
  padding: 4px 0 10px;
  position: relative;
}
.page-hero__accent {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--color-jade), var(--color-gold));
  margin-bottom: 12px;
  box-shadow: 0 0 12px rgba(198, 161, 91, 0.35);
}
.page-hero__title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--color-text-light);
  letter-spacing: 0.03em;
}
.page-hero__subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--color-text-sub);
  line-height: 1.55;
  max-width: 36em;
}
@media (min-width: 1200px) {
  .page-hero__title { font-size: 30px; }
}
</style>
