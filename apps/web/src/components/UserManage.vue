<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'

const users = ref<any[]>([])
const loading = ref(false)

const statusLabels: Record<string, string> = {
  pending: '待审核',
  active: '正常',
  rejected: '已拒绝',
  disabled: '已禁用',
}

async function load() {
  loading.value = true
  try {
    const res = await api.get('/users')
    users.value = res.data.data.map((u: any) => ({
      ...u,
      _rolePick: u.roles?.includes('管理员') ? '管理员' : '员工',
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function approve(user: any) {
  const roleName = user._rolePick === '管理员' ? '管理员' : '员工'
  await api.post(`/users/${user.id}/approve`, { roleName })
  showToast('已通过审核')
  await load()
}

async function reject(user: any) {
  await showConfirmDialog({ title: '拒绝账号', message: `确定拒绝 ${user.username} 吗？` })
  await api.post(`/users/${user.id}/reject`)
  showToast('已拒绝')
  await load()
}

async function toggleDisable(user: any) {
  if (user.protected) {
    showToast('fanfan 管理员不能禁用')
    return
  }
  if (user.status === 'disabled') {
    await api.post(`/users/${user.id}/enable`)
    showToast('已启用')
  } else {
    await showConfirmDialog({ title: '禁用账号', message: `确定禁用 ${user.username} 吗？` })
    await api.post(`/users/${user.id}/disable`)
    showToast('已禁用')
  }
  await load()
}

async function editDisplayName(user: any) {
  const displayName = prompt('修改显示名', user.name)
  if (displayName === null || !displayName.trim()) return
  await api.patch(`/users/${user.id}`, { displayName: displayName.trim() })
  showToast('已更新')
  await load()
}

async function saveRole(user: any) {
  const roleName = user._rolePick === '管理员' ? '管理员' : '员工'
  const current = user.roles?.includes('管理员') ? '管理员' : '员工'
  if (roleName === current) {
    showToast('角色没变')
    return
  }
  if (user.protected && roleName !== '管理员') {
    showToast('fanfan 管理员不能降级')
    return
  }
  const label = roleName === '管理员' ? '管理员' : '员工'
  await showConfirmDialog({
    title: '调整权限',
    message: `确定把 ${user.username} 设为「${label}」吗？`,
  })
  try {
    await api.patch(`/users/${user.id}`, { roleName })
    showToast(`已设为${label}`)
    await load()
  } catch (err: any) {
    showToast(err.response?.data?.message || '改权限失败')
  }
}
</script>

<template>
  <div class="user-manage" data-testid="user-manage">
    <div class="section-title">员工账号管理</div>
    <van-loading v-if="loading" />
    <div v-for="user in users" :key="user.id" class="user-manage__item">
      <div class="user-manage__head">
        <strong>{{ user.name }}</strong>
        <span class="muted">@{{ user.username }}</span>
        <span class="user-manage__status">{{ statusLabels[user.status] || user.status }}</span>
      </div>
      <div class="muted user-manage__meta">
        注册：{{ user.createdAt?.slice(0, 10) || '-' }}
        <span v-if="user.approvedAt"> · 审核：{{ user.approvedAt?.slice(0, 10) }} {{ user.approvedBy?.name || '' }}</span>
      </div>
      <div class="user-manage__roles muted">角色：{{ user.roles?.join('、') || '未分配' }}</div>
      <div v-if="user.status === 'pending'" class="user-manage__actions">
        <select v-model="user._rolePick" class="user-manage__select">
          <option value="员工">员工</option>
          <option value="管理员">管理员</option>
        </select>
        <button type="button" @click="approve(user)">通过</button>
        <button type="button" class="danger" @click="reject(user)">拒绝</button>
      </div>
      <div v-else class="user-manage__actions">
        <div v-if="user.status === 'active' || user.status === 'disabled'" class="user-manage__role-row">
          <label class="user-manage__role-label muted">权限</label>
          <select
            v-model="user._rolePick"
            class="user-manage__select"
            :disabled="user.protected"
            data-testid="user-role-select"
          >
            <option value="员工">员工</option>
            <option value="管理员">管理员</option>
          </select>
          <button
            type="button"
            data-testid="user-role-save"
            :disabled="user.protected && user._rolePick !== '管理员'"
            @click="saveRole(user)"
          >
            保存权限
          </button>
        </div>
        <button type="button" @click="editDisplayName(user)">改显示名</button>
        <button v-if="!user.protected" type="button" @click="toggleDisable(user)">
          {{ user.status === 'disabled' ? '启用' : '禁用' }}
        </button>
        <span v-else class="muted">受保护管理员</span>
      </div>
    </div>
    <p v-if="!users.length && !loading" class="muted">暂无员工账号</p>
  </div>
</template>

<style scoped>
.user-manage__item {
  padding: 14px 0;
  border-bottom: 1px solid rgba(198, 161, 91, 0.1);
}
.user-manage__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.user-manage__status {
  font-size: 12px;
  color: var(--color-gold);
}
.user-manage__meta, .user-manage__roles {
  margin-top: 4px;
  font-size: 12px;
}
.user-manage__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  align-items: center;
}
.user-manage__role-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.user-manage__role-label {
  font-size: 12px;
}
.user-manage__actions button,
.user-manage__select {
  border: 1px solid rgba(198, 161, 91, 0.35);
  background: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
}
.user-manage__actions .danger {
  color: var(--color-danger);
}
</style>
