<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import api from '../api'
import { PERMISSION_LABELS, PERMISSIONS } from '@jade-account/shared'
import LuxuryCard from '../components/LuxuryCard.vue'

const GROUP_LABELS: Record<string, string> = {
  expense: '支出',
  setting: '系统设置',
  log: '日志',
  permission: '权限管理',
}

const users = ref<any[]>([])
const roles = ref<any[]>([])
const permissions = ref<any[]>([])
const selectedRoleId = ref<number | null>(null)
const selectedUserId = ref<number | null>(null)
const roleForm = ref({ name: '', description: '', permissionIds: [] as number[] })
const saving = ref(false)
const showRoleMeta = ref(false)
const userAssignExpanded = ref(false)
const userSheetVisible = ref(false)
const expandedGroups = ref<Set<string>>(new Set())

const permissionLabel = (code: string) => PERMISSION_LABELS[code] || code

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value))
const selectedUser = computed(() => users.value.find((u) => u.id === selectedUserId.value))

const permissionGroups = computed(() => {
  const map = new Map<string, any[]>()
  for (const p of permissions.value) {
    const key = p.code.split(':')[0]
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: GROUP_LABELS[key] || key,
    items,
  }))
})

const selectedPermissionCount = computed(() => roleForm.value.permissionIds.length)
const totalPermissionCount = computed(() => permissions.value.length)

onMounted(loadAll)

async function loadAll() {
  const [u, r, p] = await Promise.all([
    api.get('/permissions/users'),
    api.get('/permissions/roles'),
    api.get('/permissions/permissions'),
  ])
  users.value = u.data.data
  roles.value = r.data.data
  permissions.value = p.data.data.filter((item: { code: string }) =>
    (PERMISSIONS as readonly string[]).includes(item.code),
  )
  if (!selectedRoleId.value && roles.value.length) selectRole(roles.value[0].id)
}

function syncExpandedGroups() {
  expandedGroups.value = new Set()
}

function selectRole(id: number) {
  selectedRoleId.value = id
  const role = roles.value.find((r) => r.id === id)
  roleForm.value = {
    name: role?.name || '',
    description: role?.description || '',
    permissionIds: role?.rolePermissions?.map((rp: any) => rp.permissionId) || [],
  }
  showRoleMeta.value = false
  syncExpandedGroups()
}

function toggleGroup(key: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}

function groupSelectedCount(items: { id: number }[]) {
  return items.filter((p) => roleForm.value.permissionIds.includes(p.id)).length
}

function isGroupExpanded(key: string) {
  return expandedGroups.value.has(key)
}

function togglePermission(pid: number, checked: boolean) {
  const set = new Set(roleForm.value.permissionIds)
  if (checked) set.add(pid)
  else set.delete(pid)
  roleForm.value.permissionIds = [...set]
}

function setGroupAll(items: { id: number }[], checked: boolean) {
  const set = new Set(roleForm.value.permissionIds)
  for (const p of items) {
    if (checked) set.add(p.id)
    else set.delete(p.id)
  }
  roleForm.value.permissionIds = [...set]
}

async function saveRole() {
  if (!selectedRoleId.value) return
  saving.value = true
  try {
    await api.patch(`/permissions/roles/${selectedRoleId.value}`, {
      name: roleForm.value.name,
      description: roleForm.value.description,
      permissionIds: roleForm.value.permissionIds,
    })
    showToast('角色权限已保存')
    await loadAll()
    selectRole(selectedRoleId.value!)
  } finally {
    saving.value = false
  }
}

async function saveUserRoles() {
  if (!selectedUserId.value) return
  const user = selectedUser.value
  const roleIds = user?._selectedRoleIds || user?.userRoles?.map((ur: any) => ur.roleId) || []
  saving.value = true
  try {
    await api.post(`/permissions/users/${selectedUserId.value}/roles`, { roleIds })
    showToast('用户角色已更新')
    userSheetVisible.value = false
    selectedUserId.value = null
    await loadAll()
  } finally {
    saving.value = false
  }
}

function onUserRoleChange(user: any, roleId: number, checked: boolean) {
  const ids = new Set(user._selectedRoleIds || user.userRoles?.map((ur: any) => ur.roleId) || [])
  if (checked) ids.add(roleId)
  else ids.delete(roleId)
  user._selectedRoleIds = [...ids]
}

function openUserAssign(userId: number) {
  selectedUserId.value = userId
  userSheetVisible.value = true
}

watch(permissionGroups, () => {
  if (selectedRoleId.value) syncExpandedGroups()
})

function expandAllGroups() {
  expandedGroups.value = new Set(permissionGroups.value.map((g) => g.key))
}

function collapseAllGroups() {
  expandedGroups.value = new Set()
}
</script>

<template>
  <LuxuryCard gold data-testid="permission-manage-card">
    <div class="perm-head">
      <div>
        <div class="section-title">角色权限管理</div>
        <p class="perm-head__meta muted">
          {{ selectedRole?.name || '未选择' }} · 已选 {{ selectedPermissionCount }}/{{ totalPermissionCount }} 项
        </p>
      </div>
      <div class="perm-head__actions">
        <button type="button" class="perm-link" @click="expandAllGroups">全部展开</button>
        <button type="button" class="perm-link" @click="collapseAllGroups">全部收起</button>
      </div>
    </div>

    <div class="chip-row">
      <button
        v-for="r in roles"
        :key="r.id"
        type="button"
        class="chip"
        :class="{ active: selectedRoleId === r.id }"
        @click="selectRole(r.id)"
      >
        {{ r.name }}
      </button>
    </div>

    <button type="button" class="perm-meta-toggle" @click="showRoleMeta = !showRoleMeta">
      <span>编辑角色名称与说明</span>
      <span class="perm-meta-toggle__icon">{{ showRoleMeta ? '▾' : '▸' }}</span>
    </button>
    <div v-show="showRoleMeta" class="perm-meta-fields">
      <van-field v-model="roleForm.name" label="角色名称" />
      <van-field v-model="roleForm.description" label="说明" />
    </div>

    <div class="perm-groups">
      <section v-for="group in permissionGroups" :key="group.key" class="perm-group">
        <button type="button" class="perm-group__head" @click="toggleGroup(group.key)">
          <span class="perm-group__title">
            <span class="perm-group__chevron">{{ isGroupExpanded(group.key) ? '▾' : '▸' }}</span>
            {{ group.label }}
          </span>
          <span class="perm-group__count">
            {{ groupSelectedCount(group.items) }}/{{ group.items.length }}
          </span>
        </button>

        <div v-show="isGroupExpanded(group.key)" class="perm-group__body">
          <div class="perm-group__toolbar">
            <button type="button" class="perm-link" @click.stop="setGroupAll(group.items, true)">全选</button>
            <button type="button" class="perm-link" @click.stop="setGroupAll(group.items, false)">清空</button>
          </div>
          <div class="perm-grid">
            <label
              v-for="p in group.items"
              :key="p.id"
              class="perm-item"
              :class="{ 'perm-item--on': roleForm.permissionIds.includes(p.id) }"
            >
              <van-checkbox
                :model-value="roleForm.permissionIds.includes(p.id)"
                icon-size="16px"
                @update:model-value="(v: boolean) => togglePermission(p.id, v)"
                @click.stop
              />
              <span class="perm-item__label">{{ permissionLabel(p.code) }}</span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <van-button block type="primary" :loading="saving" class="save-btn" @click="saveRole">保存角色权限</van-button>
  </LuxuryCard>

  <LuxuryCard data-testid="permission-user-assign-card">
    <button type="button" class="perm-assign-toggle" @click="userAssignExpanded = !userAssignExpanded">
      <span class="section-title">用户角色分配</span>
      <span class="perm-assign-toggle__hint muted">{{ users.length }} 人 · 高级</span>
      <span class="perm-meta-toggle__icon">{{ userAssignExpanded ? '▾' : '▸' }}</span>
    </button>

    <div v-show="userAssignExpanded" class="perm-assign">
      <p class="perm-assign__tip muted">日常审核在上方「用户管理」即可；此处用于一人多角色等特殊情况。</p>
      <div class="perm-user-list">
        <button
          v-for="u in users"
          :key="u.id"
          type="button"
          class="perm-user"
          :class="{ active: selectedUserId === u.id }"
          @click="openUserAssign(u.id)"
        >
          <span class="perm-user__name">{{ u.name }}</span>
          <span class="perm-user__sub">{{ u.username }}</span>
        </button>
      </div>

      <van-popup
        v-model:show="userSheetVisible"
        position="bottom"
        round
        :style="{ maxHeight: '72vh' }"
        @closed="selectedUserId = null"
      >
        <div v-if="selectedUser" class="perm-user-sheet">
          <div class="perm-user-sheet__title">为 {{ selectedUser.name }} 分配角色</div>
          <van-checkbox-group>
            <van-cell v-for="r in roles" :key="r.id" :title="r.name" clickable @click="onUserRoleChange(selectedUser, r.id, !(selectedUser._selectedRoleIds || selectedUser.userRoles?.map((ur: any) => ur.roleId)).includes(r.id))">
              <template #right-icon>
                <van-checkbox
                  :model-value="(selectedUser._selectedRoleIds || selectedUser.userRoles?.map((ur: any) => ur.roleId)).includes(r.id)"
                  @update:model-value="(v: boolean) => onUserRoleChange(selectedUser, r.id, v)"
                  @click.stop
                />
              </template>
            </van-cell>
          </van-checkbox-group>
          <van-button block type="primary" :loading="saving" class="save-btn" @click="saveUserRoles">保存用户角色</van-button>
        </div>
      </van-popup>
    </div>
  </LuxuryCard>
</template>

<style scoped>
.perm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.perm-head__meta {
  margin: 4px 0 0;
  font-size: 12px;
}
.perm-head__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.perm-link {
  border: none;
  background: transparent;
  color: var(--color-gold);
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.chip {
  border: 1px solid rgba(111, 119, 114, 0.2);
  background: transparent;
  border-radius: 16px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.chip.active {
  background: var(--color-gold-soft);
  border-color: var(--color-gold);
}
.perm-meta-toggle,
.perm-assign-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: rgba(111, 119, 114, 0.06);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.perm-meta-toggle__icon {
  margin-left: auto;
  color: var(--color-text-sub);
  font-size: 12px;
}
.perm-meta-fields {
  margin-top: 8px;
}
.perm-meta-fields :deep(.van-field) {
  padding: 8px 0;
}
.perm-groups {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.perm-group {
  border: 1px solid rgba(111, 119, 114, 0.14);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.35);
}
.perm-group__head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
}
.perm-group__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.perm-group__chevron {
  color: var(--color-text-sub);
  font-size: 12px;
  width: 12px;
}
.perm-group__count {
  font-size: 12px;
  color: var(--color-text-sub);
  background: rgba(111, 119, 114, 0.1);
  border-radius: 999px;
  padding: 2px 8px;
}
.perm-group__body {
  padding: 0 10px 10px;
  border-top: 1px solid rgba(111, 119, 114, 0.1);
}
.perm-group__toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 8px 2px 6px;
}
.perm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
@media (min-width: 768px) {
  .perm-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.perm-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(111, 119, 114, 0.12);
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  min-height: 44px;
}
.perm-item--on {
  border-color: rgba(198, 161, 91, 0.45);
  background: rgba(198, 161, 91, 0.08);
}
.perm-item__label {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text);
}
.save-btn {
  margin-top: 16px;
}
.perm-assign-toggle .section-title {
  margin: 0;
}
.perm-assign-toggle__hint {
  font-size: 12px;
}
.perm-assign {
  margin-top: 12px;
}
.perm-assign__tip {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
}
.perm-user-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.perm-user {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 96px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(111, 119, 114, 0.16);
  background: transparent;
  cursor: pointer;
}
.perm-user.active {
  border-color: var(--color-gold);
  background: var(--color-gold-soft);
}
.perm-user__name {
  font-size: 13px;
  font-weight: 600;
}
.perm-user__sub {
  font-size: 11px;
  color: var(--color-text-sub);
}
.perm-user-sheet {
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}
.perm-user-sheet__title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}
</style>
