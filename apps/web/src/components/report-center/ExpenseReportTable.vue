<script setup lang="ts">
import { reimbursementStatusLabel } from '@jade-account/shared'

defineProps<{
  items: any[]
  sortKey: 'occurredAt' | 'amount'
  sortDir: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  sort: [key: 'occurredAt' | 'amount']
  view: [id: number]
  preview: [item: any]
}>()

function linkText(item: any) {
  const parts: string[] = []
  if (item.externalOrderNo) parts.push(item.externalOrderNo)
  if (item.braceletCode) parts.push(item.braceletCode)
  return parts.join(' / ') || '—'
}

function voucherText(item: any) {
  const n = item.attachments?.length || 0
  return n ? `有 ${n} 张` : '无凭证'
}
</script>

<template>
  <div class="ert-wrap" data-testid="expense-report-table">
    <table class="ert-table">
      <thead>
        <tr>
          <th>
            <button type="button" class="ert-sort" @click="emit('sort', 'occurredAt')">
              日期 {{ sortKey === 'occurredAt' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </button>
          </th>
          <th>支出分类</th>
          <th>
            <button type="button" class="ert-sort" @click="emit('sort', 'amount')">
              金额 {{ sortKey === 'amount' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </button>
          </th>
          <th>经手人</th>
          <th>付款来源</th>
          <th>关联订单/货品</th>
          <th>凭证</th>
          <th>报账状态</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ String(item.occurredAt || '').slice(0, 10) }}</td>
          <td>{{ item.expenseType }}</td>
          <td class="ert-amount">¥{{ Number(item.amount).toFixed(2) }}</td>
          <td>{{ item.operatorName || item.reimbursementPerson || '未标记' }}</td>
          <td>{{ item.paySource }}</td>
          <td>{{ linkText(item) }}</td>
          <td>
            <button
              v-if="item.attachments?.length"
              type="button"
              class="ert-link"
              @click="emit('preview', item)"
            >{{ voucherText(item) }}</button>
            <span v-else class="ert-muted">无凭证</span>
          </td>
          <td>{{ reimbursementStatusLabel(item.reimbursementStatus) }}</td>
          <td class="ert-remark">{{ item.remark || '—' }}</td>
          <td>
            <button type="button" class="ert-link" @click="emit('view', item.id)">查看</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!items.length" class="ert-empty">当前筛选下暂无支出明细</div>
  </div>
</template>

<style scoped>
.ert-wrap {
  overflow-x: auto;
  border: 1px solid #e9e1d0;
  border-radius: 12px;
  background: #fff;
}
.ert-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: #1f2933;
}
.ert-table th,
.ert-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0ebe0;
  text-align: left;
  white-space: nowrap;
}
.ert-table th {
  background: #f8f7f3;
  color: #667085;
  font-weight: 600;
}
.ert-amount { text-align: right; font-weight: 600; color: #b08d57; }
.ert-remark { max-width: 160px; white-space: normal; }
.ert-sort {
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.ert-link {
  border: none;
  background: none;
  color: #b08d57;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
}
.ert-muted { color: #667085; }
.ert-empty { padding: 24px; text-align: center; color: #667085; }
</style>
