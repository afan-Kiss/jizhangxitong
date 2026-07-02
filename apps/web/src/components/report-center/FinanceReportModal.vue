<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { showToast } from 'vant'
import QRCode from 'qrcode'
import api from '../../api'
import { downloadFinanceExcel } from '../../utils/finance-export'

const props = defineProps<{
  open: boolean
  startDate: string
  endDate: string
  /** 已生成的外链，用于再次打开时展示二维码 */
  shareUrl?: string
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  shared: [string]
}>()

const title = ref('项目资金支出对账表')
const includeDetails = ref(true)
const includeCategorySummary = ref(true)
const includeHandlerSummary = ref(true)
const includePaymentSourceSummary = ref(true)
const includeVoucherLinks = ref(true)
const includeRemarks = ref(true)
const includeOrderLogistics = ref(true)
const expiresInDays = ref(7)
const shareExpiresAt = ref('')
const loading = ref(false)
const step = ref<'form' | 'result'>('form')
const resultUrl = ref('')
const qrDataUrl = ref('')

async function renderQr(url: string) {
  try {
    qrDataUrl.value = await QRCode.toDataURL(url, { margin: 2, width: 220, color: { dark: '#1f2933', light: '#ffffff' } })
  } catch {
    qrDataUrl.value = ''
  }
}

async function showResult(url: string) {
  resultUrl.value = url
  step.value = 'result'
  await nextTick()
  await renderQr(url)
}

function close() {
  emit('update:open', false)
}

function resetForm() {
  step.value = 'form'
  resultUrl.value = ''
  qrDataUrl.value = ''
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      resetForm()
      return
    }
    if (props.shareUrl) {
      await showResult(props.shareUrl)
    } else {
      resetForm()
    }
  },
)

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
      includeOrderLogistics: includeOrderLogistics.value,
      expiresInDays: expiresInDays.value,
    })
    const url = res.data.data.shareUrl as string
    shareExpiresAt.value = res.data.data.expiresAt as string || ''
    emit('shared', url)
    await showResult(url)
    showToast('财务外链已生成')
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    showToast(msg || '生成失败')
  } finally {
    loading.value = false
  }
}

async function copyUrl() {
  if (!resultUrl.value) return
  try {
    await navigator.clipboard.writeText(resultUrl.value)
    showToast('已复制财务外链')
  } catch {
    showToast(resultUrl.value)
  }
}

function exportExcel() {
  downloadFinanceExcel({
    startDate: props.startDate,
    endDate: props.endDate,
    title: title.value,
  })
    .then(() => close())
    .catch(() => showToast('导出失败'))
}
</script>

<template>
  <div v-if="open" class="frm-overlay" data-testid="finance-report-modal" @click.self="close">
    <div class="frm-panel">
      <template v-if="step === 'form'">
        <h2 class="frm-title">生成财务对账表</h2>
        <label class="frm-label">对账标题</label>
        <input v-model="title" class="frm-input" type="text" />

        <p class="frm-hint">时间范围：{{ startDate }} 至 {{ endDate }}</p>
        <p v-if="startDate === endDate" class="frm-note">
          提示：当前只选了单日。若该日还没有支出，外链里会显示空数据。
        </p>

        <div class="frm-checks">
          <label><input v-model="includeDetails" type="checkbox" /> 支出明细</label>
          <label><input v-model="includeCategorySummary" type="checkbox" /> 分类汇总</label>
          <label><input v-model="includeHandlerSummary" type="checkbox" /> 经手人汇总</label>
          <label><input v-model="includePaymentSourceSummary" type="checkbox" /> 付款来源汇总</label>
          <label><input v-model="includeVoucherLinks" type="checkbox" /> 凭证图片链接</label>
          <label><input v-model="includeRemarks" type="checkbox" /> 备注说明</label>
          <label><input v-model="includeOrderLogistics" type="checkbox" /> 订单号 / 物流单号</label>
        </div>

        <label class="frm-label">链接有效期</label>
        <select v-model.number="expiresInDays" class="frm-input">
          <option :value="1">1 天</option>
          <option :value="7">7 天（默认）</option>
          <option :value="30">30 天</option>
        </select>

        <div class="frm-actions">
          <button type="button" class="frm-btn frm-btn--gold" :disabled="loading" data-testid="btn-create-share" @click="createShare">
            {{ loading ? '生成中…' : '生成外链' }}
          </button>
          <button type="button" class="frm-btn" @click="exportExcel">导出 Excel</button>
          <button type="button" class="frm-btn frm-btn--plain" @click="close">取消</button>
        </div>
      </template>

      <template v-else>
        <h2 class="frm-title">财务查看链接已生成</h2>
        <p class="frm-hint">
          财务同事扫码或打开链接即可查看对账数据
          <template v-if="shareExpiresAt">（有效期至 {{ new Date(shareExpiresAt).toLocaleString() }}）</template>
        </p>

        <div class="frm-qr-wrap" data-testid="finance-share-qr">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="财务外链二维码" class="frm-qr" />
          <p v-else class="frm-note">二维码生成失败，请直接复制下方链接</p>
        </div>

        <div class="frm-url-box">
          <a :href="resultUrl" target="_blank" rel="noopener" class="frm-url">{{ resultUrl }}</a>
        </div>

        <div class="frm-actions">
          <button type="button" class="frm-btn frm-btn--gold" data-testid="btn-copy-share-url" @click="copyUrl">复制链接</button>
          <button type="button" class="frm-btn" @click="step = 'form'">重新生成</button>
          <button type="button" class="frm-btn frm-btn--plain" @click="close">完成</button>
        </div>
      </template>
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
  max-height: min(92vh, 720px);
  overflow-y: auto;
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
.frm-hint { font-size: 13px; color: #667085; margin: 0 0 12px; line-height: 1.5; }
.frm-note {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #faf6ee;
  border: 1px solid #e9e1d0;
  font-size: 12px;
  color: #96733f;
  line-height: 1.5;
}
.frm-checks {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: #1f2933;
  margin-bottom: 16px;
}
.frm-qr-wrap {
  display: flex;
  justify-content: center;
  margin: 8px 0 16px;
  padding: 16px;
  background: #fbf8f1;
  border: 1px solid #e9e1d0;
  border-radius: 12px;
}
.frm-qr {
  width: 220px;
  height: 220px;
  display: block;
}
.frm-url-box {
  margin-bottom: 16px;
  padding: 10px 12px;
  background: #f8f7f3;
  border: 1px solid #e9e1d0;
  border-radius: 10px;
  word-break: break-all;
}
.frm-url {
  font-size: 12px;
  color: #b08d57;
  text-decoration: none;
}
.frm-url:hover { text-decoration: underline; }
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
