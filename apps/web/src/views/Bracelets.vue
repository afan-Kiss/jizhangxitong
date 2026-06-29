<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import BraceletCard from '../components/BraceletCard.vue'
import BraceletIcon from '../components/BraceletIcon.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import ActionButton from '../components/ActionButton.vue'
import { useBreakpoint } from '../composables/useBreakpoint'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const auth = useAuthStore()
const keyword = ref('')
const items = ref<any[]>([])
const found = ref<any>(null)
const searching = ref(false)
const shake = ref(false)
const highlight = ref(false)

onMounted(async () => {
  await auth.fetchWorkerStatus()
})

async function search() {
  if (!keyword.value.trim()) return
  searching.value = true
  shake.value = false
  highlight.value = false
  found.value = null
  try {
    const res = await api.get(`/bracelets/search?q=${encodeURIComponent(keyword.value)}`)
    items.value = res.data.data
  } finally {
    searching.value = false
  }
}

async function queryCode() {
  if (!keyword.value.trim()) return
  searching.value = true
  shake.value = false
  highlight.value = false
  found.value = null
  try {
    const res = await api.get(`/bracelets/${keyword.value}`)
    found.value = res.data.data
    highlight.value = true
    setTimeout(() => router.push(`/bracelets/${found.value.braceletCode}`), 600)
  } catch (err: any) {
    shake.value = true
    showToast(err.response?.data?.message || '没在扫码枪系统找到这只镯子，先检查编号有没有扫错。')
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <AppShell title="镯子查询">
    <div class="desktop-two-column bracelets-page">
      <div class="desktop-two-column__main">
        <WorkerStatus :status="auth.workerStatus" compact />

        <div class="search-bar" :class="{ 'shake-soft': shake }">
          <van-search
            v-model="keyword"
            placeholder="输入或扫码镯子编号"
            shape="round"
            background="transparent"
            @search="queryCode"
          />
          <span v-if="searching" class="search-bar__loading">
            <span class="search-bar__ring" />
          </span>
        </div>

        <div class="search-actions">
          <ActionButton @click="queryCode">精确查询</ActionButton>
          <ActionButton variant="secondary" @click="search">模糊搜索</ActionButton>
        </div>

        <BraceletCard
          v-if="found"
          :code="found.braceletCode"
          :status="found.scannerStatus"
          :inbound-at="found.inboundAt"
          :inbound-cost="Number(found.inboundCost)"
          :show-cost="auth.hasPermission('bracelet:cost:view')"
          :highlight="highlight"
        />

        <LuxuryCard v-else-if="!searching && !keyword">
          <div class="bracelets-empty">
            <BraceletIcon :size="48" />
            <p>输入或扫描镯子编号，从扫码枪同步和田玉镯子信息</p>
          </div>
        </LuxuryCard>
      </div>

      <div class="desktop-two-column__aside">
        <LuxuryCard v-if="items.length">
          <div class="section-title">搜索结果</div>
          <div
            v-for="item in items"
            :key="item.braceletCode"
            @click="router.push(`/bracelets/${item.braceletCode}`)"
          >
            <BraceletCard
              :code="item.braceletCode"
              :status="item.scannerStatus"
              :inbound-cost="Number(item.inboundCost)"
              :show-cost="auth.hasPermission('bracelet:cost:view')"
              :not-synced="item.notSynced"
            />
          </div>
        </LuxuryCard>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.search-bar { position: relative; margin: 0 -8px 8px; }
.search-bar__loading {
  position: absolute;
  right: 52px;
  top: 50%;
  transform: translateY(-50%);
}
.search-bar__ring {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(198, 161, 91, 0.2);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: spin-soft 0.7s linear infinite;
}
.search-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.search-actions .action-btn { flex: 1; }
:deep(.van-search__content) {
  background: var(--color-card) !important;
  border: var(--border-gold);
}
.bracelets-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;
  color: var(--color-text-sub);
  font-size: 13px;
  line-height: 1.5;
}
.bracelets-empty p { margin: 0; }
</style>
