<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { withBase } from '../api'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ExportProgress from '../components/ExportProgress.vue'
import ActionButton from '../components/ActionButton.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import StatusPill from '../components/StatusPill.vue'

const route = useRoute()
const router = useRouter()
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
  const res = await api.post('/expenses/export/reimbursement-excel/preview', filter.value)
  preview.value = res.data.data.preview
  missingImageCount.value = res.data.data.missingImageCount
  exportSteps.value[1].status = 'done'
}

async function onExport() {
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
    showToast(err.response?.data?.message || '导出失败')
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

onMounted(onPreview)
</script>

<template>
  <AppShell title="报销导出" show-back no-tab-pad fixed-bottom @back="router.back()">
    <LuxuryCard>
      <div class="section-title">筛选条件</div>
      <van-field v-model="filter.startDate" label="开始" type="date" />
      <van-field v-model="filter.endDate" label="结束" type="date" />
      <van-field v-model="filter.reimbursementStatus" label="报销状态" placeholder="all / pending / reimbursed" />
      <van-field v-model="filter.reimbursementPerson" label="报销人" />
    </LuxuryCard>

    <LuxuryCard gold>
      <div class="section-title">导出进度</div>
      <ExportProgress :steps="exportSteps" />
    </LuxuryCard>

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

    <template #footer>
      <div class="export-footer">
        <ActionButton :loading="exporting" size="lg" @click="onExport">导出 Excel 报销表</ActionButton>
        <div class="export-footer__secondary">
          <ActionButton variant="secondary" @click="onPreview">刷新预览</ActionButton>
          <ActionButton v-if="exportResult" variant="ghost" @click="download">下载文件</ActionButton>
        </div>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.export-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.export-footer .action-btn { width: 100%; }
.export-footer__secondary {
  display: flex;
  gap: 8px;
}
.export-footer__secondary .action-btn { flex: 1; min-width: 0; }
</style>
