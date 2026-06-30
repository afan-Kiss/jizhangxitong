<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { withBase } from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ExportProgress from '../components/ExportProgress.vue'
import ActionButton from '../components/ActionButton.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkerStatus from '../components/WorkerStatus.vue'

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
  onlyWithBracelet: false,
})
const preview = ref<any[]>([])
const previewSummary = ref<any>(null)
const missingImageCount = ref(0)
const exportResult = ref<any>(null)
const exporting = ref(false)
const currentStep = ref(0)

const exportSteps = ref<Array<{ key: string; label: string; status: 'pending' | 'active' | 'done' | 'error' }>>([
  { key: 'filter', label: '选择筛选条件', status: 'done' },
  { key: 'preview', label: '预览导出数据', status: 'pending' },
  { key: 'images', label: '读取本地图片', status: 'pending' },
  { key: 'embed', label: '嵌入 Excel', status: 'pending' },
  { key: 'download', label: '生成下载文件', status: 'pending' },
])

function updateSteps(activeIdx: number, errorIdx?: number) {
  exportSteps.value = exportSteps.value.map((s, i) => ({
    ...s,
    status: errorIdx === i ? 'error' as const
      : i < activeIdx ? 'done' as const
      : i === activeIdx ? 'active' as const
      : 'pending' as const,
  }))
}

async function onPreview() {
  updateSteps(1)
  try {
    const res = await api.post('/expenses/export/reimbursement-excel/preview', filter.value)
    preview.value = res.data.data.preview
    previewSummary.value = res.data.data.summary
    missingImageCount.value = res.data.data.missingImageCount
    exportSteps.value[1].status = 'done'
  } catch {
    showToast('数据没查出来，刷新试试')
  }
}

async function onExport() {
  await auth.fetchWorkerStatus()
  if (!auth.workerOnline) {
    showToast('本地助手没连上，暂时不能导出带图片的报销表。')
    return
  }
  if (missingImageCount.value > 0) {
    showToast(`有 ${missingImageCount.value} 笔缺少图片，导出后会标注`)
  }
  exporting.value = true
  exportResult.value = null
  try {
    updateSteps(2)
    await delay(400)
    updateSteps(3)
    const res = await api.post('/expenses/export/reimbursement-excel', filter.value)
    updateSteps(4)
    await delay(300)
    exportSteps.value[4].status = 'done'
    exportResult.value = res.data.data
    showToast('导出成功')
  } catch (err: any) {
    const failedStep = currentStep.value || 2
    updateSteps(failedStep, failedStep)
    showToast(err.response?.data?.message || '导出失败，先别重复点，重新试一次')
  } finally {
    exporting.value = false
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function download() {
  if (exportResult.value?.downloadUrl) {
    window.open(withBase(exportResult.value.downloadUrl), '_blank')
  }
}

onMounted(async () => {
  await auth.fetchWorkerStatus()
  onPreview()
})
</script>

<template>
  <AppShell title="报销导出" show-back no-tab-pad :fixed-bottom="!isDesktop" @back="router.back()">
    <div class="export-layout">
      <WorkerStatus :status="auth.workerStatus" compact />

      <div class="export-layout__top">
        <LuxuryCard>
          <div class="section-title">筛选条件</div>
          <div class="filter-row">
            <van-field v-model="filter.startDate" label="开始" type="date" />
            <van-field v-model="filter.endDate" label="结束" type="date" />
            <van-field v-model="filter.reimbursementStatus" label="报销状态" placeholder="全部/未报销/已报销" />
            <van-field v-model="filter.reimbursementPerson" label="经手人" />
            <van-field v-model="filter.expenseType" label="支出分类" placeholder="全部" />
            <van-field v-model="filter.paySource" label="账户" placeholder="全部" />
          </div>
        </LuxuryCard>

        <LuxuryCard gold>
          <div class="section-title">导出进度</div>
          <div v-if="previewSummary" class="summary-grid summary-grid--compact" data-testid="export-preview-summary">
            <div><span class="muted">笔数</span><strong>{{ previewSummary.count }}</strong></div>
            <div><span class="muted">总金额</span><strong>¥{{ Number(previewSummary.totalAmount).toFixed(2) }}</strong></div>
            <div><span class="muted">未报销</span><strong>¥{{ Number(previewSummary.pendingAmount).toFixed(2) }}</strong></div>
            <div><span class="muted">已报销</span><strong>¥{{ Number(previewSummary.reimbursedAmount).toFixed(2) }}</strong></div>
          </div>
          <ExportProgress :steps="exportSteps" />
          <div v-if="isDesktop" class="export-actions export-actions--inline">
            <ActionButton variant="secondary" data-testid="preview-btn" @click="onPreview">先预览</ActionButton>
            <ActionButton :loading="exporting" size="lg" data-testid="export-btn" @click="onExport">导出报销表</ActionButton>
            <div class="export-footer__secondary">
              <ActionButton v-if="exportResult" variant="ghost" @click="download">下载文件</ActionButton>
            </div>
          </div>
        </LuxuryCard>
      </div>

    <LuxuryCard v-if="missingImageCount > 0">
      <StatusPill type="warning" dot>
        {{ missingImageCount }} 笔缺少付款截图，建议先补图
      </StatusPill>
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">预览 · {{ preview.length }} 笔</div>
      <ExpenseItem
        v-for="item in preview"
        :key="item.id"
        :type="item.expenseType"
        :amount="item.amount"
        :person="item.reimbursementPerson"
        :image-count="item.imageCount"
        :occurred-at="item.occurredAt"
      />
    </LuxuryCard>

    </div>

    <template v-if="!isDesktop" #footer>
      <div class="export-footer export-actions">
        <ActionButton variant="secondary" data-testid="preview-btn" @click="onPreview">先预览</ActionButton>
        <ActionButton :loading="exporting" size="lg" data-testid="export-btn" @click="onExport">导出报销表</ActionButton>
        <div class="export-footer__secondary">
          <ActionButton v-if="exportResult" variant="ghost" @click="download">下载文件</ActionButton>
        </div>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.export-footer,
.export-actions--inline {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}
.export-footer .action-btn,
.export-actions--inline .action-btn { width: 100%; }
.export-footer__secondary {
  display: flex;
  gap: 8px;
}
.export-footer__secondary .action-btn { flex: 1; min-width: 0; }
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.summary-grid strong { display: block; font-size: 16px; margin-top: 4px; }
.summary-grid--compact {
  margin-bottom: 12px;
  grid-template-columns: repeat(4, 1fr);
}
.summary-grid--compact strong { font-size: 14px; }
@media (min-width: 1200px) {
  .summary-grid { grid-template-columns: repeat(5, 1fr); }
}
</style>
