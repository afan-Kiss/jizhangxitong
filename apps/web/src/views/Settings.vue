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
import UserManage from '../components/UserManage.vue'
import { loginPath } from '../utils/base-path'
import { useBreakpoint } from '../composables/useBreakpoint'

const router = useRouter()
const { isDesktop } = useBreakpoint()
const auth = useAuthStore()
const canManagePermission = computed(() => auth.hasPermission('permission:manage'))
const settings = ref<any>({})
const workerStatus = ref<any>({})
const qianfanEnabled = ref(false)
const healthInfo = ref<any>({})
const scanStatus = ref<any>({})

onMounted(async () => {
  await auth.fetchMe()
  await auth.fetchWorkerStatus()
  const [settingsRes, workerRes, healthRes, scanRes] = await Promise.all([
    api.get('/settings'),
    api.get('/worker/status'),
    api.get('/health'),
    api.get('/scan/status'),
  ])
  settings.value = settingsRes.data.data.settings
  workerStatus.value = workerRes.data.data
  healthInfo.value = healthRes.data
  scanStatus.value = scanRes.data.data || {}
  qianfanEnabled.value = !!settingsRes.data.data.qianfanOrderLinkEnabled
})

async function saveQianfanTemplate() {
  const current = settings.value.qianfan_order_detail_url_template || ''
  const value = prompt(
    '千帆订单详情链接模板（用 {orderNo} 代替订单号）\n示例：https://xxx/order/detail?orderNo={orderNo}',
    current,
  )
  if (value === null) return
  await api.patch('/settings/qianfan_order_detail_url_template', { value })
  settings.value.qianfan_order_detail_url_template = value
  qianfanEnabled.value = value.includes('{orderNo}')
  showToast('千帆链接已保存')
}

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
    <div class="show-mobile-only">
      <WorkerStatus :status="workerStatus" />
    </div>

    <LuxuryCard gold data-testid="settings-system-status">
      <div class="section-title">系统状态</div>
      <van-cell title="版本号" :value="healthInfo.version || '未知'" data-testid="settings-app-version" />
      <van-cell title="扫码工作台" :value="healthInfo.scanWorkbenchEnabled ? '已启用' : '未启用'" />
      <van-cell title="7789 扫码枪" :value="scanStatus.scannerOnline ? '已连接' : '未连接'" data-testid="settings-scanner-status" />
      <van-cell title="Worker" :value="workerStatus.uploadChannelReady ? '上传可用' : '未连接'" data-testid="settings-worker-status" />
    </LuxuryCard>

    <div class="settings-grid desktop-grid-2">
    <LuxuryCard>
      <div class="section-title">手机快捷入口</div>
      <p class="mobile-tip muted">
        可以把本页面添加到手机桌面，方便随时记账：浏览器菜单 →「添加到主屏幕」或「添加桌面快捷方式」。
      </p>
    </LuxuryCard>

    <LuxuryCard gold data-testid="settings-qianfan-card">
      <div class="section-title">千帆订单跳转</div>
      <p class="settings-hint muted">
        配置后，支出/销售详情可直接打开千帆查订单。模板里用 <code>{orderNo}</code> 代替小红书订单号。
      </p>
      <van-cell
        title="链接模板"
        :value="settings.qianfan_order_detail_url_template || '未配置'"
        is-link
        data-testid="settings-qianfan-template"
        @click="saveQianfanTemplate"
      />
      <p v-if="!qianfanEnabled" class="settings-hint muted">未配置时，页面会提示「先复制订单号去千帆查」</p>
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

    <LuxuryCard>
      <van-cell title="操作日志" is-link @click="router.push('/logs')" />
      <van-cell title="报销导出" is-link @click="router.push('/expense/export')" />
    </LuxuryCard>

    <LuxuryCard v-if="canManagePermission" gold data-testid="settings-user-manage">
      <UserManage />
    </LuxuryCard>

    <PermissionManage v-if="canManagePermission" />
    </div>

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
.mobile-tip {
  margin: 0;
  padding: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
}
.settings-hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
}
.settings-hint code {
  font-size: 12px;
  background: rgba(198, 161, 91, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
}
@media (min-width: 1200px) {
  .settings-grid :deep(.van-cell-group) {
    border-radius: var(--radius-card);
  }
}
</style>
