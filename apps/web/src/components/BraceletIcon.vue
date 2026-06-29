<script setup lang="ts">
/** 圆形玉镯 SVG 图标 — 墨玉/羊脂白/暗金风格 */withDefaults(
  defineProps<{
    size?: number
    active?: boolean
  }>(),
  { size: 22, active: false },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="bracelet-icon"
    :class="{ 'bracelet-icon--active': active }"
    aria-hidden="true"
  >
    <!-- 外圈玉镯 -->
    <circle
      cx="12"
      cy="12"
      r="9"
      :stroke="active ? 'var(--color-gold, #c6a15b)' : 'currentColor'"
      stroke-width="2.2"
      fill="none"
    />
    <!-- 内圈镂空 -->
    <circle
      cx="12"
      cy="12"
      r="5.5"
      :stroke="active ? 'var(--color-gold, #c6a15b)' : 'currentColor'"
      stroke-width="1.2"
      fill="none"
      opacity="0.85"
    />
    <!-- 羊脂光泽 -->
    <path
      d="M7 10.5c2-2.5 8-2.5 10 0"
      :stroke="active ? 'var(--color-gold-soft, #e8d4a8)' : 'currentColor'"
      stroke-width="1"
      stroke-linecap="round"
      opacity="0.5"
    />
    <!-- 墨玉色带 -->
    <path
      d="M8.5 14c1.2 1.8 5.8 1.8 7 0"
      stroke="currentColor"
      stroke-width="0.8"
      stroke-linecap="round"
      opacity="0.35"
    />
  </svg>
</template>

<style scoped>
.bracelet-icon {
  color: var(--color-text-sub, #6f7774);
  display: block;
  flex-shrink: 0;
}
.bracelet-icon--active {
  color: var(--color-gold, #c6a15b);
}
</style>
