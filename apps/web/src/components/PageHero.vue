<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  testId?: string
}>()
</script>

<template>
  <header class="page-hero" :data-testid="testId || 'page-hero'">
    <h1 class="page-hero__title">{{ title }}</h1>
    <p v-if="subtitle" class="page-hero__subtitle">{{ subtitle }}</p>
    <slot />
  </header>
</template>

<style scoped>
.page-hero {
  margin-bottom: 16px;
  padding: 4px 0 8px;
}
.page-hero__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-main);
  letter-spacing: 0.02em;
}
.page-hero__subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-sub);
  line-height: 1.5;
}
@media (min-width: 1200px) {
  .page-hero__title { font-size: 28px; }
}
</style>
