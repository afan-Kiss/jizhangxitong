<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import api, { withBase } from '../../api'

const props = defineProps<{
  open: boolean
  startDate: string
  endDate: string
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  shared: [string]
}>()

const title = ref('项目资金报账单')
const includeDetails = ref(true)
const includeCategorySummary = ref(true)
const includeHandlerSummary = ref(true)
const includePaymentSourceSummary = ref(true)
const includeVoucherLinks = ref(true)
const includeRemarks = ref(true)
const loading = ref(false)

function close() {
  emit('update:open', false)
}

async function createShare() {
  loading.value = true
  try {
    const res = await api.post('/finance/share-links', {
      title: title.value,
      startDate: props.startDate,
      endDate: props.endDate,
      includeDetails: includeDetails.value,
      includeCategorySummary: includeCategorySummary.value,
      includeHandlerSummary: includeHandlerSummary.value,
      includePaymentSourceSummary: includePaymentSourceSummary.value,
      includeVoucherLinks: includeVoucherLinks.value,
      includeRemarks: includeRemarks.value,
    })
    const url = res.data.data.shareUrl as string
    emit('shared', url)
    try {
      await navigator.clipboard.writeText(url)
      showToast('财务外链已生成并复制')
    } catch {
      showToast('财务外链已生成')
    }
    close()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(msg || '生成失败')
  } finally {
    loading.value = false
  }
}

function exportExcel() {
  const q = new URLSearchParams({
    startDate: props.startDate,
    endDate: props.endDate,
    format: 'xlsx',
    title: title.value,
  })
  window.open(withBase(`/api/finance/export?${q.toString()}`), '_blank')
  close()
}
</script>

<template>
  <div v-if="open" class="frm-overlay" data-testid="finance-report-modal" @click.self="close">
    <div class="frm-panel">
      <h2 class="frm-title">生成财务报账单</h2>
      <label class="frm-label">报账标题</label>
      <input v-model="title" class="frm-input" type="text" />

      <p class="frm-hint">时间范围：{{ startDate }} 至 {{ endDate }}</p>

      <div class="frm-checks">
        <label><input v-model="includeDetails" type="checkbox" /> 支出明细</label>
        <label><input v-model="includeCategorySummary" type="checkbox" /> 分类汇总</label>
        <label><input v-model="includeHandlerSummary" type="checkbox" /> 经手人汇总</label>
        <label><input v-model="includePaymentSourceSummary" type="checkbox" /> 付款来源汇总</label>
        <label><input v-model="includeVoucherLinks" type="checkbox" /> 凭证图片链接</label>
        <label><input v-model="includeRemarks" type="checkbox" /> 备注说明</label>
      </div>

      <div class="frm-actions">
        <button type="button" class="frm-btn frm-btn--gold" :disabled="loading" @click="createShare">
          {{ loading ? '生成中…' : '生成外链' }}
        </button>
        <button type="button" class="frm-btn" @click="exportExcel">导出 Excel</button>
        <button type="button" class="frm-btn frm-btn--plain" @click="close">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(31, 41, 51, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.frm-panel {
  width: min(480px, 100%);
  background: #fff;
  border: 1px solid #e9e1d0;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 12px 40px rgba(31, 41, 51, 0.12);
}
.frm-title { margin: 0 0 16px; font-size: 18px; color: #1f2933; }
.frm-label { display: block; font-size: 13px; color: #667085; margin-bottom: 6px; }
.frm-input {
  width: 100%;
  min-height: 40px;
  border: 1px solid #e9e1d0;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 12px;
  color: #1f2933;
}
.frm-hint { font-size: 13px; color: #667085; margin: 0 0 12px; }
.frm-checks {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: #1f2933;
  margin-bottom: 16px;
}
.frm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.frm-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid #e9e1d0;
  background: #fff;
  color: #1f2933;
  cursor: pointer;
  font-size: 14px;
}
.frm-btn--gold {
  background: linear-gradient(135deg, #c7a45d, #b08d57);
  border-color: #b08d57;
  color: #fff;
}
.frm-btn--plain { background: #f8f7f3; }
</style>
