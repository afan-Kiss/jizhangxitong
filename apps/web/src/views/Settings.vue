<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import AppShell from '../components/AppShell.vue'
import LuxuryCard from '../components/LuxuryCard.vue'
import PermissionManage from '../components/PermissionManage.vue'
import UserManage from '../components/UserManage.vue'
import { loginPath } from '../utils/base-path'

const router = useRouter()
const auth = useAuthStore()
const canViewLogs = computed(() => auth.hasPermission('log:view'))
const canManagePermission = computed(() => auth.hasPermission('permission:manage'))
const settings = ref<any>({})
const qianfanEnabled = ref(false)
const healthInfo = ref<any>({})

onMounted(async () => {
  await auth.fetchMe()
  const [settingsRes, healthRes] = await Promise.all([
    api.get('/settings'),
    api.get('/health'),
  ])
  settings.value = settingsRes.data.data.settings
  healthInfo.value = healthRes.data
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

function logout() {
  auth.logout()
  router.push(loginPath())
}
</script>

<template>
  <AppShell>
    <header class="settings-hero">
      <h1>我的</h1>
      <p class="muted">账号、系统配置与权限管理</p>
    </header>
    <LuxuryCard gold data-testid="settings-system-status">
      <div class="section-title">系统状态</div>
      <van-cell title="版本号" :value="healthInfo.version || '未知'" data-testid="settings-app-version" />
    </LuxuryCard>

    <div class="settings-grid desktop-grid-2">
      <LuxuryCard gold data-testid="settings-qianfan-card">
        <div class="section-title">千帆订单跳转</div>
        <p class="settings-hint muted">
          配置后，支出详情可直接打开千帆查订单。模板里用 <code>{orderNo}</code> 代替小红书订单号。
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

      <LuxuryCard v-if="canViewLogs">
        <van-cell title="操作日志" is-link @click="router.push('/logs')" />
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
  border: 1px solid #e7ddc8;
  border-radius: 12px;
  background: #fff;
  color: var(--color-text-sub);
  font-size: 15px;
  cursor: pointer;
}
.settings-hero {
  margin-bottom: 16px;
}
.settings-hero h1 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
}
.settings-hint code {
  font-size: 12px;
  color: var(--color-gold-deep);
}
</style>
