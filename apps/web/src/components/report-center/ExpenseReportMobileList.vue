<script setup lang="ts">
import { displayExpensePurpose } from '@jade-account/shared'

defineProps<{ items: any[] }>()
const emit = defineEmits<{ open: [id: number] }>()
</script>

<template>
  <div class="erm-list">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="erm-card"
      @click="emit('open', item.id)"
    >
      <div class="erm-card__top">
        <span class="erm-card__amount">¥{{ Number(item.amount).toFixed(2) }}</span>
        <span class="erm-card__type">{{ item.expenseType }}</span>
      </div>
      <div class="erm-card__meta">
        <span>{{ String(item.occurredAt || '').slice(0, 10) }}</span>
        <span>{{ displayExpensePurpose(item) }}</span>
        <span>{{ item.operatorName || item.reimbursementPerson || '未标记' }}</span>
      </div>
      <div class="erm-card__tags">
        <span class="erm-tag">{{ item.attachments?.length ? `有 ${item.attachments.length} 张凭证` : '无凭证' }}</span>
        <span v-if="item.externalOrderNo || item.logisticsNo" class="erm-tag">
          {{ item.externalOrderNo || item.logisticsNo }}
        </span>
      </div>
    </button>
    <div v-if="!items.length" class="erm-empty">当前筛选下暂无支出明细</div>
  </div>
</template>

<style scoped>
.erm-list { display: flex; flex-direction: column; gap: 10px; }
.erm-card {
  width: 100%;
  text-align: left;
  border: 1px solid #e9e1d0;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(31, 41, 51, 0.04);
}
.erm-card__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.erm-card__amount { font-size: 20px; font-weight: 700; color: #b08d57; }
.erm-card__type { font-size: 14px; color: #1f2933; }
.erm-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #667085;
  margin-bottom: 8px;
}
.erm-card__tags { display: flex; flex-wrap: wrap; gap: 6px; }
.erm-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f8f7f3;
  color: #667085;
  border: 1px solid #e9e1d0;
}
.erm-empty { text-align: center; color: #667085; padding: 24px; }
</style>
