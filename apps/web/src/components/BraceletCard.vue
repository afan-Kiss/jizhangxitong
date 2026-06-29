<script setup lang="ts">
import StatusPill from './StatusPill.vue'

defineProps<{
  code: string
  status?: string
  inboundAt?: string
  inboundCost?: number
  showCost?: boolean
  imageUrl?: string
  imageError?: string
  highlight?: boolean
  notSynced?: boolean
}>()
</script>

<template>
  <div class="bracelet-card" :class="{ 'bracelet-card--highlight': highlight, 'bracelet-card--gold': highlight }">
    <div v-if="imageUrl && !imageError" class="bracelet-card__image">
      <img :src="imageUrl" alt="" />
    </div>
    <div v-else-if="imageError" class="bracelet-card__no-image muted">{{ imageError }}</div>
    <div class="bracelet-card__body">
      <div class="bracelet-card__code">{{ code }}</div>
      <div class="bracelet-card__meta">
        <StatusPill v-if="notSynced" type="gold">扫码枪</StatusPill>
        <StatusPill v-if="status" type="info">{{ status }}</StatusPill>
      </div>
      <div class="bracelet-card__info muted">
        <span v-if="inboundAt">入库 {{ inboundAt.slice(0, 10) }}</span>
        <span v-if="showCost && inboundCost !== undefined"> · 成本 ¥{{ inboundCost.toFixed(2) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracelet-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--color-card);
  backdrop-filter: var(--blur-glass);
  border: var(--border-gold);
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
  transition: box-shadow 0.3s var(--ease-out);
}
.bracelet-card--gold {
  border-color: rgba(198, 161, 91, 0.35);
}
.bracelet-card--highlight {
  animation: highlight-flash 1s var(--ease-out);
}
.bracelet-card__image {
  width: 88px;
  height: 88px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(198, 161, 91, 0.2);
}
.bracelet-card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bracelet-card__no-image {
  width: 88px;
  height: 88px;
  border-radius: 14px;
  background: rgba(111, 119, 114, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 11px;
  padding: 8px;
  flex-shrink: 0;
}
.bracelet-card__code {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-main);
  letter-spacing: 0.02em;
}
.bracelet-card__meta {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.bracelet-card__info { margin-top: 6px; }
</style>
