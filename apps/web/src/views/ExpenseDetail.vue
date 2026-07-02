<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { fileViewUrl, fileThumbUrl } from '../api'
import { useAuthStore } from '../stores/auth'
import { useBreakpoint } from '../composables/useBreakpoint'
import { loadQianfanConfig } from '../composables/useQianfan'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import ActionButton from '../components/ActionButton.vue'
import OrderLink from '../components/OrderLink.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ImagePreviewModal from '../components/ImagePreviewModal.vue'
import { EXPENSE_OPERATORS } from '@jade-account/shared'
import { resolveApiErrorMessage } from '../utils/api-errors'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDesktop } = useBreakpoint()

const expense = ref<any>(null)
const loading = ref(true)
const loadError = ref('')
const statusLabels: Record<string, string> = {
  unpaid: '未打款',
  paid: '已打款',
  failed: '打款失败',
}
const imageUrls = ref<Record<number, string>>({})
const thumbUrls = ref<Record<number, string>>({})
const previewOpen = ref(false)
const previewImages = ref<string[]>([])
const previewStartIndex = ref(0)
const previewAlt = ref('凭证图片')
const supplementFiles = ref<Array<{ fileId: number; fileType: string; name: string }>>([])
const supplementing = ref(false)
const logsExpanded = ref(false)
const showSupplementUploader = ref(false)
const previewRequestSeq = ref(0)
const editForm = ref({ occurredAt: '', operatorName: '' })
const savingBasic = ref(false)

const canEditBasic = computed(() => auth.hasPermission('expense:update') && !expense.value?.isVoided)

const orderNo = computed(() => expense.value?.externalOrderNo || expense.value?.sale?.externalOrderNo || '')
const attachmentCount = computed(() => expense.value?.attachments?.length || 0)
const logCount = computed(() => expense.value?.operationLogs?.length || 0)

const expenseTypeLabel = computed(() => expense.value?.expenseType || '支出')

async function loadAttachmentUrls(attachments: Array<{ fileId: number }>) {
  for (const att of attachments) {
    try {
      if (!thumbUrls.value[att.fileId]) {
        thumbUrls.value[att.fileId] = await fileThumbUrl(att.fileId)
      }
    } catch { /* 单张缩略图失败不阻断 */ }
    try {
      if (!imageUrls.value[att.fileId]) {
        imageUrls.value[att.fileId] = await fileViewUrl(att.fileId)
      }
    } catch { /* 单张大图失败不阻断 */ }
  }
}

function syncEditForm(data: any) {
  if (!data) return
  editForm.value = {
    occurredAt: String(data.occurredAt || '').slice(0, 10),
    operatorName: data.operatorName || data.reimbursementPerson || '',
  }
}

async function saveBasicInfo() {
  if (!editForm.value.occurredAt) {
    showToast('请选择支出日期')
    return
  }
  if (!editForm.value.operatorName) {
    showToast('请选择经手人')
    return
  }
  savingBasic.value = true
  try {
    const res = await api.patch(`/expenses/${route.params.id}`, {
      occurredAt: editForm.value.occurredAt,
      operatorName: editForm.value.operatorName,
    })
    expense.value = res.data.data
    syncEditForm(expense.value)
    showToast('已保存')
  } catch (err: unknown) {
    showToast(resolveApiErrorMessage(err))
  } finally {
    savingBasic.value = false
  }
}

async function loadExpense() {
  loading.value = true
  loadError.value = ''
  try {
    await loadQianfanConfig(api)
    const res = await api.get(`/expenses/${route.params.id}`)
    if (!res.data.data) {
      loadError.value = '支出详情没加载出来'
      expense.value = null
      return
    }
    expense.value = res.data.data
    syncEditForm(expense.value)
    await loadAttachmentUrls(expense.value.attachments || [])
  } catch {
    expense.value = null
    loadError.value = '支出详情没加载出来'
  } finally {
    loading.value = false
  }
}

onMounted(loadExpense)

async function openAttachmentPreview(att: { fileId: number; fileType?: string }) {
  const token = ++previewRequestSeq.value
  previewAlt.value = att.fileType || '凭证图片'
  const attachments = expense.value?.attachments || []
  const urls: string[] = []
  let startIndex = 0

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i]
    let url = imageUrls.value[a.fileId]
    if (!url) {
      try {
        url = await fileViewUrl(a.fileId)
        imageUrls.value[a.fileId] = url
      } catch {
        url = thumbUrls.value[a.fileId] || ''
      }
    }
    if (a.fileId === att.fileId) startIndex = urls.length
    if (url) urls.push(url)
  }

  if (token !== previewRequestSeq.value) return
  if (!urls.length) {
    showToast('这张凭证暂时打不开')
    return
  }

  previewImages.value = urls
  previewStartIndex.value = Math.min(startIndex, urls.length - 1)
  previewOpen.value = true
}

async function voidExpense() {
  try {
    const reason = prompt('请输入作废原因') || '作废'
    await api.post(`/expenses/${route.params.id}/void`, { voidReason: reason })
    showToast('已作废')
    router.back()
  } catch { /* */ }
}

async function linkOrder() {
  const no = prompt('输入小红书订单号补关联', orderNo.value || '')
  if (!no?.trim()) return
  try {
    const res = await api.post(`/expenses/${route.params.id}/link`, { externalOrderNo: no.trim() })
    expense.value = res.data.data
    showToast('已补关联')
  } catch (err: any) {
    showToast(err.response?.data?.message || '关联失败')
  }
}

async function supplementAttachments() {
  if (!supplementFiles.value.length) return
  supplementing.value = true
  try {
    await api.post(`/expenses/${route.params.id}/attachments`, {
      items: supplementFiles.value.map((f) => ({ fileId: f.fileId, fileType: f.fileType })),
    })
    showToast('凭证已补传')
    supplementFiles.value = []
    showSupplementUploader.value = false
    const res = await api.get(`/expenses/${route.params.id}`)
    expense.value = res.data.data
    await loadAttachmentUrls(expense.value.attachments || [])
  } catch (err: any) {
    showToast(err.response?.data?.message || '补传失败')
  } finally {
    supplementing.value = false
  }
}

function toggleSupplement() {
  showSupplementUploader.value = !showSupplementUploader.value
  if (!showSupplementUploader.value) supplementFiles.value = []
}
</script>

<template>
  <AppShell title="支出详情" data-testid="expense-detail-page">
    <div v-if="loading" class="expense-detail__state muted" data-testid="expense-detail-loading">
      正在加载支出详情...
    </div>
    <LuxuryCard v-else-if="loadError" data-testid="expense-detail-error">
      <p class="expense-detail__state">{{ loadError }}</p>
      <div class="expense-detail__error-actions">
        <ActionButton data-testid="expense-detail-retry" @click="loadExpense">重试</ActionButton>
        <ActionButton plain data-testid="expense-detail-error-back" @click="router.back()">返回上一页</ActionButton>
      </div>
    </LuxuryCard>
    <template v-else-if="expense">
    <div class="expense-detail" :class="{ 'expense-detail--desktop': isDesktop }">
      <div class="expense-detail__main">
        <LuxuryCard dark gold :stagger="0" padding="20px 18px" data-testid="expense-amount-card">
          <div v-if="expense.isVoided" class="expense-detail__void-badge" data-testid="expense-void-badge">
            已作废<span v-if="expense.voidReason"> · {{ expense.voidReason }}</span>
          </div>
          <div class="expense-detail__amount money" data-testid="expense-amount">¥{{ Number(expense.amount).toFixed(2) }}</div>
          <div class="expense-detail__subtitle" data-testid="expense-type-pay">
            {{ expenseTypeLabel }} · {{ expense.paySource }}
          </div>
          <div class="expense-detail__date muted" data-testid="expense-date">{{ expense.occurredAt?.slice(0, 10) }}</div>
          <div class="expense-detail__tags" data-testid="expense-status-tags">
            <span v-if="orderNo" class="expense-detail__tag">已关联订单</span>
            <span v-else-if="expense.pendingLinkStatus === 'pending_order'" class="expense-detail__tag expense-detail__tag--warn">待关联订单</span>
            <span class="expense-detail__tag">
              {{ attachmentCount ? `有 ${attachmentCount} 张凭证` : '暂无凭证' }}
            </span>
          </div>
        </LuxuryCard>

        <LuxuryCard v-if="orderNo" :stagger="1" data-testid="expense-order-card">
          <div class="section-title">关联订单</div>
          <OrderLink :order-no="orderNo" hide-hint data-testid="expense-detail-order-no" />
          <div v-if="expense.logisticsNo" class="expense-detail__row">
            <span class="muted">物流单号</span>
            <span>{{ expense.logisticsNo }}</span>
          </div>
        </LuxuryCard>

        <LuxuryCard v-else-if="expense.pendingLinkStatus === 'pending_order'" :stagger="1" data-testid="expense-pending-order-card">
          <div class="section-title">关联订单</div>
          <p class="muted">待关联订单，可先保存后补关联</p>
          <ActionButton plain data-testid="expense-link-order" @click="linkOrder">补关联订单号</ActionButton>
        </LuxuryCard>

        <LuxuryCard v-if="auth.hasPermission('expense:attachment:view')" :stagger="2" data-testid="expense-voucher-card">
          <div class="section-title">凭证图片（{{ attachmentCount }}）</div>
          <div v-if="attachmentCount" class="expense-detail__thumb-grid">
            <button
              v-for="att in expense.attachments"
              :key="att.id"
              type="button"
              class="expense-detail__thumb-btn"
              data-testid="expense-voucher-thumb"
              @click="openAttachmentPreview(att)"
            >
              <img v-if="thumbUrls[att.fileId]" :src="thumbUrls[att.fileId]" alt="凭证" class="expense-detail__thumb" />
              <span v-else class="expense-detail__thumb-placeholder">凭证</span>
            </button>
          </div>
          <div v-else class="muted">暂无凭证</div>
          <div
            v-if="auth.hasPermission('expense:attachment:upload') && !expense.isVoided"
            class="expense-detail__supplement"
          >
            <ActionButton
              plain
              size="md"
              data-testid="expense-supplement-toggle"
              @click="toggleSupplement"
            >
              {{ showSupplementUploader ? '收起补传' : '补传凭证' }}
            </ActionButton>
            <div v-if="showSupplementUploader" class="expense-detail__supplement-panel">
              <ImageUploader v-model="supplementFiles" />
              <ActionButton
                v-if="supplementFiles.length"
                plain
                :loading="supplementing"
                data-testid="expense-supplement-upload"
                @click="supplementAttachments"
              >保存补传图片</ActionButton>
            </div>
          </div>
        </LuxuryCard>
      </div>

      <div class="expense-detail__side">
        <LuxuryCard :stagger="3" data-testid="expense-purpose-card">
          <div class="section-title">这笔钱的用途</div>
          <div class="expense-detail__row">
            <span class="muted">支出分类</span>
            <span>{{ expenseTypeLabel }}</span>
          </div>
          <div class="expense-detail__row">
            <span class="muted">付款来源</span>
            <span data-testid="expense-pay-source">{{ expense.paySource || '项目专用资金' }}</span>
          </div>

          <template v-if="canEditBasic">
            <div class="expense-detail__edit-block">
              <label class="expense-detail__edit-label">经手人</label>
              <div class="expense-detail__operator-grid">
                <button
                  v-for="name in EXPENSE_OPERATORS"
                  :key="name"
                  type="button"
                  class="expense-detail__operator-btn"
                  :class="{ 'expense-detail__operator-btn--active': editForm.operatorName === name }"
                  :data-testid="`expense-edit-operator-${name}`"
                  @click="editForm.operatorName = name"
                >{{ name }}</button>
              </div>
            </div>
            <div class="expense-detail__edit-block">
              <label class="expense-detail__edit-label">支出日期</label>
              <input
                v-model="editForm.occurredAt"
                type="date"
                class="expense-detail__date-input"
                data-testid="expense-edit-date"
              />
            </div>
            <ActionButton
              block
              :loading="savingBasic"
              data-testid="expense-save-basic-btn"
              @click="saveBasicInfo"
            >保存日期和经手人</ActionButton>
          </template>
          <template v-else>
            <div class="expense-detail__row">
              <span class="muted">经手人</span>
              <span data-testid="expense-operator">{{ expense.operatorName || expense.reimbursementPerson || '未标记' }}</span>
            </div>
            <div class="expense-detail__row">
              <span class="muted">支出时间</span>
              <span>{{ expense.occurredAt?.slice(0, 10) }}</span>
            </div>
          </template>

          <div v-if="expense.remark" class="expense-detail__row">
            <span class="muted">备注</span>
            <span>{{ expense.remark }}</span>
          </div>
        </LuxuryCard>

        <LuxuryCard :stagger="4">
          <button
            type="button"
            class="expense-detail__logs-toggle"
            data-testid="expense-logs-toggle"
            @click="logsExpanded = !logsExpanded"
          >
            <span class="section-title expense-detail__logs-title">操作记录（{{ logCount }}条）</span>
            <span class="expense-detail__logs-arrow">{{ logsExpanded ? '收起' : '展开' }}</span>
          </button>
          <div v-if="logsExpanded" class="expense-detail__logs-body">
            <div class="expense-detail__row">
              <span class="muted">创建人</span>
              <span>{{ expense.createdByUser?.displayName || '历史数据，未记录操作人' }}</span>
            </div>
            <div v-if="expense.updatedByUser" class="expense-detail__row">
              <span class="muted">最近修改</span>
              <span>{{ expense.updatedByUser.displayName }}</span>
            </div>
            <div v-if="expense.voidedByUser" class="expense-detail__row">
              <span class="muted">作废人</span>
              <span>{{ expense.voidedByUser.displayName }}</span>
            </div>
            <div v-if="logCount" class="expense-detail__logs" data-testid="expense-operation-logs">
              <div
                v-for="log in expense.operationLogs"
                :key="log.id"
                class="expense-detail__log-card"
                data-testid="expense-log-item"
              >
                <div class="expense-detail__log-time">{{ log.createdAt?.slice(0, 16).replace('T', ' ') }}</div>
                <div class="expense-detail__log-msg">{{ log.formattedMessage || log.summary }}</div>
                <div v-if="log.targetLabel" class="expense-detail__log-target muted">{{ log.targetLabel }}</div>
              </div>
            </div>
            <div v-else class="muted">暂无操作记录</div>
          </div>
        </LuxuryCard>

        <div class="expense-detail__footer" data-testid="expense-detail-nav">
          <ActionButton data-testid="expense-continue-btn" @click="router.push('/expense/create')">继续记一笔</ActionButton>
          <ActionButton plain data-testid="expense-back-btn" @click="router.back()">返回上一页</ActionButton>
          <ActionButton
            v-if="auth.hasPermission('expense:void') && !expense.isVoided"
            variant="danger"
            data-testid="expense-void-btn"
            @click="voidExpense"
          >作废这笔</ActionButton>
        </div>
      </div>
    </div>
    </template>
  </AppShell>

  <ImagePreviewModal
    :open="previewOpen"
    :images="previewImages"
    :start-index="previewStartIndex"
    :alt="previewAlt"
    @close="previewOpen = false"
  />
</template>

<style scoped>
.expense-detail {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.expense-detail--desktop {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 16px;
  max-width: 1080px;
  align-items: start;
}
.expense-detail__main,
.expense-detail__side {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.expense-detail__void-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #ffd4d4;
  background: rgba(180, 60, 60, 0.22);
  border: 1px solid rgba(220, 120, 120, 0.35);
}
.expense-detail__amount {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-text-light);
  margin-bottom: 8px;
  line-height: 1.1;
}
.expense-detail__subtitle {
  font-size: 16px;
  color: var(--color-gold-light);
  margin-bottom: 4px;
}
.expense-detail__date {
  font-size: 14px;
  margin-bottom: 10px;
}
.expense-detail__impact {
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(198, 161, 91, 0.15);
  color: var(--color-gold-light);
  font-size: 13px;
}
.expense-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.expense-detail__tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--color-text-light);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(198, 161, 91, 0.25);
}
.expense-detail__tag--warn {
  color: var(--color-gold-light);
  border-color: rgba(198, 161, 91, 0.45);
}
.expense-detail__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  font-size: 14px;
}
.expense-detail__row:last-child { border-bottom: none; }
.expense-detail__row span:last-child {
  text-align: right;
  word-break: break-word;
}
.expense-detail__thumb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
@media (min-width: 1200px) {
  .expense-detail__thumb-grid { grid-template-columns: repeat(4, 1fr); }
}
.expense-detail__thumb-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
  border-radius: 10px;
  overflow: hidden;
}
.expense-detail__thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
  border: var(--border-gold);
  display: block;
}
.expense-detail__supplement {
  margin-top: 14px;
}
.expense-detail__supplement-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.expense-detail__logs-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.expense-detail__logs-title {
  margin: 0;
}
.expense-detail__logs-arrow {
  font-size: 13px;
  color: var(--color-gold);
  flex-shrink: 0;
}
.expense-detail__logs-body {
  margin-top: 12px;
}
.expense-detail__logs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.expense-detail__log-card {
  padding: 10px 12px;
  border-radius: 12px;
  border: var(--border-glass);
  background: rgba(255, 255, 255, 0.03);
}
.expense-detail__log-time {
  font-size: 11px;
  color: var(--color-text-sub);
  margin-bottom: 4px;
}
.expense-detail__log-msg {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-light);
  word-break: break-word;
}
.expense-detail__log-target {
  margin-top: 4px;
  font-size: 11px;
}
.expense-detail__footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding-bottom: 24px;
}
.expense-detail__state {
  padding: 24px 8px;
  text-align: center;
  font-size: 14px;
}
.expense-detail__error-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.expense-detail__thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  border: var(--border-gold);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-sub);
  font-size: 12px;
}
.expense-detail__edit-block {
  padding: 12px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
}
.expense-detail__edit-label {
  display: block;
  font-size: 13px;
  color: var(--color-text-sub);
  margin-bottom: 8px;
}
.expense-detail__operator-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.expense-detail__operator-btn {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(198, 161, 91, 0.35);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  font-size: 14px;
  cursor: pointer;
}
.expense-detail__operator-btn--active {
  border-color: var(--color-gold);
  background: rgba(198, 161, 91, 0.15);
  color: var(--color-gold-light);
}
.expense-detail__date-input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(198, 161, 91, 0.35);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-light);
  font-size: 14px;
}
</style>
