<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { braceletImageUrl } from '../api'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import BraceletCard from '../components/BraceletCard.vue'
import ExpenseItem from '../components/ExpenseItem.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const detail = ref<any>(null)
const imageUrl = ref('')
const imageError = ref('')

onMounted(async () => {
  try {
    const res = await api.get(`/bracelets/${route.params.code}`)
    const b = res.data.data
    if (b.notSynced || !b.id) {
      const synced = await api.get(`/bracelets/${b.braceletCode}`)
      b.id = synced.data.data.id
    }
    const d = await api.get(`/bracelets/detail/${b.id}`)
    detail.value = d.data.data
    if (detail.value.bracelet.hasImage) {
      imageUrl.value = braceletImageUrl(detail.value.bracelet.id)
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || '加载失败')
    router.back()
  }
})

function onImageError() {
  imageError.value = '本地电脑未连接，暂时无法查看镯子图片。'
  imageUrl.value = ''
}
</script>

<template>
  <AppShell
    v-if="detail"
    :title="detail.bracelet.braceletCode"
    show-back
    no-tab-pad
    @back="router.back()"
  >
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
</style>
