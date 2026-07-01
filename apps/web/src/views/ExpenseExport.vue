<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { withBase } from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDesktop } = useBreakpoint()

const filter = ref({
  startDate: (route.query.startDate as string) || new Date().toISOString().slice(0, 10).replace(/-\d{2}$/, '-01'),
  endDate: (route.query.endDate as string) || new Date().toISOString().slice(0, 10),
  reimbursementStatus: 'all',
  reimbursementPerson: '',
  expenseType: '',
  paySource: '',
})

const exportResult = ref<any>(null)
const exporting = ref(false)

async function onExport() {
  await auth.fetchWorkerStatus()
  if (!auth.workerOnline) {
    showToast('本地助手没连上，暂时不能导出带图片的报销表')
    return
  }
  exporting.value = true
  exportResult.value = null
  try {
    const res = await api.post('/expenses/export/reimbursement-excel', filter.value)
    exportResult.value = res.data.data
    showToast('导出成功')
  } catch (err: any) {
    showToast(err.response?.data?.message || '导出失败，请重试')
  } finally {
    exporting.value = false
  }
}

function download() {
  if (exportResult.value?.downloadUrl) {
    window.open(withBase(exportResult.value.downloadUrl), '_blank')
  }
}
</script>

<template>
  <AppShell title="报销导出" no-tab-pad :fixed-bottom="!isDesktop">
    <LuxuryCard gold>
      <div class="section-title">筛选条件</div>
      <p class="export-hint muted">按条件导出 Excel（含付款截图）。需公司电脑 Worker 在线。</p>
      <div class="filter-row">
        <van-field v-model="filter.startDate" label="开始日期" type="date" />
        <van-field v-model="filter.endDate" label="结束日期" type="date" />
        <van-field v-model="filter.reimbursementStatus" label="报销状态" placeholder="全部填 all，或 pending / reimbursed" />
        <van-field v-model="filter.reimbursementPerson" label="经手人" placeholder="留空表示全部" />
        <van-field v-model="filter.expenseType" label="支出分类" placeholder="留空表示全部" />
        <van-field v-model="filter.paySource" label="账户" placeholder="留空表示全部" />
      </div>
      <div class="export-actions">
        <ActionButton :loading="exporting" block size="lg" data-testid="export-btn" @click="onExport">
          导出 Excel
        </ActionButton>
        <ActionButton v-if="exportResult" block variant="ghost" data-testid="export-download-btn" @click="download">
          下载文件
        </ActionButton>
      </div>
    </LuxuryCard>
  </AppShell>
</template>

<style scoped>
.export-hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
.filter-row :deep(.van-field) {
  padding: 8px 0;
}
.export-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}
</style>
