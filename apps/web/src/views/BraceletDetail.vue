<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { braceletImageUrl } from '../api'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import BraceletCard from '../components/BraceletCard.vue'
import ExpenseItem from '../components/ExpenseItem.vue'
import ProfitPanel from '../components/ProfitPanel.vue'
import type { ProfitRow } from '../components/ProfitPanel.vue'
import { useBreakpoint } from '../composables/useBreakpoint'

const route = useRoute()
const { isDesktop } = useBreakpoint()
const router = useRouter()
const auth = useAuthStore()
const detail = ref<any>(null)
const profit = ref<any>(null)
const imageUrl = ref('')
const imageError = ref('')

const profitRows = computed<ProfitRow[]>(() => {
  if (!profit.value) return []
  const p = profit.value
  const rows: ProfitRow[] = [
    { label: '这件货一共花了多少', amount: Number(p.costs?.costTotal ?? 0), type: 'base' },
  ]
  if (p.summary?.isSold) {
    rows.push({ label: '这件货卖了多少', amount: Number(p.sale?.saleAmount ?? 0), type: 'sub' })
    if (Number(p.sale?.refundAmount ?? 0) > 0) {
      rows.push({ label: '减：退款', amount: Number(p.sale.refundAmount), type: 'deduct' })
    }
    rows.push({
      label: '扣掉退款和补偿后赚了多少',
      amount: Number(p.summary?.finalProfit ?? 0),
      type: 'total',
      highlight: true,
    })
  }
  return rows
})

onMounted(async () => {
  await auth.fetchWorkerStatus()
  try {
    const res = await api.get(`/bracelets/${route.params.code}`)
    const b = res.data.data
    if (b.notSynced || !b.id) {
      const synced = await api.get(`/bracelets/${b.braceletCode}`)
      b.id = synced.data.data.id
    }
    const d = await api.get(`/bracelets/detail/${b.id}`)
    detail.value = d.data.data
    try {
      const p = await api.get(`/goods/${b.id}/profit`)
      profit.value = p.data.data
    } catch { profit.value = null }
    if (detail.value.bracelet.hasImage) {
      imageUrl.value = await braceletImageUrl(detail.value.bracelet.id)
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || '加载失败')
    router.back()
  }
})

function onImageError() {
  if (!auth.workerOnline) {
    imageError.value = auth.workerStatus.message || '公司电脑上的本地助手没连上，暂时无法查看镯子图片。'
  } else {
    imageError.value = '暂时无法加载镯子图片。'
  }
  imageUrl.value = ''
}
</script>

<template>
  <AppShell
    v-if="detail"
    :title="detail.bracelet.braceletCode"
    no-tab-pad
  >
    <div class="desktop-two-column">
      <div class="desktop-two-column__main">
        <BraceletCard
          gold
          :code="detail.bracelet.braceletCode"
          :status="detail.bracelet.scannerStatus"
          :inbound-at="detail.bracelet.inboundAt"
          :inbound-cost="Number(detail.bracelet.inboundCost)"
          :show-cost="auth.hasPermission('bracelet:cost:view')"
          :image-url="imageUrl"
          :image-error="imageError"
        />
      </div>

      <div class="desktop-two-column__aside">
        <LuxuryCard v-if="profit" gold data-testid="bracelet-profit-card">
          <div class="section-title">一物一账 · 利润面板</div>
          <ProfitPanel :rows="profitRows" />
          <div v-if="profit.summary?.isLoss" class="profit-loss">这件目前是亏的</div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">支出记录</div>
          <ExpenseItem
            v-for="e in detail.expenses"
            :key="e.id"
            :type="e.expenseType"
            :amount="Number(e.amount)"
            @click="router.push(`/expense/${e.id}`)"
          />
          <div v-if="!detail.expenses.length" class="muted">暂无</div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">销售记录</div>
          <div v-for="s in detail.sales" :key="s.id" class="detail-row" @click="router.push(`/sales/${s.id}`)">
            <span class="money">¥{{ Number(s.saleAmount).toFixed(2) }}</span>
            <span class="muted">{{ s.status }}</span>
          </div>
        </LuxuryCard>

        <LuxuryCard>
          <div class="section-title">成本调整</div>
          <div v-for="a in detail.costAdjustments" :key="a.id" class="detail-row">
            <span class="money">¥{{ Number(a.amount).toFixed(2) }}</span>
            <span class="muted">{{ a.reason }}</span>
          </div>
        </LuxuryCard>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.08);
  cursor: pointer;
}
.detail-row:last-child { border-bottom: none; }
.profit-line { padding: 8px 0; font-size: 14px; line-height: 1.5; }
.profit-loss { color: #ee0a24; font-weight: 600; margin-top: 8px; }
</style>
