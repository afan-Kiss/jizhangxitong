<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import api, { fileThumbUrl } from '../api'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const expense = ref<any>(null)
const thumbUrls = ref<Record<number, string>>({})

onMounted(async () => {
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
</script>

<template>
  <div class="page" v-if="expense">
    <van-nav-bar title="支出详情" left-arrow @click-left="router.back()" />
    <div class="card">
      <div class="stat-value">¥{{ Number(expense.amount).toFixed(2) }}</div>
      <div>{{ expense.expenseType }} · {{ expense.paySource }}</div>
      <div class="muted">{{ expense.occurredAt?.slice(0, 10) }}</div>
      <div v-if="expense.isVoided" style="color:#ee0a24;">已作废: {{ expense.voidReason }}</div>
    </div>
    <van-cell-group inset>
      <van-cell title="报销人" :value="expense.reimbursementPerson || '-'" />
      <van-cell title="报销状态" :value="expense.reimbursementStatus" />
      <van-cell title="镯子编号" :value="expense.braceletCode || '未绑定'" />
      <van-cell title="摘要" :value="expense.expenseSummary || '-'" />
      <van-cell title="备注" :value="expense.remark || '-'" />
    </van-cell-group>

    <div class="card" v-if="auth.hasPermission('expense:attachment:view')">
      <h4>凭证图片</h4>
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
