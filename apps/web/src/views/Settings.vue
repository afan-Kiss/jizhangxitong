<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import WorkerStatus from '../components/WorkerStatus.vue'
import PermissionManage from '../components/PermissionManage.vue'
import { loginPath } from '../utils/base-path'

const router = useRouter()
const auth = useAuthStore()
const canManagePermission = computed(() => auth.hasPermission('permission:manage'))
const settings = ref<any>({})
const workerStatus = ref<any>({})
const trialPreview = ref<any>(null)

async function loadTrial() {
  const res = await api.get('/trial/status')
  trialPreview.value = res.data.data.preview
}

async function toggleTrialMode() {
  const next = settings.value.trial_mode_enabled === 'true' ? 'false' : 'true'
  await api.patch('/settings/trial_mode_enabled', { value: next })
  settings.value.trial_mode_enabled = next
  showToast(next === 'true' ? '已开启试用模式' : '已关闭试用模式')
  await loadTrial()
}

async function cleanupTrial() {
  if (!confirm('确定清理所有试用数据？支出将作废、销售将退款，不删本地图片。')) return
  const res = await api.post('/trial/cleanup')
  showToast(`已清理 ${res.data.data.expensesVoided.length} 笔支出`)
  await loadTrial()
}

async function promoteTrial() {
  if (!confirm('确定将全部试用数据转为正式？')) return
  const res = await api.post('/trial/promote', { all: true })
  showToast(`已转正式：${res.data.data.expenseCount} 笔支出`)
  await loadTrial()
}

onMounted(async () => {
  await auth.fetchMe()
  await auth.fetchWorkerStatus()
  const [settingsRes, workerRes] = await Promise.all([
    api.get('/settings'),
    api.get('/local-worker/status'),
  ])
  settings.value = settingsRes.data.data.settings
  workerStatus.value = workerRes.data.data
  await loadTrial()
})

async function saveSetting(key: string, label: string) {
  const value = prompt(`修改 ${label}`, settings.value[key])
  if (value === null || value === '') return
  await api.patch(`/settings/${key}`, { value })
  showToast('已保存')
  const res = await api.get('/settings')
  settings.value = res.data.data.settings
}

async function toggleWorker() {
  const next = settings.value.local_worker_enabled === 'true' ? 'false' : 'true'
  await api.patch('/settings/local_worker_enabled', { value: next })
  settings.value.local_worker_enabled = next
}

function logout() {
  auth.logout()
  router.push(loginPath())
}
</script>

<template>
  <AppShell title="我的">
    <WorkerStatus :online="workerStatus.online" />

    <LuxuryCard>
      <div class="section-title">手机快捷入口</div>
      <p class="mobile-tip muted">
        可以把本页面添加到手机桌面，方便随时记账：浏览器菜单 →「添加到主屏幕」或「添加桌面快捷方式」。
      </p>
    </LuxuryCard>

    <LuxuryCard gold>
      <div class="section-title">扫码枪对接</div>
      <van-cell title="API 地址" :value="settings.scanner_api_base_url" is-link @click="saveSetting('scanner_api_base_url', 'API 地址')" />
      <van-cell title="启用 Worker">
        <template #value>
          <van-switch :model-value="settings.local_worker_enabled === 'true'" size="20" @update:model-value="toggleWorker" />
        </template>
      </van-cell>
      <van-cell title="查询超时" :value="`${settings.scanner_sync_timeout || 8} 秒`" is-link @click="saveSetting('scanner_sync_timeout', '超时秒数')" />
    </LuxuryCard>

    <LuxuryCard>
      <div class="section-title">成本配置</div>
      <van-cell title="证书费" :value="`¥${settings.default_certificate_fee}`" is-link @click="saveSetting('default_certificate_fee', '证书费')" />
      <van-cell title="包装盒费" :value="`¥${settings.default_package_fee}`" is-link @click="saveSetting('default_package_fee', '包装盒费')" />
      <van-cell title="顺丰快递费" :value="`¥${settings.default_sf_express_fee}`" is-link @click="saveSetting('default_sf_express_fee', '快递费')" />
    </LuxuryCard>

    <LuxuryCard gold>
      <div class="section-title">试用模式</div>
      <van-cell title="开启试用模式">
        <template #value>
          <van-switch :model-value="settings.trial_mode_enabled === 'true'" size="20" @update:model-value="toggleTrialMode" />
        </template>
      </van-cell>
      <van-cell title="试用流程说明" is-link @click="router.push('/trial-guide')" />
      <div v-if="trialPreview" class="trial-stats muted">
        待处理试用：{{ trialPreview.expenseCount }} 笔支出 ¥{{ trialPreview.expenseAmount?.toFixed?.(2) || trialPreview.expenseAmount }}，
        {{ trialPreview.saleCount }} 笔销售
      </div>
      <div class="trial-btns">
        <van-button size="small" type="warning" plain @click="cleanupTrial">清理试用数据</van-button>
        <van-button size="small" type="primary" plain @click="promoteTrial">试用转正式</van-button>
      </div>
    </LuxuryCard>

    <LuxuryCard>
      <van-cell title="操作日志" is-link @click="router.push('/logs')" />
      <van-cell title="未报销列表" is-link @click="router.push('/reimbursements')" />
      <van-cell title="报销导出" is-link @click="router.push('/expense/export')" />
    </LuxuryCard>

    <PermissionManage v-if="canManagePermission" />

    <div style="padding:8px 0 24px">
      <button class="logout-btn" @click="logout">退出登录</button>
    </div>
  </AppShell>
</template>

<style scoped>
.logout-btn {
  width: 100%;
  height: 46px;
  border-radius: var(--radius-btn);
  border: 1px solid rgba(111, 119, 114, 0.2);
  background: transparent;
  color: var(--color-text-sub);
  font-size: 15px;
}
.logout-btn:active { transform: scale(0.97); }
.trial-stats { padding: 8px 16px; font-size: 13px; }
.trial-btns { display: flex; gap: 8px; padding: 8px 16px 12px; }
.mobile-tip {
  margin: 0;
  padding: 0 16px 14px;
  font-size: 13px;
  line-height: 1.55;
}
</style>
