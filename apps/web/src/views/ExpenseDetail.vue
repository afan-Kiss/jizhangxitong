<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { fileThumbUrl } from '../api'
import { useAuthStore } from '../stores/auth'
import { useQianfan, loadQianfanConfig } from '../composables/useQianfan'
import { EXPENSE_BUSINESS_LABELS } from '@jade-account/shared'
import ActionButton from '../components/ActionButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { qianfanEnabled, copyOrderNo, openQianfan } = useQianfan()

const expense = ref<any>(null)
const statusLabels: Record<string, string> = {
  pending: '未报销',
  reimbursed: '已报销',
  not_required: '不需要报销',
  unpaid: '未打款',
  paid: '已打款',
  failed: '打款失败',
}
const thumbUrls = ref<Record<number, string>>({})

const orderNo = computed(() => expense.value?.externalOrderNo || expense.value?.sale?.externalOrderNo || '')

onMounted(async () => {
  await loadQianfanConfig(api)
  const res = await api.get(`/expenses/${route.params.id}`)
  expense.value = res.data.data
  for (const att of expense.value.attachments || []) {
    thumbUrls.value[att.fileId] = await fileThumbUrl(att.fileId)
  }
})

async function voidExpense() {
  try {
    const reason = prompt('请输入作废原因') || '作废'
    await api.post(`/expenses/${route.params.id}/void`, { voidReason: reason })
    showToast('已作废')
    router.back()
  } catch { /* */ }
}

async function updateReimbursement(status: string) {
  await api.patch(`/expenses/${route.params.id}/reimbursement-status`, { status })
  showToast('已更新报销状态')
  const res = await api.get(`/expenses/${route.params.id}`)
  expense.value = res.data.data
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
</script>

<template>
  <div class="page expense-detail" v-if="expense" data-testid="expense-detail-page">
    <van-nav-bar title="支出详情" left-arrow @click-left="router.back()" />
    <div class="card">
      <div class="stat-value">¥{{ Number(expense.amount).toFixed(2) }}</div>
      <div>{{ expense.expenseType }} · {{ expense.paySource }}</div>
      <div v-if="expense.businessType" class="muted">
        {{ EXPENSE_BUSINESS_LABELS[expense.businessType as keyof typeof EXPENSE_BUSINESS_LABELS] || expense.businessType }}
      </div>
      <div class="muted">{{ expense.occurredAt?.slice(0, 10) }}</div>
      <div v-if="expense.isVoided" style="color:#ee0a24;">已作废: {{ expense.voidReason }}</div>
      <div v-if="expense.affectsProfit" class="profit-tag">影响订单/货品利润</div>
    </div>
    <van-cell-group inset>
      <van-cell v-if="orderNo" title="小红书订单号" :value="orderNo" data-testid="expense-detail-order-no">
        <template #extra>
          <ActionButton size="md" plain data-testid="expense-copy-order" @click="copyOrderNo(orderNo)">复制</ActionButton>
          <ActionButton
            v-if="qianfanEnabled && orderNo"
            size="md"
            plain
            data-testid="expense-open-qianfan"
            @click="openQianfan(orderNo)"
          >打开千帆</ActionButton>
        </template>
      </van-cell>
      <van-cell v-else-if="expense.pendingLinkStatus === 'pending_order'" title="关联状态" value="待关联订单">
        <template #extra>
          <ActionButton size="md" plain data-testid="expense-link-order" @click="linkOrder">补关联</ActionButton>
        </template>
      </van-cell>
      <p v-if="orderNo && !qianfanEnabled" class="qianfan-hint muted">千帆链接还没配置，先复制订单号去千帆查</p>
      <van-cell title="报销人" :value="expense.reimbursementPerson || '-'" />
      <van-cell title="报销状态" :value="statusLabels[expense.reimbursementStatus] || expense.reimbursementStatus" />
      <van-cell v-if="expense.customerPaymentStatus" title="打款状态" :value="statusLabels[expense.customerPaymentStatus] || expense.customerPaymentStatus" />
      <van-cell title="货品编号" :value="expense.braceletCode || '未绑定'" />
      <van-cell v-if="expense.saleId" title="关联销售" :value="`#${expense.saleId}`" is-link @click="router.push(`/sales/${expense.saleId}`)" />
      <van-cell title="摘要" :value="expense.expenseSummary || '-'" />
      <van-cell title="备注" :value="expense.remark || '-'" />
    </van-cell-group>

    <div class="card" v-if="auth.hasPermission('expense:attachment:view')">
      <h4>凭证图片（{{ expense.attachments?.length || 0 }}）</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <img v-for="att in expense.attachments" :key="att.id"
          :src="thumbUrls[att.fileId]" style="width:80px;height:80px;object-fit:cover;border-radius:6px;" />
      </div>
      <div v-if="!expense.attachments?.length" class="muted">暂无凭证</div>
    </div>

    <div style="padding:16px;display:flex;gap:8px;flex-wrap:wrap;">
      <van-button v-if="auth.hasPermission('reimbursement:update') && expense.paySource === '员工垫付'"
        type="primary" size="small" @click="updateReimbursement('reimbursed')">标记已报销</van-button>
      <van-button v-if="auth.hasPermission('expense:void') && !expense.isVoided"
        type="danger" size="small" @click="voidExpense">作废</van-button>
    </div>
  </div>
</template>

<style scoped>
.expense-detail { overflow-x: hidden; max-width: 100%; }
.profit-tag { color: #c45c00; font-size: 13px; margin-top: 6px; }
.qianfan-hint { padding: 0 16px 8px; font-size: 12px; }
</style>
